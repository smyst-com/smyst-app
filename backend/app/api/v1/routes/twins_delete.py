"""Soft-Delete fuer einzelne Twins.

Master-Prompt-Regeln von smyst.com: keine Profile loeschen, Rollback muss
moeglich sein. DELETE verschiebt den Twin deshalb in den Papierkorb des
Nutzer-Dokuments (doc["deletedTwins"]) statt ihn zu entfernen.
POST /twins/{twin_id}/restore stellt ihn vollstaendig wieder her.

Chats bleiben in ihrem eigenen Store unberuehrt und damit zugreifbar -
auch waehrend der Twin im Papierkorb liegt.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, Request

from app.api.v1.routes.user_mvp import (
    _error,
    _find_twin,
    _load_doc,
    _require_sub,
    _sync_counts,
)
from app.integrations import user_store

logger = logging.getLogger(__name__)

router = APIRouter(tags=["twins"])


def _trash(doc: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(doc.get("deletedTwins"), list):
        doc["deletedTwins"] = []
    return doc["deletedTwins"]


@router.delete("/twins/{twin_id}")
def delete_twin(request: Request, twin_id: str) -> Any:
    """Verschiebt einen Twin in den Papierkorb (kein endgueltiges Loeschen)."""
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    twin = _find_twin(doc, twin_id)
    if twin is None:
        return _error(404, "twin_not_found", "Twin nicht gefunden.")
    doc["twins"] = [t for t in doc["twins"] if t.get("id") != twin_id]
    twin["deletedAt"] = int(time.time() * 1000)
    _trash(doc).append(twin)
    _sync_counts(doc)
    user_store.save_user_doc(sub, doc)
    logger.info("twin_soft_deleted sub=%s twin=%s", sub, twin_id)
    return {
        "ok": True,
        "deletedId": twin_id,
        "restorable": True,
        "remaining": len(doc["twins"]),
    }


@router.get("/twins/deleted/list")
def list_deleted_twins(request: Request) -> Any:
    """Papierkorb-Inhalt des angemeldeten Nutzers."""
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    return {"twins": _trash(doc)}


@router.post("/twins/{twin_id}/restore")
def restore_twin(request: Request, twin_id: str) -> Any:
    """Stellt einen Twin aus dem Papierkorb wieder her."""
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    trash = _trash(doc)
    twin = next((t for t in trash if t.get("id") == twin_id), None)
    if twin is None:
        return _error(404, "twin_not_found", "Kein geloeschter Twin mit dieser ID.")
    doc["deletedTwins"] = [t for t in trash if t.get("id") != twin_id]
    twin.pop("deletedAt", None)
    doc["twins"].append(twin)
    _sync_counts(doc)
    user_store.save_user_doc(sub, doc)
    logger.info("twin_restored sub=%s twin=%s", sub, twin_id)
    return {"ok": True, "restoredId": twin_id, "remaining": len(doc["twins"])}
