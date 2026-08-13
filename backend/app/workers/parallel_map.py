"""Beschraenkte Parallelverarbeitung fuer die Worker-Stufen.

Messung 13.08.2026 (Lauf 31675724409): Recherche, Risiko-Check und Kapsel-Bau
brauchten je ~16 Sekunden PRO Kandidat, die QA ~12 — zusammen ~59 s. Fast
ausschliesslich Wartezeit auf LLM- und S3-Aufrufe, nicht Rechenzeit.

Seriell ergibt das eine harte Obergrenze von 86400 / 59 ~ 1465 Profilen pro
Tag. Genau dort lagen die Bestwerte (1431 / 1497 / 1521 am 07.-09.08.) — das
System lief also schon an seiner Architektur-Grenze, nicht an einem
konfigurierten Limit. Ein groesseres Stufen-Limit hilft dagegen NICHT: die
Laeufe werden nur laenger (bei 250 aus 48 Minuten ~4 Stunden), ueberlappen
sich und verdraengen sich gegenseitig — am Ende wieder ~1465.

Threads statt Prozesse, weil die Wartezeit I/O ist (der GIL wird waehrend
HTTP-Aufrufen freigegeben). Bewusst beschraenkt: jeder Thread ruft echte
LLM-Provider auf, unbegrenzte Parallelitaet liefe in Rate-Limits.
"""

from __future__ import annotations

import os
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

#: 4 parallele Kandidaten senken die drei langsamen Stufen von ~47 s auf ~12 s
#: pro Kandidat (Gesamtkette dann ~24 s statt 59 s) — das reicht fuer 2000/Tag
#: mit Reserve, ohne die Provider mit Anfragen zu ueberfahren.
DEFAULT_CONCURRENCY = 4

ENV_CONCURRENCY = "PIPELINE_WORKER_CONCURRENCY"


def resolve_concurrency(
    requested: int | None = None,
    *,
    default: int = DEFAULT_CONCURRENCY,
    env_var: str = ENV_CONCURRENCY,
) -> int:
    """Parallelitaet aus Argument, sonst Env, sonst Default; immer >= 1.

    default/env_var sind ueberschreibbar, weil nicht jede Stufe dieselbe
    Grenze vertraegt: Risiko und Kapsel sprechen mit unserem eigenen Gateway,
    die Recherche dagegen mit Wikimedia — und das drosselt haerter.
    """
    for value in (requested, os.environ.get(env_var)):
        if value is None:
            continue
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            continue
        if parsed > 0:
            return parsed
    return max(1, default)


def map_candidates(
    documents: list[dict],
    worker: Callable[[dict], tuple[str, str]],
    *,
    concurrency: int | None = None,
) -> tuple[dict[str, str], dict[str, str]]:
    """Fuehrt worker fuer jeden Kandidaten aus; liefert (results, errors) je QID.

    Ein Fehler bei einem Kandidaten stoppt den Lauf nicht — er landet in
    errors, genau wie in der seriellen Fassung. Bei concurrency=1 (oder einem
    einzigen Dokument) wird ohne Threadpool gearbeitet, damit Tests und
    Fehlersuche deterministisch bleiben.
    """
    results: dict[str, str] = {}
    errors: dict[str, str] = {}
    lock = threading.Lock()

    def run_one(document: dict) -> None:
        qid = document.get("wikidata_qid", "?")
        try:
            done_qid, result = worker(document)
        except Exception as error:  # Fehler dokumentieren, Lauf fortsetzen
            with lock:
                errors[qid] = f"{type(error).__name__}: {error}"
            return
        with lock:
            results[done_qid] = result

    # Ein bereits aufgeloester Wert (z. B. die niedrigere Recherche-Grenze)
    # kommt hier als Zahl an und gewinnt — resolve_concurrency prueft das
    # Argument vor Env und Default.
    workers = resolve_concurrency(concurrency)
    if workers == 1 or len(documents) <= 1:
        for document in documents:
            run_one(document)
        return results, errors

    with ThreadPoolExecutor(max_workers=min(workers, len(documents))) as pool:
        list(pool.map(run_one, documents))
    return results, errors
