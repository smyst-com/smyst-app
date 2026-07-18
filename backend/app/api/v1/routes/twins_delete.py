"""Loeschen einzelner Twins.

Ergaenzt user_mvp.py um den fehlenden DELETE-Endpunkt: bisher liess sich ein
einzelner Twin ueberhaupt nicht entfernen, nur das komplette Konto.

Bewusste Entscheidung: zugehoerige Chats bleiben erhalten. Sie liegen in einem
eigenen Store und werden nicht kaskadierend geloescht, damit kein Nutzer
ungewollt Gespraechsverlaeufe verliert.
"""

from __future__ import annotations

import logging
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


@router.delete("/twins/{twin_id}")
def delete_twin(request: Request, twin_id: str) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    twin = _find_twin(doc, twin_id)
    if twin is None:
        return _error(404, "twin_not_found", "Twin nicht gefunden.")
    doc["twins"] = [t for t in doc["twins"] if t.get("id") != twin_id]
    _sync_counts(doc)
    user_store.save_user_doc(sub, doc)
    logger.info("twin_deleted sub=%s twin=%s", sub, twin_id)
    return {"ok": True, "deletedId": twin_id, "remaining": len(doc["twins"])}
