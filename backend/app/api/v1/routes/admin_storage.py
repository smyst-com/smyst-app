"""Admin-Endpoint fuer echte Object-Brain-Groessen (Buckets/Praefixe).

GET /api/admin/storage-stats zaehlt je Top-Level-Praefix Objekte und Bytes
rein aus list_objects_v2-Metadaten (Size je Objekt) — kein Laden von
Objekt-Inhalten, daher auch bei grossen Bestaenden guenstig.

Nur fuer Sessions mit admin:read (Rollen admin/owner). Read-only.
Ohne e2-Konfiguration oder bei Fehlern: source=unavailable mit leeren
Zeilen statt erfundener Zahlen.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, Request

from app.api.v1.routes.admin_quality import _require_admin
from app.core.config import settings
from app.integrations.feedback_store import _client, storage_configured

router = APIRouter(prefix="/admin", tags=["admin"])

#: Sicherheitsdeckel gegen Endlos-Listings (10k Objekte je Praefix).
OBJECT_LIMIT_PER_PREFIX = 10_000


def _prefix_stats(prefix: str) -> dict[str, Any]:
    client = _client()
    objects = 0
    total_bytes = 0
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=prefix):
        for item in page.get("Contents", []) or []:
            objects += 1
            try:
                total_bytes += int(item.get("Size") or 0)
            except (TypeError, ValueError):
                continue
            if objects >= OBJECT_LIMIT_PER_PREFIX:
                return {
                    "prefix": prefix.rstrip("/") or "/",
                    "objects": objects,
                    "bytes": total_bytes,
                    "capped": True,
                }
    return {"prefix": prefix.rstrip("/") or "/", "objects": objects, "bytes": total_bytes, "capped": False}


def _top_level_prefixes() -> list[str]:
    client = _client()
    prefixes: list[str] = []
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(
        Bucket=settings.idrive_e2_bucket, Delimiter="/"
    ):
        for entry in page.get("CommonPrefixes", []) or []:
            value = str(entry.get("Prefix") or "")
            if value:
                prefixes.append(value)
    return sorted(set(prefixes))


@router.get("/storage-stats")
async def admin_storage_stats(request: Request) -> dict[str, Any]:
    denied = _require_admin(request)
    if denied is not None:
        return denied  # type: ignore[return-value]

    if not storage_configured():
        return {
            "ok": True,
            "source": "unavailable",
            "rows": [],
            "generatedAt": int(time.time() * 1000),
        }

    try:
        prefixes = await asyncio.to_thread(_top_level_prefixes)
        rows = await asyncio.gather(
            *(asyncio.to_thread(_prefix_stats, prefix) for prefix in prefixes),
            return_exceptions=True,
        )
        clean = [row for row in rows if isinstance(row, dict)]
        source = "idrive-e2"
    except Exception:  # noqa: BLE001 — e2 nicht erreichbar: ehrlich leer
        clean = []
        source = "unavailable"

    return {
        "ok": True,
        "source": source,
        "rows": sorted(clean, key=lambda row: -row["bytes"]),
        "generatedAt": int(time.time() * 1000),
    }
