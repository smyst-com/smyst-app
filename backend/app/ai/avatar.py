"""Avatar-Aufloesung fuer smyst.com (Single Source of Truth).

Eine einzige Regel bestimmt ueberall (Profil, Twin-Karten, Chat-Header,
oeffentliches Profil) das anzuzeigende Avatar-Bild:

    resolved = twin_override ?? owner_avatar ?? placeholder

Kein Netzwerk, kein Speicher, keine Seiteneffekte: reine Funktionen, damit die
Regel testbar ist und an genau einer Stelle definiert bleibt. Ein optionaler
Cache-Buster (?v=) sorgt dafuer, dass ein geaendertes Profilbild sofort sichtbar
wird, ohne dass ein veraltetes Bild aus dem Browser-Cache haengen bleibt.
"""

from __future__ import annotations

# Neutraler Platzhalter, wenn weder Twin-Override noch Besitzer-Avatar existiert.
DEFAULT_AVATAR_PLACEHOLDER = "/branding/avatar-placeholder.svg"


def _clean(value: str | None) -> str | None:
    """Leere/whitespace-only Strings gelten als 'nicht gesetzt' (None)."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def resolve_avatar_url(
    twin_override: str | None = None,
    owner_avatar: str | None = None,
    placeholder: str = DEFAULT_AVATAR_PLACEHOLDER,
) -> str:
    """Bestimmt das anzuzeigende Avatar-Bild nach der SSOT-Fallback-Regel.

    Reihenfolge: Twin-Override, sonst Besitzer-Avatar, sonst Platzhalter.
    Leere Strings werden wie 'nicht gesetzt' behandelt.
    """
    return _clean(twin_override) or _clean(owner_avatar) or placeholder


def with_cache_buster(url: str, version: str | int | None) -> str:
    """Haengt ?v=<version> (bzw. &v=) an, damit Clients ein neues Bild sofort laden.

    Ohne version (None/leer) oder ohne url wird der Wert unveraendert
    zurueckgegeben.
    """
    if not url or version is None:
        return url
    version_str = str(version).strip()
    if not version_str:
        return url
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}v={version_str}"


def resolved_avatar_url(
    twin_override: str | None = None,
    owner_avatar: str | None = None,
    *,
    version: str | int | None = None,
    placeholder: str = DEFAULT_AVATAR_PLACEHOLDER,
) -> str:
    """Komplett-Helfer: Fallback-Aufloesung + optionaler Cache-Buster.

    Der Platzhalter erhaelt bewusst KEINEN Cache-Buster (statisches Asset).
    Dies ist die Funktion, die API-Antworten als fertig aufgeloestes
    ``resolved_avatar_url`` mitliefern sollten, damit das Frontend nichts
    selbst zusammenbauen muss.
    """
    resolved = resolve_avatar_url(twin_override, owner_avatar, placeholder)
    if resolved == placeholder:
        return resolved
    return with_cache_buster(resolved, version)
