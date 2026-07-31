"""Aufloesung von Wikidata-Orts-QIDs (P19/P20) zu Anzeigetext "Stadt, Land".

Der SPARQL-Ingest (wikidata_candidates) bekommt Ortslabels direkt aus der
Abfrage mitgeliefert. Seed-Ingest und Backfill arbeiten dagegen mit
EntityData/wbgetentities-Antworten, in denen P19/P20 nur als QID stehen —
dieses Modul loest solche QIDs zu Anzeigetexten auf. Die Ein-Land-Regel ist
identisch zu wikidata_candidates._place: das Land (P17 des Ortes) wird NUR
angehaengt, wenn Wikidata genau einen Staat zum Ort fuehrt; historische Orte
mit mehreren P17-Werten bleiben ohne Land stehen.
"""

from __future__ import annotations

from typing import Callable

P_BIRTH_PLACE = "P19"
P_DEATH_PLACE = "P20"
P_COUNTRY = "P17"


def claim_item_ids(entity: dict, prop: str) -> tuple[str, ...]:
    """Alle Item-QIDs eines Claims (Reihenfolge wie in Wikidata)."""
    ids: list[str] = []
    for claim in entity.get("claims", {}).get(prop, []):
        snak = claim.get("mainsnak", {})
        if snak.get("snaktype") == "value":
            item = snak.get("datavalue", {}).get("value", {})
            if isinstance(item, dict) and "id" in item:
                ids.append(item["id"])
    return tuple(ids)


def entity_label(entity: dict) -> str | None:
    """Deutsches Label, sonst englisches; fehlt beides -> None."""
    labels = entity.get("labels", {})
    value = ((labels.get("de") or labels.get("en") or {}).get("value") or "").strip()
    return value or None


def format_place(place_label: str | None, country_labels: set[str]) -> str | None:
    """Ort als "Stadt, Land" nach der Ein-Land-Regel (siehe Modul-Docstring)."""
    if not place_label:
        return None
    real = {c for c in country_labels if c and c != place_label}
    if len(real) != 1:
        return place_label
    return f"{place_label}, {real.pop()}"


class PlaceResolver:
    """Loest Orts-QIDs zu "Stadt, Land" auf; cached pro Lauf.

    fetch_entity(qid) liefert das Entity-Dict (Inhalt von
    payload["entities"][qid]) oder None. Fehler einzelner QIDs werden zu None —
    ein fehlender Ort ist kein Abbruchgrund.
    """

    def __init__(self, fetch_entity: Callable[[str], dict | None]):
        self._fetch_entity = fetch_entity
        self._entities: dict[str, dict | None] = {}
        self._resolved: dict[str, str | None] = {}

    def _entity(self, qid: str) -> dict | None:
        if qid not in self._entities:
            try:
                self._entities[qid] = self._fetch_entity(qid)
            except Exception:  # noqa: BLE001 - einzelne Orte brechen nichts ab
                self._entities[qid] = None
        return self._entities[qid]

    def resolve(self, place_qid: str) -> str | None:
        if place_qid in self._resolved:
            return self._resolved[place_qid]
        place = self._entity(place_qid)
        result: str | None = None
        if place is not None:
            label = entity_label(place)
            countries: set[str] = set()
            for country_qid in claim_item_ids(place, P_COUNTRY):
                country = self._entity(country_qid)
                country_label = entity_label(country) if country else None
                if country_label:
                    countries.add(country_label)
            result = format_place(label, countries)
        self._resolved[place_qid] = result
        return result
