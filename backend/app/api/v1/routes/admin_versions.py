"""Versions-Autopilot — Freigabe-Endpoints (Admin-Cockpit).

Der Worker app.workers.version_autopilot staget gepruefte, im Eval-Vergleich
bessere Profil-Versionen. Diese Routen sind der letzte Kontrollpunkt des
Inhabers: Uebersicht sehen, mit EINEM Klick freigeben ("Alle freigeben")
oder einzeln ablehnen.

GET  /api/admin/versions/pending         - Freigabe-Liste (gestagte Versionen)
POST /api/admin/versions/{qid}/approve   - Neue Version live schalten
       (archiviert die alte Version nach pipeline/backups/, twin_id/Slug
        bleiben stabil, twin_versions-Historie + Audit-Eintrag)
POST /api/admin/versions/approve-all     - Alle gestagten Versionen freigeben
POST /api/admin/versions/{qid}/reject    - Staging verwerfen (Live unberuehrt,
        Datensatz wandert nach pipeline/autopilot/rejected/ — nichts wird geloescht)

Schutzregeln: kein Loeschen, kein Unpublish, kein Statuswechsel; QA- und
Eval-Ergebnisse stammen ausschliesslich aus dem Worker-Staging. POST
verlangt CSRF-Header + Admin-Session (admin/owner), wie approvals.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.v1.routes.admin_quality import _require_admin
from app.api.v1.routes.auth import _session_from_request
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.build_capsules import CAPSULE_PREFIX
from app.workers.version_autopilot import PENDING_PREFIX

router = APIRouter(prefix="/admin/versions", tags=["admin"])

#: Mehr Karten braucht die Freigabe-Sicht nicht (siehe approvals).
PENDING_LIMIT = 200

BACKUP_PREFIX = "pipeline/backups/"
APPLIED_PREFIX = "pipeline/autopilot/applied/"
REJECTED_PREFIX = "pipeline/autopilot/rejected/"

#: Historie je Profil begrenzen — das Kandidaten-Dokument ist kein Archiv,
#: jede Version liegt vollstaendig in pipeline/backups/.
TWIN_VERSIONS_LIMIT = 20


class RejectVersionRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


def _require_csrf(request: Request) -> JSONResponse | None:
    if request.headers.get("X-Smyst-CSRF") != "1":
        return JSONResponse(
            status_code=403,
            content={"ok": False, "code": "csrf_required", "message": "Ungueltige Anfrage."},
        )
    return None


def _store() -> CandidateStore:
    from app.core.config import settings

    return CandidateStore(build_s3_client(), settings.idrive_e2_bucket)


def _get_object(store: CandidateStore, key: str) -> Any:
    return store._client.get_object(Bucket=store._bucket, Key=key)  # noqa: SLF001


def _put_object(store: CandidateStore, key: str, body: bytes, content_type: str = "application/json") -> None:
    store._client.put_object(  # noqa: SLF001
        Bucket=store._bucket, Key=key, Body=body, ContentType=content_type
    )


def _load_json(store: CandidateStore, key: str) -> dict | None:
    try:
        return json.loads(_get_object(store, key)["Body"].read().decode("utf-8"))
    except Exception:
        return None


def _list_pending_qids(store: CandidateStore) -> list[str]:
    """QIDs der Freigabe-Datensaetze (pending/{qid}.json, ohne Unterordner)."""
    qids: list[str] = []
    try:
        kwargs: dict[str, Any] = {"Bucket": store._bucket, "Prefix": PENDING_PREFIX, "MaxKeys": 1000}
        while len(qids) <= PENDING_LIMIT * 2:
            response = store._client.list_objects_v2(**kwargs)  # noqa: SLF001
            for obj in response.get("Contents", []) or []:
                key = obj["Key"][len(PENDING_PREFIX):]
                if key.endswith(".json") and "/" not in key:
                    qids.append(key[: -len(".json")])
            if not response.get("IsTruncated"):
                break
            kwargs["ContinuationToken"] = response.get("NextContinuationToken")
    except Exception:
        return []
    return qids[:PENDING_LIMIT]


def _load_pending(store: CandidateStore) -> list[dict[str, Any]]:
    from concurrent.futures import ThreadPoolExecutor

    def _load(qid: str) -> dict[str, Any] | None:
        record = _load_json(store, f"{PENDING_PREFIX}{qid}.json")
        return {"qid": qid, **record} if isinstance(record, dict) else None

    with ThreadPoolExecutor(max_workers=20) as pool:
        cards = [c for c in pool.map(_load, _list_pending_qids(store)) if c]
    cards.sort(key=lambda card: card.get("staged_at") or "")
    return cards


def _archive_live_version(store: CandidateStore, qid: str, version: int) -> None:
    """Aktuelle Live-Capsule vor dem Tausch ins Backuparchiv kopieren."""
    for filename in ("capsule.json", "prompt.json", "seo.json"):
        try:
            response = _get_object(store, f"{CAPSULE_PREFIX}{qid}/{filename}")
            body = response["Body"].read()
            _put_object(store, f"{BACKUP_PREFIX}{qid}/v{version}/{filename}", body)
        except Exception:
            continue  # fehlende Datei: nichts zu archivieren


def _apply_pending(store: CandidateStore, qid: str, approved_by: str) -> str:
    now = datetime.now(timezone.utc)
    record = _load_json(store, f"{PENDING_PREFIX}{qid}.json")
    if not isinstance(record, dict):
        return f"uebersprungen: keine gestagte Version fuer {qid}"

    document = store.load_candidate_document(qid)
    staged_capsule = _load_json(store, f"{PENDING_PREFIX}{qid}/capsule.json")
    if not isinstance(staged_capsule, dict):
        return f"uebersprungen: gestagte Capsule fehlt fuer {qid}"

    old_version = int(record.get("old_version") or 1)
    new_version = int(record.get("new_version") or old_version + 1)

    _archive_live_version(store, qid, old_version)
    for filename in ("capsule.json", "prompt.json", "seo.json"):
        try:
            response = _get_object(store, f"{PENDING_PREFIX}{qid}/{filename}")
            _put_object(store, f"{CAPSULE_PREFIX}{qid}/{filename}", response["Body"].read())
        except Exception as error:
            return f"abgebrochen ({filename} nicht lesbar: {error}) — Live unveraendert"

    twin_versions = [
        entry for entry in (document.get("twin_versions") or []) if isinstance(entry, dict)
    ]
    twin_versions.append(
        {
            "version": new_version,
            "activated_at": now.isoformat(),
            "old_score": record.get("old_score"),
            "new_score": record.get("new_score"),
            "qa_passed": bool(record.get("qa_passed")),
            "approved_by": approved_by,
        }
    )
    new_document = {
        **document,
        "twin_id": record.get("twin_id") or document.get("twin_id"),
        "qa_passed": True,
        "version": new_version,
        "twin_versions": twin_versions[-TWIN_VERSIONS_LIMIT:],
        "version_autopilot": {
            "activated_at": now.isoformat(),
            "old_version": old_version,
            "new_version": new_version,
            "old_score": record.get("old_score"),
            "new_score": record.get("new_score"),
        },
        "audit_trail": document.get("audit_trail", [])
        + [
            {
                "wikidata_qid": qid,
                "from_status": document.get("status"),
                "to_status": document.get("status"),
                "reason": f"version-autopilot: v{old_version} -> v{new_version} freigegeben",
                "actor": None,
                "occurred_at": now.isoformat(),
            }
        ],
    }
    store.save_candidate_document(qid, new_document)

    # Freigabe-Datensatz wandert nach applied/ (nichts wird geloescht).
    _put_object(
        store, f"{APPLIED_PREFIX}{qid}-{int(now.timestamp())}.json",
        json.dumps({**record, "approved_by": approved_by, "applied_at": now.isoformat()},
                   ensure_ascii=False, indent=2).encode("utf-8"),
    )
    return (
        f"live: v{old_version} -> v{new_version} "
        f"(Eval {record.get('old_score')} -> {record.get('new_score')}, Backup v{old_version} archiviert)"
    )


def _reject_pending(store: CandidateStore, qid: str, reason: str, rejected_by: str) -> str:
    now = datetime.now(timezone.utc)
    record = _load_json(store, f"{PENDING_PREFIX}{qid}.json")
    if not isinstance(record, dict):
        return f"uebersprungen: keine gestagte Version fuer {qid}"
    _put_object(
        store, f"{REJECTED_PREFIX}{qid}-{int(now.timestamp())}.json",
        json.dumps({**record, "reason": reason, "rejected_by": rejected_by, "rejected_at": now.isoformat()},
                   ensure_ascii=False, indent=2).encode("utf-8"),
    )
    return f"verworfen ({reason}) — Live unveraendert"


@router.get("/pending")
async def list_pending(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    try:
        cards = await asyncio.to_thread(_load_pending, _store())
    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "code": "versions_unavailable",
                "message": "Autopilot-Daten (Object Brain) sind hier nicht erreichbar.",
            },
        )
    return {"ok": True, "pending": cards, "counts": {"pending": len(cards)}}


@router.post("/{qid}/approve")
async def approve_version(qid: str, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    session = _session_from_request(request) or {}
    approved_by = str(session.get("email") or "admin@smyst.com")
    try:
        result = await asyncio.to_thread(_apply_pending, _store(), qid, approved_by)
    except Exception:
        return JSONResponse(
            status_code=502,
            content={"ok": False, "code": "version_apply_error", "message": "Freigeben lief auf einen Fehler."},
        )
    return {"ok": result.startswith("live"), "qid": qid, "result": result}


@router.post("/approve-all")
async def approve_all(request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    session = _session_from_request(request) or {}
    approved_by = str(session.get("email") or "admin@smyst.com")
    store = _store()
    try:
        cards = await asyncio.to_thread(_load_pending, store)
        results = await asyncio.to_thread(
            lambda: {qid: _apply_pending(store, qid, approved_by) for qid in (c["qid"] for c in cards)}
        )
    except Exception:
        return JSONResponse(
            status_code=502,
            content={"ok": False, "code": "version_apply_error", "message": "Freigeben lief auf einen Fehler."},
        )
    applied = sum(1 for value in results.values() if value.startswith("live"))
    return {"ok": True, "applied": applied, "total": len(results), "results": results}


@router.post("/{qid}/reject")
async def reject_version(qid: str, body: RejectVersionRequest, request: Request) -> Any:
    denied = _require_admin(request)
    if denied is not None:
        return denied
    if (csrf := _require_csrf(request)) is not None:
        return csrf
    session = _session_from_request(request) or {}
    rejected_by = str(session.get("email") or "admin@smyst.com")
    try:
        result = await asyncio.to_thread(_reject_pending, _store(), qid, body.reason, rejected_by)
    except Exception:
        return JSONResponse(
            status_code=502,
            content={"ok": False, "code": "version_reject_error", "message": "Ablehnen lief auf einen Fehler."},
        )
    return {"ok": result.startswith("verworfen"), "qid": qid, "result": result}
