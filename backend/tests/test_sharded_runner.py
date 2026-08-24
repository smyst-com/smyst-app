"""Tests fuer den Scale-2k Sharded Runner (Circuit-Breaker bei Provider-Ausfall)."""

from __future__ import annotations

import pytest

from app.workers import sharded_runner


class _FakeStore:
    def __init__(self, documents):
        self._documents = documents

    def candidate_documents_by_status(self, status, limit=1000):
        return self._documents.get(status, [])


def _doc(qid, name="Testperson"):
    return {"wikidata_qid": qid, "name": name}


def _install(monkeypatch, documents):
    monkeypatch.setattr(sharded_runner, "build_s3_client", lambda: object())
    monkeypatch.setattr(sharded_runner, "CandidateStore", lambda client, bucket: _FakeStore(documents))


def test_circuit_breaker_aborts_after_consecutive_degraded(monkeypatch):
    """3x 'skipped (Chat-Provider degradiert)' in Folge -> Shard bricht ab."""
    # Alle QIDs gehoeren zu Shard 0 (Hash ist stabil, Auswahl via Filter-Mock).
    docs = {"candidate": [], "researched": [], "generated": [_doc(f"Q{i}") for i in range(10)]}
    _install(monkeypatch, docs)
    calls = []

    def degraded_worker(doc, **kwargs):
        calls.append(doc["wikidata_qid"])
        return doc["wikidata_qid"], "skipped (Chat-Provider degradiert: provider=x) — Kandidat unbewertet"

    monkeypatch.setattr(sharded_runner, "qa_one", degraded_worker)

    with pytest.raises(RuntimeError, match="circuit breaker"):
        sharded_runner.run_shard(0, 1, 17)

    assert len(calls) == sharded_runner.MAX_CONSECUTIVE_DEGRADED


def test_circuit_breaker_resets_on_success(monkeypatch):
    """Ein erfolgreicher Kandidat setzt den Zaehler zurueck — kein Abbruch."""
    docs = {"candidate": [], "researched": [], "generated": [_doc(f"Q{i}") for i in range(6)]}
    _install(monkeypatch, docs)
    calls = []

    def alternating_worker(doc, **kwargs):
        calls.append(doc["wikidata_qid"])
        ok = len(calls) % 2 == 0
        if ok:
            return doc["wikidata_qid"], "reviewed (QA bestanden, wartet auf menschliche Freigabe)"
        return doc["wikidata_qid"], "skipped (Chat-Provider degradiert: provider=x) — Kandidat unbewertet"

    monkeypatch.setattr(sharded_runner, "qa_one", alternating_worker)

    sharded_runner.run_shard(0, 1, 17)  # darf nicht raisen
    assert len(calls) == 6
