"""Tests fuer den kuratierten Seed-Worker (app.workers.seed_candidates)."""

from datetime import date

import pytest

from app.ai.historical_pipeline import PipelineConfig
from app.integrations.candidate_store import CANDIDATE_PREFIX, CandidateStore
from app.workers.seed_candidates import (
    _wb_time_to_date,
    death_year_hint,
    load_seed_file,
    resolve_candidate,
    run_seed,
)

CONFIG = PipelineConfig(enabled=True)
NO_SLEEP = lambda *_: None  # noqa: E731


class FakePaginator:
    def __init__(self, keys):
        self._keys = keys

    def paginate(self, **kwargs):
        prefix = kwargs.get("Prefix", "")
        yield {"Contents": [{"Key": k} for k in self._keys if k.startswith(prefix)]}


class FakeS3:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def put_object(self, *, Bucket, Key, Body, ContentType):
        self.objects[Key] = Body

    def get_object(self, *, Bucket, Key):
        import io

        return {"Body": io.BytesIO(self.objects[Key])}

    def get_paginator(self, name):
        return FakePaginator(list(self.objects))


def seed(name="Max Planck", death="1947-10-04", **extra) -> dict:
    return {"name": name, "death_date": death, "category": "Wissenschaft",
            "language": "de", "name_variants": [], **extra}


def search_payload(*qids: str) -> dict:
    return {"search": [{"id": q} for q in qids]}


def entity(qid: str, death: str | None, birth: str | None = None, sitelinks: int = 60) -> dict:
    claims = {}
    if death:
        claims["P570"] = [{"mainsnak": {"snaktype": "value",
                                        "datavalue": {"value": {"time": death, "precision": 11}}}}]
    if birth:
        claims["P569"] = [{"mainsnak": {"snaktype": "value",
                                        "datavalue": {"value": {"time": birth, "precision": 11}}}}]
    return {qid: {"claims": claims, "sitelinks": {f"s{i}": {} for i in range(sitelinks)}}}


def make_fetch(search: dict, entities: dict):
    def fetch(url: str, **kwargs) -> dict:
        return search if "wbsearchentities" in url else {"entities": entities}
    return fetch


# --- Zeit-Parsing ---

def test_wb_time_parses_day_and_year_precision_and_rejects_bc() -> None:
    assert _wb_time_to_date({"time": "+1947-10-04T00:00:00Z"}) == date(1947, 10, 4)
    assert _wb_time_to_date({"time": "+1320-00-00T00:00:00Z"}) == date(1320, 1, 1)
    assert _wb_time_to_date({"time": "-0429-00-00T00:00:00Z"}) is None
    assert _wb_time_to_date(None) is None


def test_death_year_hint_from_date_and_label() -> None:
    assert death_year_hint({"death_date": "1947-10-04"}) == 1947
    assert death_year_hint({"death_date": None, "death_label": "um 1320"}) == 1320
    assert death_year_hint({"death_date": None, "death_label": None}) is None


# --- QID-Aufloesung ---

def test_resolve_accepts_only_matching_death_year() -> None:
    fetch = make_fetch(
        search_payload("Q9999", "Q107032"),
        {**entity("Q9999", "+1980-01-01T00:00:00Z"),      # Namensvetter, falsches Jahr
         **entity("Q107032", "+1947-10-04T00:00:00Z", "+1858-04-23T00:00:00Z")},
    )
    resolution = resolve_candidate(seed(), fetch_json=fetch, sleep=NO_SLEEP)
    assert resolution["qid"] == "Q107032"
    assert resolution["death_date"] == date(1947, 10, 4)
    assert resolution["birth_date"] == date(1858, 4, 23)


def test_resolve_returns_none_without_match_or_hint() -> None:
    fetch = make_fetch(search_payload("Q1"), entity("Q1", "+1700-01-01T00:00:00Z"))
    assert resolve_candidate(seed(), fetch_json=fetch, sleep=NO_SLEEP) is None
    assert resolve_candidate({"name": "X", "category": "Kunst"},
                             fetch_json=fetch, sleep=NO_SLEEP) is None


# --- Seed-Lauf ---

def test_run_seed_saves_accepted_and_writes_seed_changelog() -> None:
    fake = FakeS3()
    store = CandidateStore(fake, "smyst-memories")
    fetch = make_fetch(search_payload("Q107032"),
                       entity("Q107032", "+1947-10-04T00:00:00Z"))
    report = run_seed([seed()], config=CONFIG, store=store, dry_run=False,
                      run_date=date(2026, 7, 16), fetch_json=fetch, sleep=NO_SLEEP)
    assert report["totals"] == {"seeds": 1, "accepted": 1, "rejected": 0,
                                "skipped_duplicates": 0, "unresolved": 0}
    assert f"{CANDIDATE_PREFIX}Q107032.json" in fake.objects
    assert "pipeline/changelogs/2026-07-16-seed.json" in fake.objects


def test_run_seed_skips_existing_qid_and_reports_unresolved() -> None:
    fake = FakeS3()
    store = CandidateStore(fake, "smyst-memories")
    fetch = make_fetch(search_payload("Q107032"),
                       entity("Q107032", "+1947-10-04T00:00:00Z"))
    run_seed([seed()], config=CONFIG, store=store, dry_run=False,
             run_date=date(2026, 7, 16), fetch_json=fetch, sleep=NO_SLEEP)
    report = run_seed(
        [seed(), seed(name="Voellig Unbekannt", death="1900-01-01")],
        config=CONFIG, store=store, dry_run=False,
        run_date=date(2026, 7, 17), fetch_json=fetch, sleep=NO_SLEEP,
    )
    assert report["totals"]["skipped_duplicates"] == 1
    # "Voellig Unbekannt" findet Q107032, aber 1947 passt nicht zu 1900 -> unresolved
    assert report["totals"]["unresolved"] == 1


def test_run_seed_dry_run_writes_nothing() -> None:
    fake = FakeS3()
    store = CandidateStore(fake, "smyst-memories")
    fetch = make_fetch(search_payload("Q107032"),
                       entity("Q107032", "+1947-10-04T00:00:00Z"))
    report = run_seed([seed()], config=CONFIG, store=store, dry_run=True,
                      run_date=date(2026, 7, 16), fetch_json=fetch, sleep=NO_SLEEP)
    assert report["totals"]["accepted"] == 1
    assert fake.objects == {}


def test_run_seed_rejects_estate_blacklist_block() -> None:
    fake = FakeS3()
    store = CandidateStore(fake, "smyst-memories")
    fetch = make_fetch(search_payload("Q4616"),
                       entity("Q4616", "+1962-08-04T00:00:00Z"))
    report = run_seed(
        [seed(name="Marilyn Monroe", death="1962-08-04", category="Kunst")],
        config=CONFIG, store=store, dry_run=False,
        run_date=date(2026, 7, 16), fetch_json=fetch, sleep=NO_SLEEP,
    )
    assert report["totals"]["accepted"] == 0
    assert report["totals"]["rejected"] == 1
    assert not any(k.startswith(CANDIDATE_PREFIX) for k in fake.objects)


# --- Seed-Datei ---

def test_load_seed_file_validates_structure(tmp_path) -> None:
    good = tmp_path / "good.json"
    good.write_text('{"candidates": [{"name": "A", "category": "Kunst"}]}', encoding="utf-8")
    assert load_seed_file(good)[0]["name"] == "A"

    bad = tmp_path / "bad.json"
    bad.write_text('{"candidates": [{"name": "A"}]}', encoding="utf-8")
    with pytest.raises(ValueError):
        load_seed_file(bad)


def test_resolve_falls_back_to_curated_birth_when_wikidata_missing() -> None:
    fetch = make_fetch(search_payload("Q8018"), entity("Q8018", "+0430-08-28T00:00:00Z"))
    resolution = resolve_candidate(
        seed(name="Augustinus von Hippo", death="0430-08-28", birth_date="0354-11-13"),
        fetch_json=fetch, sleep=NO_SLEEP)
    assert resolution["death_date"] == date(430, 8, 28)
    assert resolution["birth_date"] == date(354, 11, 13)


def test_resolve_carries_curated_labels_for_approximate_dates() -> None:
    fetch = make_fetch(search_payload("Q131805"), entity("Q131805", "+1536-07-12T00:00:00Z"))
    resolution = resolve_candidate(
        seed(name="Erasmus von Rotterdam", death="1536-07-12",
             birth_date=None, birth_label="um 1466"),
        fetch_json=fetch, sleep=NO_SLEEP)
    assert resolution["birth_date"] is None
    assert resolution["birth_label"] == "um 1466"
