"""Tests fuer Wiederholungen und Fehlersicht der Recherche-Stufe.

Anlass (13.08.2026): Seit die Stufen parallel laufen, stieg die Fehlerquote
der Recherche von ~0 auf 23 % (Lauf 31694475034: 29 von 125) und dann 48 %
(Lauf 31738692617: 61 von 127) — Wikimedia drosselt gleichzeitige Abrufe pro
IP, und GitHub-Runner teilen sich IPs. Diagnostizieren liess sich das nicht,
weil der Worker nur die ANZAHL der Fehler druckte.
"""

from __future__ import annotations

import httpx
import pytest

from app.workers import research_candidates
from app.workers.parallel_map import resolve_concurrency
from app.workers.research_candidates import (
    ENV_RESEARCH_CONCURRENCY,
    RESEARCH_CONCURRENCY,
    _get_json,
    error_kinds,
)


class _Response:
    def __init__(self, status_code: int, payload: dict | None = None) -> None:
        self.status_code = status_code
        self._payload = payload or {}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"HTTP {self.status_code}", request=httpx.Request("GET", "https://x"), response=self
            )

    def json(self) -> dict:
        return self._payload


def _patch_get(monkeypatch, responses):
    calls: list[str] = []

    def fake_get(url, **kwargs):
        calls.append(url)
        item = responses[min(len(calls) - 1, len(responses) - 1)]
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(httpx, "get", fake_get)
    return calls


def test_rate_limit_is_retried_and_then_succeeds(monkeypatch) -> None:
    calls = _patch_get(monkeypatch, [_Response(429), _Response(200, {"ok": True})])
    slept: list[float] = []
    assert _get_json("https://x", sleep=slept.append) == {"ok": True}
    assert len(calls) == 2
    assert slept == [1]  # wachsende Wartezeit, erster Schritt 1 s


def test_network_error_is_retried(monkeypatch) -> None:
    calls = _patch_get(
        monkeypatch, [httpx.ConnectError("weg"), _Response(200, {"ok": True})]
    )
    assert _get_json("https://x", sleep=lambda _: None) == {"ok": True}
    assert len(calls) == 2


def test_not_found_is_NOT_retried(monkeypatch) -> None:
    """404 ist eine echte Absage — Wiederholen kostet nur Zeit und Kontingent."""
    calls = _patch_get(monkeypatch, [_Response(404)])
    with pytest.raises(httpx.HTTPStatusError):
        _get_json("https://x", sleep=lambda _: None)
    assert len(calls) == 1


def test_gives_up_after_the_last_attempt(monkeypatch) -> None:
    calls = _patch_get(monkeypatch, [_Response(429)])
    with pytest.raises(httpx.HTTPStatusError):
        _get_json("https://x", attempts=3, sleep=lambda _: None)
    assert len(calls) == 3


def test_research_uses_a_lower_concurrency_than_the_other_stages(monkeypatch) -> None:
    """Die Recherche spricht mit Wikimedia, nicht mit unserem Gateway."""
    monkeypatch.delenv(ENV_RESEARCH_CONCURRENCY, raising=False)
    assert RESEARCH_CONCURRENCY == 2
    assert resolve_concurrency(None, default=RESEARCH_CONCURRENCY,
                               env_var=ENV_RESEARCH_CONCURRENCY) == 2
    assert resolve_concurrency(None) == 4  # andere Stufen unveraendert


def test_research_concurrency_has_an_env_brake(monkeypatch) -> None:
    monkeypatch.setenv(ENV_RESEARCH_CONCURRENCY, "1")
    assert resolve_concurrency(None, default=RESEARCH_CONCURRENCY,
                               env_var=ENV_RESEARCH_CONCURRENCY) == 1


def test_error_kinds_counts_types() -> None:
    kinds = error_kinds({
        "Q1": "HTTPStatusError: 429 Too Many Requests",
        "Q2": "HTTPStatusError: 429 Too Many Requests",
        "Q3": "ConnectTimeout: zu langsam",
    })
    assert kinds == {"HTTPStatusError": 2, "ConnectTimeout": 1}


def test_error_kinds_is_empty_without_errors() -> None:
    assert error_kinds({}) == {}


def test_report_carries_error_kinds(monkeypatch) -> None:
    """Die Fehlerarten muessen im Report stehen, sonst sind sie im Log unsichtbar."""
    monkeypatch.setattr(
        research_candidates, "research_one",
        lambda document, **kwargs: (_ for _ in ()).throw(httpx.ConnectError("weg")),
    )

    class Store:
        def documents_by_status_progressive(self, status: str, *, limit: int, max_gets: int = 5000, initial_window: int | None = None) -> list[dict]:
            return self.candidate_documents_by_status(status, limit=limit)

        def candidate_documents_by_status(self, status, *, limit=None):
            return [{"wikidata_qid": "Q1"}]

        def save_changelog(self, run_date, report, *, suffix=""):
            return "x"

    from datetime import date

    from app.ai.historical_pipeline import PipelineConfig

    report = research_candidates.run_research(
        store=Store(), config=PipelineConfig(enabled=True), limit=5,
        dry_run=True, run_date=date(2026, 8, 13), concurrency=1,
    )
    assert report["error_kinds"] == {"ConnectError": 1}

class _RecordingStore:
    """Minimal-Store fuer research_one: zaehlt Snapshots, schreibt nichts."""

    def __init__(self) -> None:
        self.snapshots: list[str] = []

    def save_source_snapshot(self, qid, name, data) -> str:  # noqa: ANN001
        self.snapshots.append(name)
        return f"{qid}/{name}"

    def save_research_document(self, qid, document) -> None:  # noqa: ANN001
        pass

    def save_candidate_document(self, qid, document, previous_status=None) -> None:  # noqa: ANN001
        pass


def _entity_payload(qid: str, with_gnd: bool) -> dict:
    claims: dict = {
        "P570": [{"mainsnak": {"snaktype": "value",
                               "datavalue": {"value": {"time": "+1879-03-14T00:00:00Z"}}}}],
    }
    if with_gnd:
        claims["P227"] = [{"mainsnak": {"snaktype": "value", "datavalue": {"value": "118540238"}}}]
    return {"entities": {qid: {
        "labels": {"de": {"value": "Immanuel Kant"}},
        "sitelinks": {"dewiki": {"title": "Immanuel Kant"},
                      "enwiki": {"title": "Immanuel Kant"}},
        "claims": claims,
    }}}


def _research_document(qid: str) -> dict:
    return {
        "wikidata_qid": qid, "name": "Immanuel Kant",
        "death_date": "1879-03-14", "category": "Philosophie",
        "sitelink_count": 200, "status": "candidate",
        "risk_flags": {}, "source_count": 0,
    }


def _wiki_summary() -> dict:
    return {"extract": "Immanuel Kant (1724-1804) war ein Philosoph."}


def test_gnd_helper_extracts_p227_string_claim() -> None:
    from app.workers.research_candidates import _gnd_from_entity

    assert _gnd_from_entity(_entity_payload("Q9316", with_gnd=True), "Q9316") == "118540238"
    assert _gnd_from_entity(_entity_payload("Q9316", with_gnd=False), "Q9316") is None


def test_research_one_cites_lobid_gnd_when_substantive(monkeypatch) -> None:
    # lobid aktiviert 30.09. (Runner-Beweis HTTP 200): Die GND-Antwort mit
    # Substanz wird als Quelle 'lobid.org' verbucht — snapshot + SourceRef.
    from datetime import date

    from app.ai.historical_pipeline import PipelineConfig

    summary = _Response(200, _wiki_summary())
    gnd = _Response(200, {"preferredName": "Immanuel Kant",
                          "professionOrOccupation": [{"label": "Philosoph"}]})
    _patch_get(monkeypatch, [
        _Response(200, _entity_payload("Q9316", with_gnd=True)),  # EntityData
        summary, summary,                                            # de/en-Wikipedia
        gnd,                                                         # lobid/GND
    ])
    store = _RecordingStore()
    _qid, result = research_candidates.research_one(
        _research_document("Q9316"), store=store,
        config=PipelineConfig(enabled=True, min_sources=3),
        dry_run=False,
    )
    assert result == "researched"
    assert "lobid-gnd.json" in store.snapshots


def test_research_one_survives_lobid_outage(monkeypatch) -> None:
    # DNB-Ausfall (TransportError) darf die Recherche niemals bremsen oder
    # ablehnen — ein Versuch, dann weiter ohne die Quelle.
    from app.ai.historical_pipeline import PipelineConfig

    summary = _Response(200, _wiki_summary())
    _patch_get(monkeypatch, [
        _Response(200, _entity_payload("Q9316", with_gnd=True)),
        summary, summary,
        httpx.ConnectError("lobid down"),
    ])
    store = _RecordingStore()
    _qid, result = research_candidates.research_one(
        _research_document("Q9316"), store=store,
        config=PipelineConfig(enabled=True, min_sources=3),
        dry_run=False,
    )
    assert result == "researched"
    assert "lobid-gnd.json" not in store.snapshots
