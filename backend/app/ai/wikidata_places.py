"""Aufloesung von Wikidata-Orts-QIDs (P19/P20) zu Anzeigetext "Stadt, Land".

Der SPARQL-Ingest (wikidata_candidates) bekommt Ortslabels direkt aus der
Abfrage mitgeliefert. Seed-Ingest und Backfill arbeiten dagegen mit
EntityData/wbgetentities-Antworten, in denen P19/P20 nur als QID stehen —
dieses Modul loest solche QIDs zu Anzeigetexten auf.

Land-Auswahl (identisch zu wikidata_candidates): gezeigt wird der HEUTE
gueltige Staat des Ortes. Wikidata fuehrt zu grossen Staedten den kompletten
Gebietsverlauf als P17 — Berlin hat elf Staaten von Brandenburg bis
Deutschland, London acht von Britannien bis Vereinigtes Koenigreich. Wer
daraus "genau ein Staat" verlangt, bekommt bei praktisch jeder bekannten
Stadt gar kein Land (Live-Befund 03.08.2026: 522 Profile ohne Land).
Darum die Rangfolge current_country_ids(): bevorzugter Rang zuerst (den setzt
Wikidata genau auf den aktuellen Staat), sonst die Statements ohne Enddatum
(P582) — beendete Gebietszugehoerigkeiten fallen weg. Bleibt danach mehr als
ein Staat uebrig, steht der Ort weiter ohne Land da; ein beliebiger Treffer
waere schlicht falsch.
"""

from __future__ import annotations

from typing import Callable

P_BIRTH_PLACE = "P19"
P_DEATH_PLACE = "P20"
P_COUNTRY = "P17"
P_END_TIME = "P582"
P_LOCATED_IN = "P131"  # liegt in der Verwaltungseinheit


def _item_id(claim: dict) -> str | None:
    """Ziel-QID eines Statements; Nicht-Item-Werte ergeben None."""
    snak = claim.get("mainsnak", {})
    if snak.get("snaktype") != "value":
        return None
    item = snak.get("datavalue", {}).get("value", {})
    return item["id"] if isinstance(item, dict) and "id" in item else None


def _first_group(*groups: list[str]) -> tuple[str, ...]:
    """Erste nicht-leere Gruppe, dublettenfrei und in Wikidata-Reihenfolge."""
    for group in groups:
        if group:
            return tuple(dict.fromkeys(group))
    return ()


def claim_item_ids(entity: dict, prop: str) -> tuple[str, ...]:
    """Item-QIDs eines Claims, sortiert nach Wikidata-Rang.

    Bevorzugte Statements stehen vorn, deprecated (von Wikidata als widerlegt
    markiert) faellt weg. Wer nur einen Ort braucht, nimmt das erste Element.
    Ohne die Rang-Sortierung greift der Aufrufer einfach das erste Statement
    ab — bei Sofja Kowalewskaja war das ausgerechnet der deprecated-Sterbeort
    "Spanien" statt der Stockholmer Gemeinde (Befund 03.08.2026).

    Die restlichen Eintraege bleiben erhalten, weil Personen oft mehrere
    Ortsangaben tragen: Alfred Nobel hat "Stockholm" (normal) UND die
    Jakobs- und Johannesgemeinde (bevorzugt). Der Backfill sucht darin den
    Eintrag, der zum bereits veroeffentlichten Ort passt.
    """
    preferred: list[str] = []
    normal: list[str] = []
    for claim in entity.get("claims", {}).get(prop, []):
        rank = claim.get("rank")
        if rank == "deprecated":
            continue
        qid = _item_id(claim)
        if qid is None:
            continue
        (preferred if rank == "preferred" else normal).append(qid)
    return tuple(dict.fromkeys(preferred + normal))


def current_country_ids(entity: dict) -> tuple[str, ...]:
    """P17-QIDs des Ortes, reduziert auf den heute gueltigen Staat.

    Rangfolge (siehe Modul-Docstring): bevorzugter Rang > Statements ohne
    Enddatum > alle uebrigen. Deprecated faellt immer weg.
    """
    preferred: list[str] = []
    ongoing: list[str] = []
    every: list[str] = []
    for claim in entity.get("claims", {}).get(P_COUNTRY, []):
        rank = claim.get("rank")
        if rank == "deprecated":
            continue
        qid = _item_id(claim)
        if qid is None:
            continue
        every.append(qid)
        if rank == "preferred":
            preferred.append(qid)
        elif not claim.get("qualifiers", {}).get(P_END_TIME):
            ongoing.append(qid)
    return _first_group(preferred, ongoing, every)


def entity_label(entity: dict) -> str | None:
    """Deutsches Label, sonst englisches; fehlt beides -> None."""
    labels = entity.get("labels", {})
    value = ((labels.get("de") or labels.get("en") or {}).get("value") or "").strip()
    return value or None


def format_place(place_label: str | None, country_labels: set[str]) -> str | None:
    """Ort als "Stadt, Land"; mehrdeutige Laender bleiben weg (Modul-Docstring)."""
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
            for country_qid in current_country_ids(place):
                country = self._entity(country_qid)
                country_label = entity_label(country) if country else None
                if country_label:
                    countries.add(country_label)
            result = format_place(label, countries)
        self._resolved[place_qid] = result
        return result

    def country_of(self, place_qid: str) -> str | None:
        """Land des Ortes als Label, sofern eindeutig — sonst None."""
        place = self._entity(place_qid)
        if place is None:
            return None
        labels = {
            entity_label(self._entity(country_qid) or {})
            for country_qid in current_country_ids(place)
        }
        real = {c for c in labels if c}
        return real.pop() if len(real) == 1 else None

    def containing_labels(self, place_qid: str, *, depth: int = 4) -> tuple[str, ...]:
        """Labels der Verwaltungskette (P131) aufwaerts, ohne den Ort selbst.

        Fuer "Jakob and Johannes parish" also Richtung "Gemeinde Stockholm".
        Damit laesst sich pruefen, ob ein Bestandswert wie "Stockholm" derselbe
        Ort in groeberer Aufloesung ist — dann gilt dessen Land auch fuer ihn.
        """
        labels: list[str] = []
        seen = {place_qid}
        frontier = [place_qid]
        for _ in range(depth):
            nextup: list[str] = []
            for qid in frontier:
                place = self._entity(qid)
                if place is None:
                    continue
                for parent_qid in claim_item_ids(place, P_LOCATED_IN):
                    if parent_qid in seen:
                        continue
                    seen.add(parent_qid)
                    nextup.append(parent_qid)
                    label = entity_label(self._entity(parent_qid) or {})
                    if label:
                        labels.append(label)
            if not nextup:
                break
            frontier = nextup
        return tuple(labels)
