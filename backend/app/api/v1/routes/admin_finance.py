"""Admin-Endpoint fuer Finance: Abrechnungsbasis aus echten Ad-Impressions.

GET /api/admin/finance aggregiert das append-only Impression-Archiv im
Object Brain (pipeline/ads/impressions/<yyyymmdd>/<id>.json):

- Tages-Zaehler (14 Tage) aus den Objekt-KEYS — kein Laden der Objekte noetig
- Top-Profile (slug) und Top-Creator (creatorSub) der letzten 7 Tage aus den
  Objekt-Inhalten (begrenzt auf RECENT_LOAD_LIMIT Objekte)
- Gesamt-Zaehler ueber alle archivierten Tage

Nur fuer Sessions mit admin:read (Rollen admin/owner). Read-only.

Bewusst ehrlich: USD-Einnahmen liegen ausschliesslich im AdSense-Dashboard
(dafuer gibt es keine API-Anbindung — Free-only-Regel). Der Inhaber traegt
finalisierte Monats-Einnahmen per POST /api/admin/finance/revenue ein
(CSRF-pflichtig, auditiert); GET berechnet daraus die 25%-Payouts pro-rata
nach Impressions-Anteil des Monats. Auszahlungs-Workflows (KYC, Transfer)
existieren noch nicht — hier entsteht nur die rechnungsfaehige Basis.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.v1.routes.admin_quality import _require_admin
from app.api.v1.routes.auth import _session_from_request
from app.core.config import settings
from app.integrations import audit_store
from app.integrations.feedback_store import _client, storage_configured

router = APIRouter(prefix="/admin", tags=["admin"])

#: Tages-Buckets in der Admin-Sicht.
DAY_BUCKETS = 14
#: Objekt-Inhalte (slug/creatorSub) nur fuer die letzten 7 Tage laden.
RECENT_DAYS = 7
#: Obergrenze geladener Einzelobjekte pro Anfrage (Schutz vor Riesenlisten).
RECENT_LOAD_LIMIT = 2000
#: Nutzer-Beteiligung an gueltigen Einnahmen (Produktregel, %).
USER_SHARE_PERCENT = 25


def _day_counts_from_keys() -> tuple[dict[str, int], int]:
    """Zaehlt Impressions pro Tag rein ueber Objekt-Keys (kein Objekt-Laden)."""
    client = _client()
    per_day: dict[str, int] = {}
    total = 0
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(
        Bucket=settings.idrive_e2_bucket, Prefix="pipeline/ads/impressions/"
    ):
        for item in page.get("Contents", []) or []:
            key = str(item.get("Key", ""))
            # pipeline/ads/impressions/<yyyymmdd>/<uuid>.json
            parts = key.split("/")
            day = parts[3] if len(parts) >= 5 else ""
            if day:
                per_day[day] = per_day.get(day, 0) + 1
                total += 1
    return per_day, total


def _recent_details(day_keys: list[str]) -> tuple[dict[str, int], dict[str, int], int]:
    """Laedt Einzelobjekte gegebener Tage; zaehlt slug/creatorSub."""
    client = _client()
    by_slug: dict[str, int] = {}
    by_creator: dict[str, int] = {}
    loaded = 0
    for key in day_keys[:RECENT_LOAD_LIMIT]:
        try:
            response = client.get_object(Bucket=settings.idrive_e2_bucket, Key=key)
            body = json.loads(response["Body"].read().decode("utf-8"))
        except Exception:  # noqa: BLE001, S112 — kaputtes Archiv-Objekt ueberspringen
            continue
        loaded += 1
        slug = body.get("slug")
        if isinstance(slug, str) and slug:
            by_slug[slug] = by_slug.get(slug, 0) + 1
        creator = body.get("creatorSub")
        if isinstance(creator, str) and creator:
            by_creator[creator] = by_creator.get(creator, 0) + 1
    return by_slug, by_creator, loaded


def _collect_recent_keys(per_day: dict[str, int], today: datetime) -> list[str]:
    """Keys der letzten RECENT_DAYS Tage (Listen-Call pro Tag-Präfix)."""
    client = _client()
    keys: list[str] = []
    for offset in range(RECENT_DAYS):
        day = (today - timedelta(days=offset)).strftime("%Y%m%d")
        prefix = f"pipeline/ads/impressions/{day}/"
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=prefix):
            for item in page.get("Contents", []) or []:
                keys.append(str(item.get("Key", "")))
    return keys


@router.get("/finance")
async def admin_finance(request: Request) -> dict[str, Any]:
    denied = _require_admin(request)
    if denied is not None:
        return denied  # type: ignore[return-value]

    if not storage_configured():
        return {
            "ok": True,
            "source": "unavailable",
            "counts": {"totalImpressions": 0, "recent7d": 0, "today": 0, "userSharePercent": USER_SHARE_PERCENT},
            "days": [],
            "topProfiles": [],
            "topCreators": [],
            "generatedAt": int(time.time() * 1000),
        }

    try:
        per_day, total = await asyncio.to_thread(_day_counts_from_keys)
        source = "idrive-e2"
    except Exception:  # noqa: BLE001 — e2 nicht erreichbar: ehrlich leere Antwort
        per_day, total = {}, 0
        source = "unavailable"

    today = datetime.now(UTC)
    top_profiles: list[dict[str, Any]] = []
    top_creators: list[dict[str, Any]] = []
    recent_7d = 0
    if source == "idrive-e2":
        try:
            keys = await asyncio.to_thread(_collect_recent_keys, per_day, today)
            recent_7d = len(keys)
            by_slug, by_creator, _loaded = await asyncio.to_thread(_recent_details, keys)
            top_profiles = sorted(
                ({"slug": slug, "impressions": count} for slug, count in by_slug.items()),
                key=lambda row: -row["impressions"],
            )[:10]
            top_creators = sorted(
                ({"creatorSub": sub, "impressions": count} for sub, count in by_creator.items()),
                key=lambda row: -row["impressions"],
            )[:10]
        except Exception:  # noqa: BLE001 — Detail-Load gescheitert: nur Zaehler
            recent_7d = sum(
                per_day.get((today - timedelta(days=offset)).strftime("%Y%m%d"), 0)
                for offset in range(RECENT_DAYS)
            )

    days = []
    for offset in range(DAY_BUCKETS - 1, -1, -1):
        day = (today - timedelta(days=offset)).strftime("%Y%m%d")
        days.append({"date": day, "impressions": per_day.get(day, 0)})

    revenue_entries: list[dict[str, Any]] = []
    payout_records_all: list[dict[str, Any]] = []
    payout_basis: dict[str, Any] | None = None
    if source == "idrive-e2":
        try:
            revenue_entries = await asyncio.to_thread(list_revenue_entries, 12)
            payout_records_all = await asyncio.to_thread(list_payout_records, 12)
            if revenue_entries:
                latest = revenue_entries[0]
                payout_basis = await asyncio.to_thread(
                    _month_payouts,
                    latest["month"],
                    latest.get("adsenseCents", 0),
                    latest.get("invalidTrafficCents", 0),
                )
                payout_records = await asyncio.to_thread(list_payout_records, 12)
                paid = next(
                    (r for r in payout_records if r.get("month") == latest["month"]), None
                )
                if paid:
                    payout_basis["paid"] = {
                        "paidAt": paid.get("paidAt"),
                        "paidBy": paid.get("paidBy"),
                        "note": paid.get("note"),
                    }
        except Exception:  # noqa: BLE001 — Revenue-Teil ist optional
            revenue_entries = []

    return {
        "ok": True,
        "source": source,
        "counts": {
            "totalImpressions": total,
            "recent7d": recent_7d,
            "today": per_day.get(today.strftime("%Y%m%d"), 0),
            "userSharePercent": USER_SHARE_PERCENT,
        },
        "days": days,
        "topProfiles": top_profiles,
        "topCreators": top_creators,
        "revenue": revenue_entries,
        "payoutRecords": payout_records_all,
        "payoutBasis": payout_basis,
        "generatedAt": int(time.time() * 1000),
    }


# --- Manuelle AdSense-Monatseinnahmen (Inhaber traegt finalisierte Werte ein) ---

REVENUE_PREFIX = "finance/adsense-revenue/v1/"
_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _revenue_key(month: str) -> str:
    return f"{REVENUE_PREFIX}{month}.json"


def save_revenue_entry(month: str, adsense_cents: int, note: str | None, actor_email: str | None, invalid_traffic_cents: int = 0) -> dict[str, Any]:
    client = _client()
    record = {
        "month": month,
        "adsenseCents": adsense_cents,
        "invalidTrafficCents": max(0, invalid_traffic_cents),
        "note": note,
        "recordedBy": actor_email,
        "recordedAt": datetime.now(UTC).isoformat(),
    }
    client.put_object(
        Bucket=settings.idrive_e2_bucket, Key=_revenue_key(month),
        Body=json.dumps(record, ensure_ascii=False).encode("utf-8"),
        ContentType="application/json",
    )
    return record


def list_revenue_entries(limit: int = 12) -> list[dict[str, Any]]:
    client = _client()
    paginator = client.get_paginator("list_objects_v2")
    entries: list[dict[str, Any]] = []
    for page in paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=REVENUE_PREFIX):
        for entry in page.get("Contents", []) or []:
            try:
                response = client.get_object(Bucket=settings.idrive_e2_bucket, Key=entry["Key"])
                data = json.loads(response["Body"].read().decode("utf-8"))
                if isinstance(data, dict):
                    entries.append(data)
            except Exception:  # noqa: BLE001, S112
                continue
    entries.sort(key=lambda row: str(row.get("month") or ""), reverse=True)
    return entries[:limit]


def _month_payouts(month: str, adsense_cents: int, invalid_traffic_cents: int = 0) -> dict[str, Any]:
    """25%-Payouts pro Profil fuer einen Monat, pro-rata nach Impressions.

    Invalid-Traffic-Abzug zuerst: net = adsense - invalid (mindestens 0),
    danach verteilt net * USER_SHARE_PERCENT anteilig. capped=true zeigt
    an, dass mehr Objekte existierten als geladen wurden.
    """
    client = _client()
    compact = month.replace("-", "")
    keys: list[str] = []
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(
        Bucket=settings.idrive_e2_bucket, Prefix=f"pipeline/ads/impressions/{compact}/"
    ):
        for item in page.get("Contents", []) or []:
            keys.append(str(item.get("Key", "")))
    capped = len(keys) > RECENT_LOAD_LIMIT
    by_slug, _by_creator, loaded = _recent_details(keys)
    net_cents = max(0, adsense_cents - max(0, invalid_traffic_cents))
    pool = net_cents * USER_SHARE_PERCENT // 100
    payouts = sorted(
        (
            {
                "slug": slug,
                "impressions": count,
                "sharePercent": round(count * 100 / loaded, 2) if loaded else 0,
                "payoutCents": round(pool * count / loaded) if loaded else 0,
            }
            for slug, count in by_slug.items()
        ),
        key=lambda row: -row["payoutCents"],
    )
    return {
        "month": month,
        "adsenseCents": adsense_cents,
        "invalidTrafficCents": max(0, invalid_traffic_cents),
        "netCents": net_cents,
        "poolCents": pool,
        "impressionsLoaded": loaded,
        "capped": capped,
        "payouts": payouts[:20],
    }


class RevenueEntryRequest(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    adsenseCents: int = Field(ge=0, le=100_000_000_00)
    invalidTrafficCents: int = Field(default=0, ge=0, le=100_000_000_00)
    note: str | None = Field(default=None, max_length=240)


def _require_csrf(request: Request) -> JSONResponse | None:
    if request.headers.get("X-Smyst-CSRF") != "1":
        return JSONResponse(
            status_code=403,
            content={"ok": False, "code": "csrf_required", "message": "Ungueltige Anfrage."},
        )
    return None


@router.post("/finance/revenue")
async def admin_finance_revenue(body: RevenueEntryRequest, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    if not storage_configured():
        return JSONResponse(
            status_code=503,
            content={"ok": False, "code": "store_unavailable", "message": "Object Brain nicht erreichbar."},
        )

    session = _session_from_request(request) or {}
    try:
        record = await asyncio.to_thread(
            save_revenue_entry, body.month, body.adsenseCents, body.note, session.get("email"),
            body.invalidTrafficCents,
        )
    except Exception:  # noqa: BLE001 — e2-Fehler -> 503, kein 500
        return JSONResponse(
            status_code=503,
            content={"ok": False, "code": "store_unavailable", "message": "Object Brain nicht erreichbar."},
        )
    await asyncio.to_thread(
        audit_store.record_action,
        actor_sub=session.get("sub"),
        actor_email=session.get("email"),
        action="finance.revenue_entry",
        target_type="adsense_month",
        target_id=body.month,
        detail=f"{body.adsenseCents} Cents erfasst, {body.invalidTrafficCents} Invalid-Traffic abgezogen (Korrektur ueberschreibt)",
    )
    return {"ok": True, "entry": record}


# --- Auszahlungs-Vermerk (Payout manuell ausgefuehrt, z. B. Ueberweisung) ---

PAYOUT_PREFIX = "finance/payouts/v1/"


def _payout_key(month: str) -> str:
    return f"{PAYOUT_PREFIX}{month}.json"


def save_payout_record(month: str, actor_email: str | None, note: str | None) -> dict[str, Any]:
    client = _client()
    record = {
        "month": month,
        "paidAt": datetime.now(UTC).isoformat(),
        "paidBy": actor_email,
        "note": note,
    }
    client.put_object(
        Bucket=settings.idrive_e2_bucket, Key=_payout_key(month),
        Body=json.dumps(record, ensure_ascii=False).encode("utf-8"),
        ContentType="application/json",
    )
    return record


def list_payout_records(limit: int = 12) -> list[dict[str, Any]]:
    client = _client()
    paginator = client.get_paginator("list_objects_v2")
    records: list[dict[str, Any]] = []
    for page in paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=PAYOUT_PREFIX):
        for entry in page.get("Contents", []) or []:
            try:
                response = client.get_object(Bucket=settings.idrive_e2_bucket, Key=entry["Key"])
                data = json.loads(response["Body"].read().decode("utf-8"))
                if isinstance(data, dict):
                    records.append(data)
            except Exception:  # noqa: BLE001, S112
                continue
    records.sort(key=lambda row: str(row.get("month") or ""), reverse=True)
    return records[:limit]


class PayoutRecordRequest(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    note: str | None = Field(default=None, max_length=240)


@router.post("/finance/payout-record")
async def admin_finance_payout_record(body: PayoutRecordRequest, request: Request) -> Any:
    """Vermerkt, dass der 25%-Pool eines Monats ausgezahlt wurde (CSRF + Audit).

    Kein Geld-Transfer: die eigentliche Zahlung laeuft ausserhalb (manuell),
    dieser Record macht sie revisionssicher nachvollziehbar.
    """
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    if not storage_configured():
        return JSONResponse(
            status_code=503,
            content={"ok": False, "code": "store_unavailable", "message": "Object Brain nicht erreichbar."},
        )

    session = _session_from_request(request) or {}
    try:
        record = await asyncio.to_thread(
            save_payout_record, body.month, session.get("email"), (body.note or "").strip()[:240] or None
        )
    except Exception:  # noqa: BLE001
        return JSONResponse(
            status_code=503,
            content={"ok": False, "code": "store_unavailable", "message": "Object Brain nicht erreichbar."},
        )
    await asyncio.to_thread(
        audit_store.record_action,
        actor_sub=session.get("sub"),
        actor_email=session.get("email"),
        action="finance.payout_record",
        target_type="payout_month",
        target_id=body.month,
        detail=f"Pool-Auszahlung vermerkt: {record['note']}" if record.get("note") else "Pool-Auszahlung vermerkt",
    )
    return {"ok": True, "record": record}
