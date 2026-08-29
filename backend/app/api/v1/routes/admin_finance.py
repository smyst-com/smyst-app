"""Admin-Endpoint fuer Finance: Abrechnungsbasis aus echten Ad-Impressions.

GET /api/admin/finance aggregiert das append-only Impression-Archiv im
Object Brain (pipeline/ads/impressions/<yyyymmdd>/<id>.json):

- Tages-Zaehler (14 Tage) aus den Objekt-KEYS — kein Laden der Objekte noetig
- Top-Profile (slug) und Top-Creator (creatorSub) der letzten 7 Tage aus den
  Objekt-Inhalten (begrenzt auf RECENT_LOAD_LIMIT Objekte)
- Gesamt-Zaehler ueber alle archivierten Tage

Nur fuer Sessions mit admin:read (Rollen admin/owner). Read-only.

Bewusst ehrlich: USD-Einnahmen liegen ausschliesslich im AdSense-Dashboard
(dafuer gibt es keine API-Anbindung — Free-only-Regel). Dieser Endpoint
liefert die gemessene Abrechnungs-BASIS (Impressions), keine erfundenen
Dollar-Betraege. Auszahlungs-Workflows (KYC, Payout) existieren noch nicht.
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Request

from app.api.v1.routes.admin_quality import _require_admin
from app.core.config import settings
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
        "generatedAt": int(time.time() * 1000),
    }
