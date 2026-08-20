"""Werbe-Impressions-Abrechnung (25%-Beteiligung der Profil-Ersteller).

Jede ausgelieferte Werbe-Einblendung (AdSlot) wird pro Profil-Slug gezaehlt:
RAM-Zaehler (schnell, fuer Live-Stats) + append-only Archiv in IDrive e2
(pipeline/ads/impressions/{yyyymmdd}/{id}.json) als Abrechnungsgrundlage.
Auszahlung: Gesamterloes x 25 %, verteilt pro-rata nach Impressions-Anteil.

Ohne AdSense-Konfiguration feuert das Frontend keine Impressions – dann bleibt
dieser Store leer (Free-only-Betrieb unberuehrt).
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.integrations.feedback_store import _client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ads", tags=["ads"])

IMPRESSION_PREFIX = "pipeline/ads/impressions/"
_STATS: dict[str, int] = {}


class ImpressionRequest(BaseModel):
    slug: str = Field(min_length=1, max_length=160)
    placement: str = Field(default="profile-footer", max_length=60)
    creatorSub: str | None = Field(default=None, max_length=160)


@router.post("/impression")
async def record_impression(body: ImpressionRequest, request: Request) -> dict[str, object]:
    """Eine ausgelieferte Werbung zaehlen (fire-and-forget vom AdSlot)."""
    _STATS[body.slug] = _STATS.get(body.slug, 0) + 1
    entry = {
        "id": str(uuid.uuid4()),
        "createdAt": datetime.now(UTC).isoformat(),
        "slug": body.slug,
        "placement": body.placement,
        "creatorSub": body.creatorSub,
    }
    client = _client() if __import__('app.integrations.feedback_store', fromlist=['storage_configured']).storage_configured() else None
    if client is not None:
        try:
            from app.core.config import settings

            day = entry["createdAt"][:10].replace("-", "")
            key = f"{IMPRESSION_PREFIX}{day}/{entry['id']}.json"
            payload = json.dumps(entry, ensure_ascii=False, default=str).encode("utf-8")
            client.put_object(
                Bucket=settings.idrive_e2_bucket, Key=key, Body=payload,
                ContentType="application/json",
            )
        except Exception:
            logger.warning("impression archive failed", exc_info=True)
    return {"ok": True}


@router.get("/stats")
async def impression_stats() -> dict[str, object]:
    """Live-Zaehler pro Profil (Abrechnungs-Basis fuer die 25%-Auszahlung)."""
    total = sum(_STATS.values())
    return {
        "total": total,
        "profiles": dict(sorted(_STATS.items(), key=lambda kv: -kv[1])),
    }
