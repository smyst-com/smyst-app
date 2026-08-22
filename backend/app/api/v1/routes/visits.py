"""Besucher-Zaehlung pro Profil (Verbesserung 3, Admin-Dashboard-Basis).

POST /api/v1/visits {slug} – vom Frontend beim Oeffnen einer Profilseite
gefeuert (fire-and-forget). Zaehlt RAM-Live-Stats (heute/Gesamt pro Slug)
plus append-only Tagesarchiv in IDrive e2 (pipeline/visits/{datum}/{id}.json).
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.integrations.feedback_store import _client, storage_configured

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/visits", tags=["visits"])

VISIT_PREFIX = "pipeline/visits/"
_STATS: dict[str, dict[str, int]] = {}


class VisitRequest(BaseModel):
    slug: str = Field(min_length=1, max_length=160)


def _today() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


@router.post("")
async def record_visit(body: VisitRequest) -> dict[str, object]:
    day = _today()
    entry = _STATS.setdefault(body.slug, {"today": 0, "day": day, "total": 0})
    if entry["day"] != day:
        entry["day"] = day
        entry["today"] = 0
    entry["today"] += 1
    entry["total"] += 1

    if storage_configured():
        try:
            from app.core.config import settings

            record = {
                "id": str(uuid.uuid4()),
                "createdAt": datetime.now(UTC).isoformat(),
                "slug": body.slug,
            }
            client: Any = _client()
            client.put_object(
                Bucket=settings.idrive_e2_bucket,
                Key=f"{VISIT_PREFIX}{day.replace('-', '')}/{record['id']}.json",
                Body=json.dumps(record, ensure_ascii=False).encode("utf-8"),
                ContentType="application/json",
            )
        except Exception:
            logger.warning("visit archive failed", exc_info=True)
    return {"ok": True}


@router.get("/stats")
async def visit_stats() -> dict[str, object]:
    """Top-Profile nach Besuchern (heute/Gesamt) fuer das Admin-Dashboard."""
    profiles = {
        slug: {"today": v["today"], "total": v["total"]}
        for slug, v in sorted(_STATS.items(), key=lambda kv: -kv[1]["total"])[:50]
    }
    return {
        "totalToday": sum(v["today"] for v in _STATS.values()),
        "totalAll": sum(v["total"] for v in _STATS.values()),
        "profiles": profiles,
    }
