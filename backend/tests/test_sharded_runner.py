"""Tests fuer den Scale-2k Sharded Runner.

Abgedeckt:
- Circuit-Breaker bei Provider-Ausfall (Befund 24.08.2026)
- Marker-basierte Shard-Auswahl ohne Voll-Scan (Befund 14.09.2026: Die alten
  Stufen-Scans luden bis 1000 Dokumente ueber ALLE Shards und fraessen 60-185
  min je Shard-Job neben ~15 min QA-Arbeit)
- QA-Fairness: ungetestete Kandidaten zuerst (Befund Runde 38: Dauer-Verlierer
  blockierten die Queue)
- Published-Summary als Duplikat-Check-Quelle, Voll-Scan nur als Fallback
"""

from __future__ import annotations

import pytest

from app.workers import sharded_runner


class _FakeStore:
    """Store-Fake mit Marker-Auswahl und GET-Zaehler.

    documents: {status: [doc, ...]} — die Doc-Liste ist zugleich der
    Marker-Bestand (je Doc ein Marker). published_summary: Rueckgabe von
    load_published_summary (None = Datei fehlt -> Fallback).
    """

    def __init__(self, documents, *, published_summary=None, markers=True):
        self._documents = documents
        self._published_summary = published_summary
        self._markers = markers
        self.gets: list[str] = []
        self.published_full_scans = 0

    # -- Marker-Pfad ---------------------------------------------------------
    def _status_index_present(self):
        return self._markers

    def qids_by_status(self, status):
        return [doc["wikidata_qid"] for doc in self._documents.get(status, [])]

    def load_candidate_document(self, qid):
        self.gets.append(qid)
        for docs in self._documents.values():
            for doc in docs:
                if doc["wikidata_qid"] == qid:
                    return doc
        raise KeyError(qid)

    # -- Fallback-Pfad -------------------------------------------------------
    def candidate_documents_by_status(self, status, limit=1000):
        if status == "published":
            self.published_full_scans += 1
        return list(self._documents.get(status, []))

    # -- Publish-Summary -----------------------------------------------------
    def load_published_summary(self):
        if self._published_summary is None:
            return None
        return list(self._published_summary)


def _doc(qid, name="Testperson", status="generated", **extra):
    doc = {"wikidata_qid": qid, "name": name, "status": status}
    doc.update(extra)
    return doc


def _install(monkeypatch, documents, **store_kwargs):
    monkeypatch.setattr(sharded_runner, "build_s3_client", lambda: object())
    monkeypatch.setattr(
        sharded_runner, "CandidateStore", lambda client, bucket: _FakeStore(documents, **store_kwargs)
    )


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


def test_marker_selection_loads_only_shard_documents(monkeypatch):
    """Marker-Pfad: nur eigene Shard-Dokumente werden geladen (kein Voll-Scan)."""
    # total_shards=1: jede QID gehoert zu Shard 0 — 12 generated-Dokumente.
    generated = [_doc(f"Q{i}") for i in range(12)]
    docs = {"generated": generated, "published": [_doc(f"Q{i}pub") for i in range(500)]}
    store_probe = _FakeStore(docs, published_summary=[{"wikidata_qid": "Qx", "name": "x"}])
    monkeypatch.setattr(sharded_runner, "build_s3_client", lambda: object())
    monkeypatch.setattr(sharded_runner, "CandidateStore", lambda client, bucket: store_probe)
    monkeypatch.setattr(
        sharded_runner, "qa_one", lambda doc, **kw: (doc["wikidata_qid"], "reviewed (QA bestanden)")
    )

    sharded_runner.run_shard(0, 1, 50)

    # 12 generated-GETs je Stufendurchlauf, aber NIEMALS 500 published-GETs.
    assert store_probe.published_full_scans == 0
    assert len(store_probe.gets) <= 12 * 4  # 4 Stufen, generated nur bei QA abgefragt


def test_selection_fairness_puts_untested_first(monkeypatch):
    """QA-Fairness: ungetestete zuerst, getestete (qa_report) ans Ende."""
    tested = [_doc(f"Q{i}", qa_report={"issues": ["x"]}) for i in range(4)]
    untested = [_doc(f"Q{i + 10}") for i in range(4)]
    store = _FakeStore({"generated": tested + untested}, published_summary=[])
    monkeypatch.setattr(sharded_runner, "build_s3_client", lambda: object())
    monkeypatch.setattr(sharded_runner, "CandidateStore", lambda client, bucket: store)

    selected = sharded_runner.select_shard_documents(
        store, "generated", shard_index=0, total_shards=1, limit=4, fairness=True
    )
    assert [doc["wikidata_qid"] for doc in selected] == ["Q10", "Q11", "Q12", "Q13"]


def test_selection_fairness_fewer_attempts_first(monkeypatch):
    """Innerhalb der getesteten Kandidaten zuerst die mit weniger Versuchen."""
    docs = [
        _doc("Q1", qa_report={"issues": ["x"]}, qa_attempts=3),
        _doc("Q2", qa_report={"issues": ["x"]}, qa_attempts=1),
        _doc("Q3"),
    ]
    store = _FakeStore({"generated": docs}, published_summary=[])
    monkeypatch.setattr(sharded_runner, "build_s3_client", lambda: object())
    monkeypatch.setattr(sharded_runner, "CandidateStore", lambda client, bucket: store)

    selected = sharded_runner.select_shard_documents(
        store, "generated", shard_index=0, total_shards=1, limit=3, fairness=True
    )
    assert [doc["wikidata_qid"] for doc in selected] == ["Q3", "Q2", "Q1"]


def test_selection_without_markers_falls_back(monkeypatch):
    """Ohne Status-Marker greift der alte Voll-Scan-Pfad (niemals leerlaufen)."""
    docs = {"generated": [_doc("Q1")]}
    store = _FakeStore(docs, published_summary=[], markers=False)
    monkeypatch.setattr(sharded_runner, "build_s3_client", lambda: object())
    monkeypatch.setattr(sharded_runner, "CandidateStore", lambda client, bucket: store)

    selected = sharded_runner.select_shard_documents(
        store, "generated", shard_index=0, total_shards=1, limit=5, fairness=True
    )
    assert [doc["wikidata_qid"] for doc in selected] == ["Q1"]


def test_published_summary_prevents_full_scan(monkeypatch):
    """QA-Duplikat-Check nutzt die Publish-Summary — published bleibt unberuehrt."""
    generated = [_doc("Q1")]
    docs = {"generated": generated, "published": [_doc(f"Q{i}") for i in range(200)]}
    store = _FakeStore(docs, published_summary=[{"wikidata_qid": "Q9", "name": "Andere"}])
    monkeypatch.setattr(sharded_runner, "build_s3_client", lambda: object())
    monkeypatch.setattr(sharded_runner, "CandidateStore", lambda client, bucket: store)
    monkeypatch.setattr(
        sharded_runner, "qa_one", lambda doc, **kw: (doc["wikidata_qid"], "reviewed (QA bestanden)")
    )

    sharded_runner.run_shard(0, 1, 5)
    assert store.published_full_scans == 0


def test_published_summary_missing_falls_back_to_full_scan(monkeypatch):
    """Fehlt die Summary, laedt der Runner published vollstaendig (korrekt, teuer)."""
    generated = [_doc("Q1")]
    docs = {"generated": generated, "published": [_doc(f"Q{i}") for i in range(3)]}
    store = _FakeStore(docs, published_summary=None)
    monkeypatch.setattr(sharded_runner, "build_s3_client", lambda: object())
    monkeypatch.setattr(sharded_runner, "CandidateStore", lambda client, bucket: store)
    monkeypatch.setattr(
        sharded_runner, "qa_one", lambda doc, **kw: (doc["wikidata_qid"], "reviewed (QA bestanden)")
    )

    sharded_runner.run_shard(0, 1, 5)
    assert store.published_full_scans >= 1
