"""Tests fuer den Orts-Backfill (app.workers.backfill_places)."""

from __future__ import annotations

import io
import json
from datetime import date

from app.ai.wikidata_places import (
    PlaceResolver,
    claim_item_ids,
    current_country_ids,
    format_place,
)
from app.integrations.candidate_store import CandidateStore
from app.workers.backfill_places import run_backfill

PUBLISH_INDEX_KEY = "pipeline/published/index.json"


class FakePaginator:
    def __init__(self, keys):
        self._keys = keys

    def paginate(self, **kwargs):
        prefix = kwargs.get("Prefix", "")
        yield {"Contents": [{"Key": k} for k in self._keys if k.startswith(prefix)]}


class FakeS3:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def put_object(self, *, Bucket, Key, Body, ContentType):
        self.objects[Key] = Body

    def get_object(self, *, Bucket, Key):
        if Key not in self.objects:
            raise KeyError(Key)
        return {"Body": io.BytesIO(self.objects[Key])}

    def get_paginator(self, name):
        return FakePaginator(list(self.objects))


def item_claim(prop: str, *qids: str) -> dict:
    return {prop: [
        {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": q}}}}
        for q in qids
    ]}


def country_claim(*entries: tuple[str, str, str | None]) -> dict:
    """P17-Statements als (QID, Rang, Enddatum) — Enddatum None = laufend."""
    claims = []
    for qid, rank, end in entries:
        claim: dict = {
            "mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": qid}}},
            "rank": rank,
        }
        if end:
            claim["qualifiers"] = {"P582": [{"datavalue": {"value": {"time": end}}}]}
        claims.append(claim)
    return {"P17": claims}


def entity_payload(qid: str, *, label: str = "", claims: dict | None = None) -> bytes:
    payload = {"entities": {qid: {
        "labels": {"de": {"value": label}} if label else {},
        "claims": claims or {},
        "sitelinks": {},
    }}}
    return json.dumps(payload).encode("utf-8")


def snapshot_key(qid: str) -> str:
    return f"pipeline/sources/{qid}/wikidata-entitydata.json"


def prepared_store() -> tuple[CandidateStore, FakeS3]:
    s3 = FakeS3()
    store = CandidateStore(s3, "smyst-memories")
    index = [
        # Ohne Orte -> soll befuellt werden.
        {"wikidata_qid": "Q9312", "slug": "lew-tolstoi", "name": "Lew Tolstoi"},
        # Bereits vollstaendig -> bleibt unberuehrt.
        {"wikidata_qid": "Q1035", "slug": "charles-darwin", "name": "Charles Darwin",
         "birth_place": "Shrewsbury, Vereinigtes Königreich",
         "death_place": "Down House, Vereinigtes Königreich"},
    ]
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(index).encode("utf-8")
    s3.objects["pipeline/published/Q9312/profile.json"] = json.dumps(
        {"wikidata_qid": "Q9312", "slug": "lew-tolstoi"}
    ).encode("utf-8")
    # Personen-Snapshot: P19 Jasnaja Poljana, P20 Astapowo.
    s3.objects[snapshot_key("Q9312")] = entity_payload(
        "Q9312", label="Lew Tolstoi",
        claims={**item_claim("P19", "Q4515044"), **item_claim("P20", "Q2857656")},
    )
    # Orts-Snapshots samt Land (P17 Russland) und Land-Snapshot.
    s3.objects[snapshot_key("Q4515044")] = entity_payload(
        "Q4515044", label="Jasnaja Poljana", claims=item_claim("P17", "Q159")
    )
    s3.objects[snapshot_key("Q2857656")] = entity_payload(
        "Q2857656", label="Astapowo", claims=item_claim("P17", "Q159")
    )
    s3.objects[snapshot_key("Q159")] = entity_payload("Q159", label="Russland")
    return store, s3


def test_backfill_sets_places_from_snapshots_and_updates_index_and_profile() -> None:
    store, s3 = prepared_store()
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 7, 31))

    assert report["updated"] == {"Q9312": {
        "birth_place": "Jasnaja Poljana, Russland",
        "death_place": "Astapowo, Russland",
    }}
    assert report["already_set"] == 1
    assert report["errors"] == {}
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    assert index[0]["birth_place"] == "Jasnaja Poljana, Russland"
    assert index[1]["birth_place"] == "Shrewsbury, Vereinigtes Königreich"
    profile = json.loads(s3.objects["pipeline/published/Q9312/profile.json"])
    assert profile["death_place"] == "Astapowo, Russland"
    # Changelog-Bericht wurde als Audit-Trail geschrieben.
    assert any("backfill-places" in key for key in s3.objects)


def test_backfill_dry_run_changes_nothing() -> None:
    store, s3 = prepared_store()
    before = dict(s3.objects)
    report = run_backfill(store=store, dry_run=True, run_date=date(2026, 7, 31))

    assert "Q9312" in report["updated"]
    assert s3.objects == before


def test_backfill_without_place_claims_stays_unresolved_without_write() -> None:
    store, s3 = prepared_store()
    s3.objects[snapshot_key("Q9312")] = entity_payload("Q9312", label="Lew Tolstoi")
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 7, 31))

    assert report["updated"] == {}
    assert report["unresolved"] == ["Q9312"]
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    assert "birth_place" not in index[0]


def test_backfill_fills_only_missing_field() -> None:
    store, s3 = prepared_store()
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    index[0]["birth_place"] = "Kuratierter Ort"  # vorhandene Werte nie ueberschreiben
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(index).encode("utf-8")
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 7, 31))

    assert report["updated"] == {"Q9312": {"death_place": "Astapowo, Russland"}}
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    assert index[0]["birth_place"] == "Kuratierter Ort"


def test_backfill_appends_missing_country_to_city_only_value() -> None:
    """Bestandswert "Jasnaja Poljana" bekommt das Land nachtraeglich."""
    store, s3 = prepared_store()
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    index[0]["birth_place"] = "Jasnaja Poljana"  # Stadt ohne Land (alte Regel)
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(index).encode("utf-8")
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 8, 3))

    assert report["updated"]["Q9312"]["birth_place"] == "Jasnaja Poljana, Russland"
    assert report["upgraded"] == 1
    assert report["filled"] == 1  # death_place war leer
    assert json.loads(s3.objects[PUBLISH_INDEX_KEY])[0]["birth_place"] == \
        "Jasnaja Poljana, Russland"


def test_backfill_uses_the_statement_that_names_the_published_place() -> None:
    """Fall Alfred Nobel: bevorzugt ist die Gemeinde, publiziert ist Stockholm."""
    store, s3 = prepared_store()
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    index[0]["birth_place"] = "Stockholm"
    index[0]["death_place"] = "Astapowo, Russland"
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(index).encode("utf-8")
    s3.objects[snapshot_key("Q9312")] = entity_payload("Q9312", label="Lew Tolstoi", claims={
        "P19": [
            {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q54006791"}}},
             "rank": "preferred"},
            {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q1754"}}},
             "rank": "normal"},
        ]
    })
    s3.objects[snapshot_key("Q54006791")] = entity_payload(
        "Q54006791", label="Jakob and Johannes parish", claims=item_claim("P17", "Q34")
    )
    s3.objects[snapshot_key("Q1754")] = entity_payload(
        "Q1754", label="Stockholm", claims=item_claim("P17", "Q34")
    )
    s3.objects[snapshot_key("Q34")] = entity_payload("Q34", label="Schweden")
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 8, 3))

    assert report["updated"]["Q9312"]["birth_place"] == "Stockholm, Schweden"
    assert report["mismatch"] == {}


def test_backfill_falls_back_to_the_administrative_chain() -> None:
    """Ohne passendes Statement zaehlt P131: Windlesham Manor liegt in Crowborough."""
    store, s3 = prepared_store()
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    index[0]["birth_place"] = "Crowborough"
    index[0]["death_place"] = "Astapowo, Russland"
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(index).encode("utf-8")
    s3.objects[snapshot_key("Q9312")] = entity_payload(
        "Q9312", label="Lew Tolstoi", claims=item_claim("P19", "Q8025265")
    )
    s3.objects[snapshot_key("Q8025265")] = entity_payload(
        "Q8025265", label="Windlesham Manor",
        claims={**item_claim("P17", "Q145"), **item_claim("P131", "Q2288772")},
    )
    s3.objects[snapshot_key("Q2288772")] = entity_payload("Q2288772", label="Crowborough")
    s3.objects[snapshot_key("Q145")] = entity_payload(
        "Q145", label="Vereinigtes Königreich"
    )
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 8, 3))

    assert report["updated"]["Q9312"]["birth_place"] == "Crowborough, Vereinigtes Königreich"


def test_backfill_leaves_place_alone_when_it_is_not_in_the_chain() -> None:
    """Fall David Hilbert: "Snamensk" liegt nicht in Kaliningrad."""
    store, s3 = prepared_store()
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    index[0]["birth_place"] = "Snamensk"
    index[0]["death_place"] = "Astapowo, Russland"
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(index).encode("utf-8")
    s3.objects[snapshot_key("Q9312")] = entity_payload(
        "Q9312", label="Lew Tolstoi", claims=item_claim("P19", "Q1829")
    )
    s3.objects[snapshot_key("Q1829")] = entity_payload(
        "Q1829", label="Kaliningrad", claims=item_claim("P17", "Q159")
    )
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 8, 3))

    assert report["updated"] == {}
    assert report["mismatch"]["Q9312"]["birth_place"] == ["Snamensk", "Kaliningrad, Russland"]
    assert json.loads(s3.objects[PUBLISH_INDEX_KEY])[0]["birth_place"] == "Snamensk"


def test_covers_matches_on_word_boundaries_only() -> None:
    from app.workers.backfill_places import _covers

    assert _covers("Gemeinde Stockholm", "Stockholm")
    assert _covers("Stockholm", "Stockholm")
    assert _covers("Landkreis Frankfurt am Main", "Frankfurt am Main")
    assert not _covers("Halland", "Halle")       # keine Teilzeichenkette
    assert not _covers("Stockholm", "Gemeinde Stockholm")  # nur aufwaerts


def test_backfill_never_rewrites_a_differing_city_name() -> None:
    """Weicht die Stadt ab, bleibt der Bestandswert stehen — nur Bericht."""
    store, s3 = prepared_store()
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    index[0]["birth_place"] = "Jasnaja"  # anderer Ortsname
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(index).encode("utf-8")
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 8, 3))

    assert "birth_place" not in report["updated"]["Q9312"]
    assert report["mismatch"]["Q9312"]["birth_place"] == \
        ["Jasnaja", "Jasnaja Poljana, Russland"]
    assert json.loads(s3.objects[PUBLISH_INDEX_KEY])[0]["birth_place"] == "Jasnaja"


def test_backfill_leaves_complete_values_untouched() -> None:
    """"Stadt, Land" wird nie angefasst — auch kuratierte Korrekturen nicht."""
    store, s3 = prepared_store()
    index = json.loads(s3.objects[PUBLISH_INDEX_KEY])
    index[0]["birth_place"] = "Kuratierte Stadt, Kuratiertes Land"
    index[0]["death_place"] = "Astapowo, Russland"
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(index).encode("utf-8")
    report = run_backfill(store=store, dry_run=False, run_date=date(2026, 8, 3))

    assert report["updated"] == {}
    assert report["already_set"] == 2
    assert json.loads(s3.objects[PUBLISH_INDEX_KEY])[0]["birth_place"] == \
        "Kuratierte Stadt, Kuratiertes Land"


# --- Ein-Land-Regel (identisch zu wikidata_candidates._place) ---

def test_claim_item_ids_skips_deprecated_and_sorts_preferred_first() -> None:
    """Sofja Kowalewskaja: P20 "Spanien" ist in Wikidata deprecated."""
    person = {"claims": {"P20": [
        {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q29"}}},
         "rank": "deprecated"},
        {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q10519255"}}},
         "rank": "normal"},
    ]}}
    assert claim_item_ids(person, "P20") == ("Q10519255",)

    mit_vorzug = {"claims": {"P19": [
        {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q1"}}},
         "rank": "normal"},
        {"mainsnak": {"snaktype": "value", "datavalue": {"value": {"id": "Q2"}}},
         "rank": "preferred"},
    ]}}
    # Bevorzugt zuerst; die uebrigen bleiben fuer die Bestandssuche erhalten.
    assert claim_item_ids(mit_vorzug, "P19") == ("Q2", "Q1")
    # Ohne Rang-Angabe (Testdaten, aeltere Snapshots) bleibt alles erhalten.
    assert claim_item_ids({"claims": item_claim("P19", "Q1", "Q2")}, "P19") == ("Q1", "Q2")


def test_current_country_prefers_preferred_rank_over_historic_states() -> None:
    """Berlin fuehrt elf Staaten; bevorzugt ist genau der heutige."""
    berlin = {"claims": country_claim(
        ("Q27306", "normal", "+1871-01-17T00:00:00Z"),   # Preussen, beendet
        ("Q43287", "normal", "+1918-11-28T00:00:00Z"),   # Deutsches Reich, beendet
        ("Q183", "preferred", None),                      # Deutschland, heute
        ("Q16957", "normal", "+1990-10-02T00:00:00Z"),   # DDR, beendet
    )}
    assert current_country_ids(berlin) == ("Q183",)


def test_current_country_falls_back_to_statements_without_end_date() -> None:
    """Ohne bevorzugten Rang zaehlt, was kein Enddatum hat (Thagaste)."""
    thagaste = {"claims": country_claim(
        ("Q4368", "normal", "+0435-00-00T00:00:00Z"),    # Numidien, beendet
        ("Q142", "normal", "+1962-07-05T00:00:00Z"),     # Frankreich, beendet
        ("Q262", "normal", None),                         # Algerien, heute
    )}
    assert current_country_ids(thagaste) == ("Q262",)


def test_current_country_ignores_deprecated_and_keeps_single_normal() -> None:
    mexiko_stadt = {"claims": country_claim(("Q96", "normal", None))}
    assert current_country_ids(mexiko_stadt) == ("Q96",)
    widerlegt = {"claims": country_claim(("Q1", "deprecated", None))}
    assert current_country_ids(widerlegt) == ()
    assert current_country_ids({"claims": {}}) == ()


def test_current_country_stays_ambiguous_when_several_states_are_ongoing() -> None:
    """Zwei laufende Staaten ohne Vorzug: lieber kein Land als ein falsches."""
    strittig = {"claims": country_claim(("Q1", "normal", None), ("Q2", "normal", None))}
    assert current_country_ids(strittig) == ("Q1", "Q2")


def test_resolver_appends_country_for_city_with_historic_states() -> None:
    """Regressionstest zum Livebefund: Stockholm bekam kein Land."""
    entities = {
        "Q1754": {"labels": {"de": {"value": "Stockholm"}}, "claims": country_claim(
            ("Q34", "preferred", None),
            ("Q62623", "normal", None),
            ("Q62589", "normal", "+1905-06-07T00:00:00Z"),
        )},
        "Q34": {"labels": {"de": {"value": "Schweden"}}, "claims": {}},
    }
    resolver = PlaceResolver(entities.get)
    assert resolver.resolve("Q1754") == "Stockholm, Schweden"


def test_format_place_appends_country_only_when_unambiguous() -> None:
    assert format_place("Ulm", {"Deutschland"}) == "Ulm, Deutschland"
    assert format_place("Thagaste", {"Numidien", "Algerien", "Frankreich"}) == "Thagaste"
    assert format_place("Monaco", {"Monaco"}) == "Monaco"
    assert format_place(None, {"Deutschland"}) is None


def test_place_resolver_caches_and_swallows_fetch_errors() -> None:
    calls: list[str] = []

    def fetch(qid: str) -> dict | None:
        calls.append(qid)
        if qid == "Q404":
            raise RuntimeError("kaputt")
        return {"labels": {"de": {"value": "Ulm"}}, "claims": {}}

    resolver = PlaceResolver(fetch)
    assert resolver.resolve("Q3012") == "Ulm"
    assert resolver.resolve("Q3012") == "Ulm"
    assert resolver.resolve("Q404") is None
    assert calls == ["Q3012", "Q404"]
