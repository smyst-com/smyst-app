from datetime import date

import pytest

from app.ai.estate_blacklist import ESTATE_BLACKLIST, find_estate_entry, publicity_risk
from app.ai.historical_pipeline import HistoricalCandidate, PipelineConfig, RiskResult
from app.ai.wikidata_candidates import (
    CATEGORY_OCCUPATIONS,
    build_sparql_query,
    parse_sparql_bindings,
    screen_candidates,
)
from app.integrations.candidate_store import (
    CANDIDATE_PREFIX,
    CandidateStore,
    candidate_document,
)

CONFIG = PipelineConfig(enabled=True, daily_candidate_limit=10, min_sitelinks=15)


def binding(qid: str, label: str, death: str, sitelinks: int) -> dict:
    return {
        "person": {"value": f"http://www.wikidata.org/entity/{qid}"},
        "personLabel": {"value": label},
        "death": {"value": death},
        "sitelinks": {"value": str(sitelinks)},
    }


def payload(*rows: dict) -> dict:
    return {"results": {"bindings": list(rows)}}


# --- Blacklist ---

def test_blacklist_has_at_least_50_entries_with_valid_severity() -> None:
    assert len(ESTATE_BLACKLIST) >= 50
    assert all(e.severity in ("block", "manual_review") for e in ESTATE_BLACKLIST)
    qids = [e.qid for e in ESTATE_BLACKLIST if e.qid]
    assert len(qids) == len(set(qids)), "doppelte QIDs in der Blacklist"


def test_blacklist_matches_by_qid_and_name_fallback() -> None:
    assert publicity_risk("Q4616", "irrelevant") is RiskResult.BLOCK          # Monroe (ABG)
    assert publicity_risk(None, "Marilyn  MONROE") is RiskResult.BLOCK
    # Einstein/Turing 2026-07-02 herabgestuft: Publicity Right abgelaufen (HUJ v. GM 2012) / UK ohne postmortales Recht
    assert publicity_risk("Q937", "Albert Einstein") is RiskResult.MANUAL_REVIEW
    assert publicity_risk("Q7251", "Alan Turing") is RiskResult.MANUAL_REVIEW
    assert publicity_risk(None, "Antoine de Saint-Exupéry") is RiskResult.MANUAL_REVIEW
    assert publicity_risk("Q762", "Leonardo da Vinci") is RiskResult.PASS
    assert find_estate_entry(None, "unbekannte person") is None


# --- Query-Builder ---

def test_query_contains_cutoff_sitelinks_and_occupation() -> None:
    query = build_sparql_query(category="Wissenschaft", config=CONFIG, limit=7, offset=3)
    for qid in CATEGORY_OCCUPATIONS["Wissenschaft"]:
        assert f"wd:{qid}" in query
    assert "P279" not in query  # kein Subklassen-Pfad: WDQS-Timeout (Run #3)
    assert f"YEAR(?death) <= {CONFIG.max_death_year}" in query
    assert f"?sitelinks >= {CONFIG.min_sitelinks}" in query
    assert "LIMIT 7" in query and "OFFSET 3" in query


def test_unknown_category_raises() -> None:
    with pytest.raises(KeyError):
        build_sparql_query(category="Unbekannt", config=CONFIG)


# --- Parser ---

def test_parse_bindings_builds_candidates_and_drops_bad_dates() -> None:
    rows = payload(
        binding("Q1035", "Charles Darwin", "1882-04-19T00:00:00Z", 250),
        binding("Q9999999", "Kaputt", "kein-datum", 99),
    )
    parsed = parse_sparql_bindings(rows, category="Wissenschaft")
    assert len(parsed) == 1
    assert parsed[0].wikidata_qid == "Q1035"
    assert parsed[0].death_date == date(1882, 4, 19)
    assert parsed[0].sitelink_count == 250


# --- Screening ---

def test_screening_dedup_blacklist_and_limits() -> None:
    rows = payload(
        binding("Q1035", "Charles Darwin", "1882-04-19T00:00:00Z", 250),
        binding("Q83359", "James Dean", "1955-09-30T00:00:00Z", 150),      # block (CMG/Indiana)
        binding("Q7245", "Mark Twain", "1910-04-21T00:00:00Z", 200),       # manual_review
        binding("Q1035", "Charles Darwin", "1882-04-19T00:00:00Z", 250),   # Dublette im Lauf
        binding("Q555", "Vergessener Autor", "1950-01-01T00:00:00Z", 5),   # zu wenig Sitelinks
        binding("Q666", "Zu Spaet", "1990-01-01T00:00:00Z", 100),          # nach Cutoff
        binding("Q777", "Schon Da", "1900-01-01T00:00:00Z", 100),          # bereits im Store
    )
    parsed = parse_sparql_bindings(rows, category="Wissenschaft")
    result = screen_candidates(parsed, existing_qids={"Q777"}, config=CONFIG)

    accepted_qids = [c.wikidata_qid for c in result.accepted]
    assert accepted_qids == ["Q1035", "Q7245"]
    twain = result.accepted[1]
    assert twain.risk_flags == {"publicity": "manual_review"}
    reasons = {c.wikidata_qid: reason for c, reason in result.rejected}
    assert "block" in reasons["Q83359"]
    assert "Sitelinks" in reasons["Q555"]
    assert "Sterbejahr" in reasons["Q666"]
    assert set(result.skipped_duplicates) == {"Q777", "Q1035"}


def test_screening_respects_daily_limit() -> None:
    rows = payload(
        *[binding(f"Q{i}", f"Person {i}", "1900-01-01T00:00:00Z", 50) for i in range(1, 8)]
    )
    parsed = parse_sparql_bindings(rows, category="Kunst")
    small = PipelineConfig(daily_candidate_limit=3, min_sitelinks=15)
    result = screen_candidates(parsed, existing_qids=set(), config=small)
    assert len(result.accepted) == 3


# --- Store (Fake-S3) ---

class FakePaginator:
    def __init__(self, keys: list[str]) -> None:
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


def make_candidate(qid: str = "Q1035") -> HistoricalCandidate:
    return HistoricalCandidate(
        wikidata_qid=qid,
        name="Charles Darwin",
        death_date=date(1882, 4, 19),
        category="Wissenschaft",
        sitelink_count=250,
    )


def test_store_roundtrip_and_dedup_index() -> None:
    fake = FakeS3()
    store = CandidateStore(fake, "smyst-memories")
    key = store.save_candidate(make_candidate())
    assert key == f"{CANDIDATE_PREFIX}Q1035.json"
    assert store.existing_qids() == {"Q1035"}
    doc = store.load_candidate_document("Q1035")
    assert doc["status"] == "candidate"
    assert doc["death_date"] == "1882-04-19"
    assert doc["audit_trail"] == []


def test_changelog_written_with_report() -> None:
    fake = FakeS3()
    store = CandidateStore(fake, "smyst-memories")
    store.save_changelog(date(2026, 7, 2), {"totals": {"accepted": 2}})
    assert "pipeline/changelogs/2026-07-02.json" in fake.objects


def test_candidate_document_is_json_serializable() -> None:
    import json

    from app.integrations.candidate_store import _json_default

    doc = candidate_document(make_candidate())
    json.dumps(doc, default=_json_default)


# --- Worker-Robustheit (Run #7: WDQS 502) ---

def test_fetch_bindings_retries_on_5xx(monkeypatch) -> None:
    import httpx as httpx_mod

    from app.workers import ingest_candidates as worker

    calls = {"n": 0}

    class FakeResponse:
        def __init__(self, status_code: int) -> None:
            self.status_code = status_code
            self.request = httpx_mod.Request("GET", "https://query.wikidata.org/sparql")

        def raise_for_status(self) -> None:
            pass

        def json(self) -> dict:
            return {"results": {"bindings": []}}

    def fake_get(url, **kwargs):
        calls["n"] += 1
        return FakeResponse(502 if calls["n"] < 3 else 200)

    monkeypatch.setattr(worker.httpx, "get", fake_get)
    payload = worker.fetch_bindings("SELECT 1", sleep=lambda s: None)
    assert calls["n"] == 3
    assert payload == {"results": {"bindings": []}}


def test_run_ingest_continues_after_category_error(monkeypatch) -> None:
    from app.workers import ingest_candidates as worker

    def fake_fetch(query, **kwargs):
        if "Q1028181" in query:  # Kunst (Maler) klemmt
            raise RuntimeError("WDQS 502")
        return payload(binding("Q1035", "Charles Darwin", "1882-04-19T00:00:00Z", 250))

    monkeypatch.setattr(worker, "fetch_bindings", fake_fetch)
    store = CandidateStore(FakeS3(), "smyst-memories")
    report = worker.run_ingest(
        categories=["Kunst", "Wissenschaft"], config=CONFIG, store=store,
        dry_run=False, run_date=date(2026, 7, 3),
    )
    assert "Kunst" in report["errors"]
    assert report["categories"]["Wissenschaft"]["accepted"] == ["Q1035"]
    assert report["totals"]["accepted"] == 1


# --- Ingest-Pagination (Befund 20.07.: OFFSET 0 lieferte nur bekannte Top-Namen) ---

import re


def _paged_fetch(monkeypatch, pages: dict[int, dict]):
    """fetch_bindings-Fake, der je OFFSET eine vorbereitete Seite liefert."""
    from app.workers import ingest_candidates as worker

    calls: list[int] = []

    def fake_fetch(query, **kwargs):
        offset = int(re.search(r"OFFSET (\d+)", query).group(1))
        calls.append(offset)
        return pages.get(offset, payload())

    monkeypatch.setattr(worker, "fetch_bindings", fake_fetch)
    return worker, calls


def test_ingest_paginates_past_known_top_names(monkeypatch) -> None:
    # Seite 1 (OFFSET 0) enthaelt nur Namen, die schon im Store sind — genau
    # das Szenario, das die Pipeline ab 20.07. leerlaufen liess. Der Worker
    # muss weiterblaettern und die neuen Namen von Seite 2 aufnehmen.
    pages = {
        0: payload(
            binding("Q1", "Alter Bekannter", "1900-01-01T00:00:00Z", 100),
            binding("Q2", "Auch Bekannt", "1900-01-01T00:00:00Z", 90),
        ),
        2: payload(
            binding("Q3", "Neu Eins", "1900-01-01T00:00:00Z", 80),
            binding("Q4", "Neu Zwei", "1900-01-01T00:00:00Z", 70),
        ),
    }
    worker, calls = _paged_fetch(monkeypatch, pages)
    store = CandidateStore(FakeS3(), "smyst-memories")
    for qid in ("Q1", "Q2"):
        store.save_candidate(make_candidate(qid))

    config = PipelineConfig(enabled=True, daily_candidate_limit=2, min_sitelinks=15)
    report = worker.run_ingest(
        categories=["Wissenschaft"], config=config, store=store,
        dry_run=False, run_date=date(2026, 7, 21),
    )
    assert calls == [0, 2]
    assert report["categories"]["Wissenschaft"]["accepted"] == ["Q3", "Q4"]
    assert report["totals"]["accepted"] == 2
    assert store.existing_qids() >= {"Q1", "Q2", "Q3", "Q4"}


def test_ingest_stops_when_category_exhausted(monkeypatch) -> None:
    # Liefert eine Seite weniger Zeilen als angefragt, ist die Kategorie
    # ausgeschoepft — es darf keine weitere (leere) Anfrage an WDQS gehen.
    pages = {
        0: payload(
            binding("Q10", "Einziger Neuer", "1900-01-01T00:00:00Z", 60),
            binding("Q11", "Zweiter Neuer", "1900-01-01T00:00:00Z", 55),
        ),
    }
    worker, calls = _paged_fetch(monkeypatch, pages)
    store = CandidateStore(FakeS3(), "smyst-memories")

    config = PipelineConfig(enabled=True, daily_candidate_limit=4, min_sitelinks=15)
    report = worker.run_ingest(
        categories=["Wissenschaft"], config=config, store=store,
        dry_run=False, run_date=date(2026, 7, 21),
    )
    assert calls == [0]
    assert report["categories"]["Wissenschaft"]["accepted"] == ["Q10", "Q11"]


def test_ingest_respects_page_cap(monkeypatch) -> None:
    # Volle Seiten ohne einen einzigen neuen Kandidaten: nach
    # MAX_PAGES_PER_CATEGORY ist Schluss, sonst haemmert der Worker WDQS zu.
    full_page = payload(
        binding("Q1", "Alter Bekannter", "1900-01-01T00:00:00Z", 100),
        binding("Q2", "Auch Bekannt", "1900-01-01T00:00:00Z", 90),
    )
    from app.workers.ingest_candidates import MAX_PAGES_PER_CATEGORY

    pages = {
        offset: full_page
        for offset in range(0, 2 * MAX_PAGES_PER_CATEGORY + 1, 2)
    }
    worker, calls = _paged_fetch(monkeypatch, pages)
    store = CandidateStore(FakeS3(), "smyst-memories")
    for qid in ("Q1", "Q2"):
        store.save_candidate(make_candidate(qid))

    config = PipelineConfig(enabled=True, daily_candidate_limit=2, min_sitelinks=15)
    report = worker.run_ingest(
        categories=["Wissenschaft"], config=config, store=store,
        dry_run=False, run_date=date(2026, 7, 21),
    )
    assert len(calls) == MAX_PAGES_PER_CATEGORY
    assert report["categories"]["Wissenschaft"]["accepted"] == []
    assert report["categories"]["Wissenschaft"]["pages"] == MAX_PAGES_PER_CATEGORY
