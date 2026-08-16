from __future__ import annotations

import logging
from time import monotonic

import httpx

logger = logging.getLogger("smyst.ai.twin_context")

# Oeffentliche, kuratierte Profil-Daten (Single Source: smyst.com, statisch).
STATIC_TWIN_BASE = "https://smyst.com/api/public/twins"
CACHE_TTL_SECONDS = 3600.0
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


async def twin_context(twin_id: str | None) -> str:
    """Kompakter, kuratierter Profil-Kontext fuer den Chat-Prompt.

    Liefert bei JEDEM Fehler einen leeren String — der Chat darf nie an
    fehlendem Kontext scheitern. Ergebnisse (auch negative) werden 1 h gecacht.
    """
    if not twin_id or not isinstance(twin_id, str):
        return ""
    slug = _slug_for_twin(twin_id)
    if not slug:
        return ""
    cached = _CACHE.get(slug)
    if cached and cached[0] > monotonic():
        return cached[1]
    context = ""
    try:
        async with httpx.AsyncClient(timeout=4.0, follow_redirects=True) as client:
            response = await client.get(f"{STATIC_TWIN_BASE}/{slug}/")
            response.raise_for_status()
            payload = response.json() or {}
        twin = payload.get("twin") or {}
        if isinstance(twin, dict):
            context = _build_context(twin)
    except Exception as exc:
        logger.warning("twin context fetch failed for '%s' (%s)", slug, type(exc).__name__)
        context = ""
    _CACHE[slug] = (monotonic() + CACHE_TTL_SECONDS, context)
    return context
