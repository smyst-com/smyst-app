from __future__ import annotations

import asyncio
import logging
from time import monotonic

from app.core.http_client import shared_client

logger = logging.getLogger("smyst.ai.twin_context")

# Oeffentliche, kuratierte Profil-Daten (Single Source: smyst.com, statisch).
STATIC_TWIN_BASE = "https://smyst.com/api/public/twins"
CACHE_TTL_SECONDS = 3600.0
# Negative Ergebnisse nur kurz cachen: Ein Fetch-Fehler beim frischen
# Containerstart (DNS/Netz noch nicht bereit) wuerde sonst 1 STUNDE lang
# jeden Chat ohne Persona laufen lassen — live beobachtet 06.09. (Chat
# antwortete generisch statt als Einstein, Log zeigte twin_context=0ms
# als Cache-Hit des leeren Ergebnisses).
NEGATIVE_CACHE_TTL_SECONDS = 30.0
RETRY_DELAY_SECONDS = 0.6
MAX_CONTEXT_CHARS = 1400

_CACHE: dict[str, tuple[float, str]] = {}


def _slug_for_twin(twin_id: str) -> str:
    slug = twin_id.removeprefix("curated-")
    return "".join(ch for ch in slug if ch.isalnum() or ch == "-")[:120]


def _build_context(twin: dict[str, object]) -> str:
    parts: list[str] = []
    name = twin.get("name")
    if name:
        parts.append(f"Name: {name}")
    description = twin.get("description")
    if description:
        parts.append(f"Profil: {description}")
    summary = twin.get("contextSummary")
    if summary:
        parts.append(f"Kontext: {summary}")
    birth = twin.get("birthLabel") or twin.get("birthDate")
    death = twin.get("deathLabel") or twin.get("deathDate")
    if birth or death:
        parts.append(f"Lebensdaten: {birth or '?'} bis {death or '?'}")
    categories = twin.get("categories")
    if isinstance(categories, list) and categories:
        parts.append("Kategorien: " + ", ".join(str(item) for item in categories[:6]))
    return "\n".join(parts)[:MAX_CONTEXT_CHARS]


async def _fetch_context(slug: str) -> str:
    """Ein Fetch-Versuch; wirft bei Fehlern (beim Aufrufer mit Retry gefangen)."""
    response = await shared_client().get(
        f"{STATIC_TWIN_BASE}/{slug}/", timeout=4.0, follow_redirects=True
    )
    response.raise_for_status()
    payload = response.json() or {}
    twin = payload.get("twin") or {}
    if not isinstance(twin, dict):
        return ""
    return _build_context(twin)


async def twin_context(twin_id: str | None) -> str:
    """Kompakter, kuratierter Profil-Kontext fuer den Chat-Prompt.

    Liefert bei JEDEM Fehler einen leeren String — der Chat darf nie an
    fehlendem Kontext scheitern. Erfolge werden 1 h gecacht; Fehlschlaege
    nur 30 s (ein Start-Fehler darf nicht eine Stunde Persona kosten) und
    werden einmalig sofort wiederholt.
    """
    if not twin_id or not isinstance(twin_id, str):
        return ""
    slug = _slug_for_twin(twin_id)
    if not slug:
        return ""
    cached = _CACHE.get(slug)
    if cached and cached[0] > monotonic():
        if not cached[1]:
            logger.info("twin context: negativer Cache-Treffer fuer '%s'", slug)
        return cached[1]
    context = ""
    for attempt in (1, 2):
        try:
            context = await _fetch_context(slug)
            break
        except Exception as exc:
            logger.warning(
                "twin context fetch failed for '%s' (attempt %d, %s)",
                slug, attempt, type(exc).__name__,
            )
            context = ""
            if attempt == 1:
                await asyncio.sleep(RETRY_DELAY_SECONDS)
    ttl = CACHE_TTL_SECONDS if context else NEGATIVE_CACHE_TTL_SECONDS
    _CACHE[slug] = (monotonic() + ttl, context)
    return context
