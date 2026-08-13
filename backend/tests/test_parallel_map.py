"""Tests fuer die Parallelverarbeitung der Worker-Stufen (workers/parallel_map).

Hintergrund (Messung 13.08.2026): seriell kostete jeder Kandidat ~59 s ueber
alle vier Stufen — reine Wartezeit auf LLM/S3. Das ergibt eine Obergrenze von
~1465 Profilen/Tag, genau die beobachteten Bestwerte. Diese Tests sichern die
Parallelitaet ab, die das Ziel von 2000/Tag erst moeglich macht.
"""

from __future__ import annotations

import threading
import time

import pytest

from app.workers.parallel_map import (
    DEFAULT_CONCURRENCY,
    ENV_CONCURRENCY,
    map_candidates,
    resolve_concurrency,
)


def _docs(count: int) -> list[dict]:
    return [{"wikidata_qid": f"Q{index}"} for index in range(count)]


def test_results_are_keyed_by_qid() -> None:
    results, errors = map_candidates(
        _docs(3), lambda doc: (doc["wikidata_qid"], "researched"), concurrency=2
    )
    assert results == {"Q0": "researched", "Q1": "researched", "Q2": "researched"}
    assert errors == {}


def test_single_failure_does_not_stop_the_run() -> None:
    def worker(doc: dict) -> tuple[str, str]:
        if doc["wikidata_qid"] == "Q1":
            raise ValueError("kaputt")
        return doc["wikidata_qid"], "ok"

    results, errors = map_candidates(_docs(3), worker, concurrency=3)
    assert set(results) == {"Q0", "Q2"}
    assert errors == {"Q1": "ValueError: kaputt"}


def test_serial_path_for_concurrency_one() -> None:
    order: list[str] = []

    def worker(doc: dict) -> tuple[str, str]:
        order.append(doc["wikidata_qid"])
        return doc["wikidata_qid"], "ok"

    map_candidates(_docs(4), worker, concurrency=1)
    assert order == ["Q0", "Q1", "Q2", "Q3"]  # deterministische Reihenfolge


def test_work_really_runs_in_parallel() -> None:
    """Der eigentliche Zweck: wartende Kandidaten muessen sich ueberlappen.

    Ohne diesen Nachweis koennte die Umstellung wirkungslos sein und niemand
    wuerde es merken — der Durchsatz bliebe bei ~1465/Tag.
    """
    active = 0
    peak = 0
    lock = threading.Lock()

    def worker(doc: dict) -> tuple[str, str]:
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.05)  # steht fuer die ~16 s Wartezeit auf das LLM
        with lock:
            active -= 1
        return doc["wikidata_qid"], "ok"

    start = time.monotonic()
    results, _ = map_candidates(_docs(8), worker, concurrency=4)
    elapsed = time.monotonic() - start

    assert len(results) == 8
    assert peak >= 2, "Kandidaten liefen nicht gleichzeitig"
    assert elapsed < 8 * 0.05, "kein Zeitgewinn gegenueber serieller Abarbeitung"


def test_empty_and_single_document() -> None:
    assert map_candidates([], lambda doc: ("x", "y")) == ({}, {})
    results, _ = map_candidates(_docs(1), lambda doc: (doc["wikidata_qid"], "ok"), concurrency=4)
    assert results == {"Q0": "ok"}


def test_document_without_qid_is_reported_under_placeholder() -> None:
    def worker(doc: dict) -> tuple[str, str]:
        raise RuntimeError("keine QID")

    _, errors = map_candidates([{}], worker, concurrency=1)
    assert errors == {"?": "RuntimeError: keine QID"}


@pytest.mark.parametrize("bad", ["", "0", "-3", "viele", None])
def test_resolve_concurrency_falls_back_to_default(bad, monkeypatch) -> None:
    monkeypatch.delenv(ENV_CONCURRENCY, raising=False)
    assert resolve_concurrency(bad if bad != "" else None) == DEFAULT_CONCURRENCY


def test_resolve_concurrency_precedence(monkeypatch) -> None:
    monkeypatch.setenv(ENV_CONCURRENCY, "7")
    assert resolve_concurrency(None) == 7      # Env schlaegt Default
    assert resolve_concurrency(3) == 3         # Argument schlaegt Env
    monkeypatch.delenv(ENV_CONCURRENCY)
    assert resolve_concurrency(None) == DEFAULT_CONCURRENCY
