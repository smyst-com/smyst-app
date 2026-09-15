"""Tests fuer den Profil-Doktor (app.workers.profile_doctor)."""

from __future__ import annotations

import io
import json
from datetime import date, datetime, timezone

from app.integrations.candidate_store import CandidateStore
from app.workers.profile_doctor import (
    MAX_MODEL_ATTEMPTS,
    ROTATION_KEY,
    _honest_label,
    _iso_from_time,
    _word_present,
    find_duplicates,
    parse_model_json,
    render_summary,
    run_doctor,
    select_records,
)

PUBLISH_INDEX_KEY = "pipeline/published/index.json"
NOW = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)


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


def time_claim(prop: str, time: str, precision: int) -> dict:
    return {prop: [{
        "mainsnak": {"snaktype": "value",
                     "datavalue": {"value": {"time": time, "precision": precision}}},
    }]}


def entity_payload(qid: str, *, label: str = "", claims: dict | None = None) -> bytes:
    payload = {"entities": {qid: {
        "labels": {"de": {"value": label}} if label else {},
        "claims": claims or {},
        "sitelinks": {},
    }}}
    return json.dumps(payload).encode("utf-8")


def snapshot_key(qid: str) -> str:
    return f"pipeline/sources/{qid}/wikidata-entitydata.json"


def base_record(qid: str, slug: str, name: str, **extra) -> dict:
    record = {
        "wikidata_qid": qid,
        "slug": slug,
        "name": name,
        "category": "Archaeologie",
        "description": "British politician and archaeologist, bekannt fuer Ausgrabungen in Mesopotamien.",
        "visible": True,
        "qa_passed": True,
    }
    record.update(extra)
    return record


def prepared_store(*, index: list[dict] | None = None) -> tuple[CandidateStore, FakeS3]:
    s3 = FakeS3()
    store = CandidateStore(s3, "smyst-memories")
    entries = index if index is not None else [
        base_record("Q9312", "lew-tolstoi", "Lew Tolstoi"),
    ]
    s3.objects[PUBLISH_INDEX_KEY] = json.dumps(entries).encode("utf-8")
    for entry in entries:
        s3.objects[f"pipeline/published/{entry['wikidata_qid']}/profile.json"] = json.dumps(
            entry
        ).encode("utf-8")
    return store, s3


def run(store: CandidateStore, **kwargs) -> dict:
    defaults = dict(limit=10, dry_run=False, run_date=date(2026, 9, 15), now=NOW,
                    smoke_model=False)
    defaults.update(kwargs)
    return run_doctor(store=store, **defaults)


def live_records(s3: FakeS3) -> list[dict]:
    return json.loads(s3.objects[PUBLISH_INDEX_KEY])


# --- Grundpfad: Wikidata-Snapshots fuellen Orte und Daten -------------------

def test_doctor_fills_places_and_dates_from_snapshots() -> None:
    store, s3 = prepared_store()
    s3.objects[snapshot_key("Q9312")] = entity_payload(
        "Q9312", label="Lew Tolstoi",
        claims={
            **time_claim("P569", "+1828-08-28T00:00:00Z", 11),
            **item_claim("P19", "Q4515044"),
            **item_claim("P20", "Q2857656"),
        },
    )
    s3.objects[snapshot_key("Q4515044")] = entity_payload(
        "Q4515044", label="Jasnaja Poljana", claims=item_claim("P17", "Q159")
    )
    s3.objects[snapshot_key("Q2857656")] = entity_payload(
        "Q2857656", label="Astapowo", claims=item_claim("P17", "Q159")
    )
    s3.objects[snapshot_key("Q159")] = entity_payload("Q159", label="Russland")

    report = run(store)

    changed = report["changed"]["Q9312"]
    assert changed["birth_place"] == "Jasnaja Poljana, Russland"
    assert changed["death_place"] == "Astapowo, Russland"
    assert changed["birth_date"] == "1828-08-28"  # Monatspraezision: echtes Datum
    index = live_records(s3)
    assert index[0]["death_place"] == "Astapowo, Russland"
    profile = json.loads(s3.objects["pipeline/published/Q9312/profile.json"])
    assert profile["birth_place"] == "Jasnaja Poljana, Russland"
    assert any("profile-doctor" in key for key in s3.objects)  # Changelog
    assert ROTATION_KEY in s3.objects                          # Rotations-Ledger
    assert report["changed_slugs"] == ["lew-tolstoi"]


def test_doctor_dry_run_changes_nothing() -> None:
    store, s3 = prepared_store()
    s3.objects[snapshot_key("Q9312")] = entity_payload(
        "Q9312", label="Lew Tolstoi", claims=item_claim("P19", "Q4515044")
    )
    s3.objects[snapshot_key("Q4515044")] = entity_payload(
        "Q4515044", label="Jasnaja Poljana", claims=item_claim("P17", "Q159")
    )
    s3.objects[snapshot_key("Q159")] = entity_payload("Q159", label="Russland")
    before = dict(s3.objects)

    report = run(store, dry_run=True)

    assert report["changed"]["Q9312"]["birth_place"] == "Jasnaja Poljana, Russland"
    assert s3.objects == before


def test_doctor_fixes_fake_precision_labels() -> None:
    """Wikidata kennt nur das Jahr: "1859-01-01" wird zu "1859" — ISO bleibt."""
    store, s3 = prepared_store(index=[
        base_record("Q15130138", "john-george-taylor", "John George Taylor",
                    birth_date="1859-01-01", death_date="1900-01-01",
                    birth_label="1859-01-01", death_label="1900-01-01"),
    ])
    s3.objects[snapshot_key("Q15130138")] = entity_payload(
        "Q15130138", label="John George Taylor",
        claims={
            **time_claim("P569", "+1859-00-00T00:00:00Z", 9),
            **time_claim("P570", "+1900-00-00T00:00:00Z", 9),
        },
    )

    report = run(store)

    assert report["changed"]["Q15130138"] == {"birth_label": "1859", "death_label": "1900"}
    index = live_records(s3)
    assert index[0]["birth_date"] == "1859-01-01"  # ISO-Daten unveraendert
    assert index[0]["birth_label"] == "1859"


def test_doctor_sets_honest_label_when_label_missing() -> None:
    """Fehlendes Label + Jahrespraezision: Merge wuerde "01.01.1859" zeigen."""
    store, s3 = prepared_store(index=[
        base_record("Q1", "a", "A", birth_date="1859-01-01", death_date="1900-01-01"),
    ])
    s3.objects[snapshot_key("Q1")] = entity_payload(
        "Q1", label="A",
        claims={
            **time_claim("P569", "+1859-00-00T00:00:00Z", 9),
            **time_claim("P570", "+1900-00-00T00:00:00Z", 9),
        },
    )

    report = run(store)

    assert report["changed"]["Q1"] == {"birth_label": "1859", "death_label": "1900"}


def test_doctor_never_touches_complete_values() -> None:
    store, s3 = prepared_store(index=[
        base_record("Q1035", "charles-darwin", "Charles Darwin",
                    birth_date="1809-02-12", death_date="1882-04-19",
                    birth_label="12.02.1809, Shrewsbury",
                    death_label="19.04.1882, Down House",
                    birth_place="Shrewsbury, Vereinigtes Königreich",
                    death_place="Down House, Vereinigtes Königreich"),
    ])
    s3.objects[snapshot_key("Q1035")] = entity_payload(
        "Q1035", label="Charles Darwin",
        claims={
            **time_claim("P569", "+1809-02-12T00:00:00Z", 11),
            **time_claim("P570", "+1882-04-19T00:00:00Z", 11),
            **item_claim("P19", "Q1"),
        },
    )
    index_before = json.dumps(live_records(s3))
    profile_before = s3.objects["pipeline/published/Q1035/profile.json"]

    report = run(store)

    assert report["changed"] == {}
    assert json.dumps(live_records(s3)) == index_before
    assert s3.objects["pipeline/published/Q1035/profile.json"] == profile_before


# --- Eigene-Modell-Extraktion mit Anti-Halluzinations-Gate ------------------

def test_model_extraction_requires_literal_place_in_source() -> None:
    store, s3 = prepared_store(index=[
        base_record("Q15130138", "john-george-taylor", "John George Taylor",
                    birth_date="1859-01-01", death_date="1900-01-01"),
    ])
    s3.objects[snapshot_key("Q15130138")] = entity_payload(
        "Q15130138", label="John George Taylor"  # P19/P20 leer
    )
    s3.objects["pipeline/sources/Q15130138/wikipedia-en.json"] = json.dumps({
        "extract": "John George Taylor was a British official; he was born in Leeds and died in Brighton."
    }).encode("utf-8")

    def llm_post(prompt: str) -> str:
        return '{"birth_place": "Leeds, England", "death_place": "Atlantis"}'

    report = run(store, llm_post=llm_post)

    changed = report["changed"]["Q15130138"]
    assert changed["birth_place"] == "Leeds"  # "England" steht nicht im Text -> weg
    assert "death_place" not in changed       # "Atlantis" steht nicht im Text
    assert report["model_extractions"]["Q15130138"] == {"birth_place": "Leeds"}


def test_model_extraction_is_capped_per_profile() -> None:
    store, s3 = prepared_store(index=[
        base_record("Q15130138", "john-george-taylor", "John George Taylor",
                    birth_date="1859-01-01", death_date="1900-01-01"),
    ])
    s3.objects[snapshot_key("Q15130138")] = entity_payload(
        "Q15130138", label="John George Taylor"
    )
    s3.objects["pipeline/sources/Q15130138/wikipedia-en.json"] = json.dumps(
        {"extract": "No places mentioned in this short text at all."}
    ).encode("utf-8")
    calls: list[str] = []

    def llm_post(prompt: str) -> str:
        calls.append(prompt)
        return '{"birth_place": null, "death_place": null}'

    for _ in range(MAX_MODEL_ATTEMPTS + 1):
        run(store, llm_post=llm_post)

    # Zwei Versuche, danach kein Modellaufruf mehr (Kostenbremse).
    assert len(calls) == MAX_MODEL_ATTEMPTS
    stored = json.loads(s3.objects["pipeline/stats/profile-doctor-latest.json"])
    assert stored["model_attempts_skipped"] == ["Q15130138"]


def test_model_extraction_rejects_years_as_place() -> None:
    """Livebefund 15.09.2026: kleines Modell nannte das Sterbejahr "1410" als Ort."""
    store, s3 = prepared_store(index=[
        base_record("Q1070476", "jiang-xing", "Jiang Xing",
                    birth_date="1382-01-01", death_date="1410-01-01"),
    ])
    s3.objects[snapshot_key("Q1070476")] = entity_payload("Q1070476", label="Jiang Xing")
    s3.objects["pipeline/sources/Q1070476/wikipedia-en.json"] = json.dumps(
        {"extract": "He was born in 1382 and died in 1410 during the voyage."}
    ).encode("utf-8")

    def llm_post(prompt: str) -> str:
        return '{"birth_place": null, "death_place": "1410"}'

    report = run(store, llm_post=llm_post)

    assert "Q1070476" not in report["model_extractions"]
    assert report["changed"] == {}


def test_extraction_budget_also_applies_in_only_incomplete_mode() -> None:
    """Nachhol-Modus: Budget begrenzt Modellaufrufe, Audit läuft weiter."""
    index = [base_record(f"Q{i}", f"s{i}", f"N{i}") for i in range(1, 4)]
    store, s3 = prepared_store(index=index)
    for i in range(1, 4):
        s3.objects[snapshot_key(f"Q{i}")] = entity_payload(f"Q{i}", label=f"N{i}")
        s3.objects[f"pipeline/sources/Q{i}/wikipedia-en.json"] = json.dumps(
            {"extract": f"N{i} was born in Stadt{i} in the old country."}
        ).encode("utf-8")
    calls: list[str] = []

    def llm_post(prompt: str) -> str:
        calls.append(prompt)
        return '{"birth_place": null, "death_place": null}'

    report = run(store, llm_post=llm_post, only_incomplete=True,
                 limit=3, extraction_budget=1)

    assert len(calls) == 1                                   # Budget greift
    assert len(report["checked"]) == 3                       # Audit läuft komplett


# --- Widersprueche, Dubletten, Rotation -------------------------------------

def test_contradictions_are_reported_without_change() -> None:
    store, s3 = prepared_store(index=[
        base_record("Q1", "zeitreise", "Zeitreisende",
                    birth_date="1950-01-01", death_date="1900-01-01",
                    birth_label="1950", death_label="1900"),
    ])
    s3.objects[snapshot_key("Q1")] = entity_payload("Q1", label="Zeitreisende")

    report = run(store)

    assert report["contradictions"]["Q1"]
    assert report["changed"] == {}
    assert live_records(s3)[0]["birth_date"] == "1950-01-01"  # nur Bericht


def test_duplicates_are_detected_report_only() -> None:
    index = [
        base_record("Q1", "heinrich-meibom", "Heinrich Meibom",
                    birth_date="1580-01-01", death_date="1655-01-01"),
        base_record("Q2", "heinrich-meibom-2", "Heinrich Meibom",
                    birth_date="1580-01-01", death_date="1655-01-01"),
        base_record("Q3", "andere", "Andere Person", birth_date="1900-05-05"),
    ]
    duplicates = find_duplicates(index)
    assert len(duplicates) == 1
    assert duplicates[0]["qids"] == ["Q1", "Q2"]
    assert find_duplicates(index[:1]) == []


def test_rotation_checks_unchecked_first_then_oldest() -> None:
    index = [
        base_record("Q1", "a", "A"),
        base_record("Q2", "b", "B"),
        base_record("Q3", "c", "C"),
    ]
    ledger = {"Q2": {"checked_at": "2026-09-14T00:00:00+00:00", "attempts": 0},
              "Q3": {"checked_at": "2026-09-13T00:00:00+00:00", "attempts": 0}}
    selected = select_records(index, ledger, limit=2)
    assert [r["wikidata_qid"] for r in selected] == ["Q1", "Q3"]  # nie -> aeltester


def test_only_incomplete_mode_skips_complete_profiles() -> None:
    index = [
        base_record("Q1", "a", "A"),
        base_record("Q2", "b", "B", birth_place="X, Y", death_place="X, Y"),
    ]
    selected = select_records(index, {}, limit=10, only_incomplete=True)
    assert [r["wikidata_qid"] for r in selected] == ["Q1"]


# --- Selbsttest nach dem Schreiben ------------------------------------------

def test_verify_written_profile_detects_mismatch() -> None:
    from app.workers.profile_doctor import _verify_written_profile

    store, s3 = prepared_store(index=[base_record("Q9", "x", "X")])
    before = {"slug": "x", "name": "X"}
    s3.objects["pipeline/published/Q9/profile.json"] = json.dumps(
        {"slug": "x", "name": "X", "birth_place": "falsch"}
    ).encode("utf-8")

    assert _verify_written_profile(store, "Q9", before=before,
                                   expected_updates={"birth_place": "richtig"})
    assert _verify_written_profile(store, "Q9", before=before,
                                   expected_updates={}) is None


# --- Chat-Rauchprobe ---------------------------------------------------------

def test_chat_smoke_reports_model_answer() -> None:
    store, _s3 = prepared_store(index=[base_record("Q1", "a", "A")])

    report = run(store, llm_post=lambda _prompt: "Ja", smoke_model=True)
    assert report["chat_smoke"] == "ok"

    report_leer = run(store, llm_post=lambda _prompt: "  ", smoke_model=True)
    assert report_leer["chat_smoke"] == "leere Antwort"


# --- Hilfsfunktionen ---------------------------------------------------------

def test_parse_model_json_variants() -> None:
    assert parse_model_json('Antwort: {"birth_place": "Leeds"} fertig') == \
        {"birth_place": "Leeds"}
    parsed = parse_model_json('{"birth_place": "X", "death_place": null}')
    assert parsed == {"birth_place": "X", "death_place": None}
    assert parse_model_json('kein json') == {}
    assert parse_model_json(None) == {}


def test_word_present_uses_word_boundaries() -> None:
    assert _word_present("er wohnte in Halle", "Halle")
    assert not _word_present("die Region Halland", "Halle")
    assert not _word_present("", "Halle")


def test_honest_label_by_precision() -> None:
    assert _honest_label({"time": "+1859-00-00T00:00:00Z", "precision": 9}) == "1859"
    assert _honest_label({"time": "+1850-00-00T00:00:00Z", "precision": 8}) == "ca. 1850"
    assert _honest_label({"time": "+1859-03-00T00:00:00Z", "precision": 11}) == "03.1859"
    assert _honest_label({"time": "+1859-03-14T00:00:00Z", "precision": 11}) == "03.1859"
    assert _honest_label({"time": "+1859-03-14T00:00:00Z", "precision": 10}) is None


def test_iso_from_time_rejects_bc_and_out_of_range() -> None:
    assert _iso_from_time({"time": "+1859-00-00T00:00:00Z"}) == "1859-01-01"
    assert _iso_from_time({"time": "-0384-00-00T00:00:00Z"}) is None  # v. Chr.
    assert _iso_from_time({"time": "+99999-01-01T00:00:00Z"}) is None
    assert _iso_from_time({"time": "kaputt"}) is None


def test_render_summary_contains_counts() -> None:
    summary = render_summary({"checked": ["Q1"], "total_index": 100,
                              "changed": {"Q1": {}}, "model_extractions": {},
                              "contradictions": {}, "duplicates": [],
                              "needs_rebuild": [], "errors": {}, "dry_run": False})
    assert "Geprüft: **1**" in summary
    assert "Korrigiert/ergänzt: **1**" in summary
