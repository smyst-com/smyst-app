"""Tests fuer die drei parallelisierten Worker-Stufen.

Vor dieser Datei war KEINE der Funktionen run_research / run_assessment /
run_build getestet — die gruene Suite haette einen Fehler in ihrer Kernschleife
nicht bemerkt. Da genau diese Schleife am 13.08.2026 auf Parallelverarbeitung
umgestellt wurde (Durchsatz-Ziel 2000/Tag), wird sie hier abgesichert:
Ergebnisse landen im Report, Einzelfehler brechen den Lauf nicht ab, und
--dry-run schreibt kein Changelog.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.ai.historical_pipeline import PipelineConfig, PipelineStatus
from app.workers import assess_risk, build_capsules, research_candidates

CONFIG = PipelineConfig(enabled=True)


class FakeStore:
    """Minimaler Ersatz fuer CandidateStore: liefert Dokumente, merkt Changelogs."""

    def __init__(self, documents: list[dict]) -> None:
        self._documents = documents
        self.changelogs: list[dict] = []
        self.requested_status: str | None = None

    def candidate_documents_by_status(self, status: str, *, limit: int | None = None) -> list[dict]:
        self.requested_status = status
        return self._documents[: limit or len(self._documents)]

    def save_changelog(self, run_date: date, report: dict, *, suffix: str = "") -> str:
        self.changelogs.append(report)
        return "changelog"


def _docs(count: int) -> list[dict]:
    return [{"wikidata_qid": f"Q{index}", "name": f"Person {index}"} for index in range(count)]


#: (Modul, Funktionsname, Name der Einzel-Funktion, erwarteter Eingangs-Status)
STAGES = [
    (research_candidates, "run_research", "research_one", PipelineStatus.CANDIDATE.value),
    (assess_risk, "run_assessment", "assess_one", PipelineStatus.RESEARCHED.value),
    (build_capsules, "run_build", "build_one", PipelineStatus.VERIFIED.value),
]


@pytest.mark.parametrize(("module", "run_name", "one_name", "status"), STAGES)
def test_stage_collects_results_from_all_candidates(
    module, run_name, one_name, status, monkeypatch
) -> None:
    monkeypatch.setattr(
        module, one_name, lambda document, **kwargs: (document["wikidata_qid"], "ok")
    )
    store = FakeStore(_docs(5))
    report = getattr(module, run_name)(
        store=store, config=CONFIG, limit=10, dry_run=False,
        run_date=date(2026, 8, 13), concurrency=3,
    )
    assert store.requested_status == status
    assert report["results"] == {f"Q{index}": "ok" for index in range(5)}
    assert report["errors"] == {}
    assert len(store.changelogs) == 1


@pytest.mark.parametrize(("module", "run_name", "one_name", "status"), STAGES)
def test_stage_keeps_going_after_single_failure(
    module, run_name, one_name, status, monkeypatch
) -> None:
    def flaky(document, **kwargs):
        if document["wikidata_qid"] == "Q2":
            raise TimeoutError("Provider zu langsam")
        return document["wikidata_qid"], "ok"

    monkeypatch.setattr(module, one_name, flaky)
    store = FakeStore(_docs(4))
    report = getattr(module, run_name)(
        store=store, config=CONFIG, limit=10, dry_run=False,
        run_date=date(2026, 8, 13), concurrency=4,
    )
    assert set(report["results"]) == {"Q0", "Q1", "Q3"}
    assert report["errors"] == {"Q2": "TimeoutError: Provider zu langsam"}


@pytest.mark.parametrize(("module", "run_name", "one_name", "status"), STAGES)
def test_stage_dry_run_writes_no_changelog(
    module, run_name, one_name, status, monkeypatch
) -> None:
    monkeypatch.setattr(
        module, one_name, lambda document, **kwargs: (document["wikidata_qid"], "ok")
    )
    store = FakeStore(_docs(2))
    getattr(module, run_name)(
        store=store, config=CONFIG, limit=10, dry_run=True, run_date=date(2026, 8, 13),
    )
    assert store.changelogs == []


@pytest.mark.parametrize(("module", "run_name", "one_name", "status"), STAGES)
def test_stage_respects_limit(module, run_name, one_name, status, monkeypatch) -> None:
    monkeypatch.setattr(
        module, one_name, lambda document, **kwargs: (document["wikidata_qid"], "ok")
    )
    store = FakeStore(_docs(10))
    report = getattr(module, run_name)(
        store=store, config=CONFIG, limit=3, dry_run=True, run_date=date(2026, 8, 13),
    )
    assert len(report["results"]) == 3
