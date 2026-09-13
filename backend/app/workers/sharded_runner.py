"""Sharded Batch-Runner fuer die skalierte smyst.com-Pipeline (Scale-2k).

Verarbeitet die drei Worker-Stufen research -> build_capsules -> qa im
Batch-Modus, verteilt auf Shards (QID-Hash) fuer parallele GitHub-Runner.
Publish bleibt bewusst ausserhalb (menschliche Freigabe, siehe publish_profiles).

CLI:
    python -m app.workers.sharded_runner --shard-index 0 --total-shards 10 \
        --limit 17 --enabled
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import sys

from app.ai.historical_pipeline import DEFAULT_CONFIG, PipelineConfig, PipelineStatus
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.assess_risk import assess_one
from app.workers.build_capsules import build_one
from app.workers.qa_candidates import qa_one
from app.workers.research_candidates import research_one

logger = logging.getLogger(__name__)

# Alle LLM-Provider tot (z. B. Kontingent erschöpft -> 403): Jeder gescheiterte
# QA-Kandidat blockt ~10-12 min (Provider-Kette mit Timeouts). Ohne Abbruch
# brannten die Scale-2k-Laeufe die vollen 90 min Runner-Zeit ab, ohne ein einziges
# Profil zu liefern (24.08.2026: 10+ Läufe timeout-cancelled). Nach dieser Zahl
# aufeinanderfolgend degradierter Kandidaten bricht der Shard ab; die Kandidaten
# bleiben unangetastet (kein Status-Wechsel) und werden im nächsten Lauf
# erneut geprüft, sobald wieder ein Provider antwortet.
MAX_CONSECUTIVE_DEGRADED = 3


def qid_belongs_to_shard(qid: str, shard_index: int, total_shards: int) -> bool:
    # Stabiler Hash: Pythons hash() ist prozesszufaellig — verschiedene Runner
    # wuerden verschiedene Shards berechnen und doppelt/ueberhaupt nicht arbeiten.
    if not qid:
        return False
    digest = hashlib.md5(qid.encode("utf-8"), usedforsecurity=False).hexdigest()
    return (int(digest[:8], 16) % total_shards) == shard_index


#: Wievielfache der Shard-Stroeme vorab geladen werden, damit die Fairness-
#: Sortierung (ungetestete zuerst) ueberhaupt etwas sortieren kann.
FAIRNESS_OVERSAMPLE = 4


def select_shard_documents(
    store: CandidateStore,
    status: str,
    *,
    shard_index: int,
    total_shards: int,
    limit: int,
    fairness: bool = False,
) -> list[dict]:
    """Dokumente EINER Stufe fuer diesen Shard — ohne den alten Voll-Scan.

    Befund 14.09.2026 (Lauf 34764593243): Der Runner lud pro Stufe bis 1000
    Dokumente ueber ALLE Shards und filterte erst danach auf den eigenen
    Shard — ~24 min Scan pro Stufe, viermal je Job, daneben ~15 min echte
    Arbeit. Jetzt: QIDs aus den Status-Markern (LIST), SOFORT auf den Shard
    filtern und nur die eigenen Treffer laden.

    fairness=True (QA): ungetestete Kandidaten zuerst, dann nach Anzahl
    QA-Versuchen aufsteigend (Befund Runde 38/13.09.: dauerhaft durchfallende
    Kandidaten belegten die vorderen Plaetze und blockierten die restliche
    Queue dauerhaft). Ohne Status-Marker (nie backfillt) greift der alte
    Weg — langsam, aber funktionsfaehig.
    """
    if not store._status_index_present():  # noqa: SLF001 - bewusster Fallback-Pfad
        documents = store.candidate_documents_by_status(status, limit=1000)
        shard_docs = [
            doc
            for doc in documents
            if qid_belongs_to_shard(str(doc.get("wikidata_qid") or ""), shard_index, total_shards)
        ]
        if fairness:
            shard_docs.sort(key=lambda doc: bool(doc.get("qa_report")))
        return shard_docs[:limit]

    qids = [
        qid
        for qid in store.qids_by_status(status)
        if qid_belongs_to_shard(qid, shard_index, total_shards)
    ]
    if fairness:
        qids = qids[: max(limit, 1) * FAIRNESS_OVERSAMPLE]
    else:
        qids = qids[:limit]
    documents: list[dict] = []
    for qid in qids:
        try:
            doc = store.load_candidate_document(qid)
        except Exception:
            continue  # verwaister Marker
        if doc.get("status") != status:
            continue  # veralteter Marker — Dokument entscheidet
        documents.append(doc)
    if fairness:
        # Stabil: ungetestete zuerst, dann wenige Versuche; innerhalb einer
        # Gruppe bleibt die QID-Reihenfolge erhalten.
        documents.sort(key=lambda doc: (bool(doc.get("qa_report")), doc.get("qa_attempts") or 0))
    return documents[:limit]


def run_shard(
    shard_index: int,
    total_shards: int,
    limit: int,
    *,
    enabled: bool = False,
    dry_run: bool = False,
) -> None:
    from app.core.config import settings

    logger.info(
        "Starte Sharded Pipeline Runner [Shard %d/%d, Limit=%d, enabled=%s, dry_run=%s]",
        shard_index, total_shards, limit, enabled, dry_run,
    )

    client = build_s3_client()
    config = DEFAULT_CONFIG if not enabled else PipelineConfig(enabled=True)
    store = CandidateStore(client=client, bucket=settings.idrive_e2_bucket)

    consecutive_degraded = 0

    # Published-Liste EINMAL pro Shard laden. 14.09.2026 — Durchsatzdefekt
    # behoben: Der Voll-Scan (26.000+ GETs) kostete JEDEM Shard-Job 25-40 min
    # VOR der ersten echten Arbeit (Lauf 34764593243: 70-190 min pro Shard,
    # davon 60-185 min reine Store-Scans und nur ~15 min QA). Der Duplikat-
    # Check braucht nur QID + Name: jetzt kommt die kompakte Publish-Summary
    # zum Einsatz (1 GET), der Voll-Scan bleibt Rueckfallebene.
    published = store.load_published_summary()
    if published is None:
        logger.warning(
            "Shard %d: keine published-summary — langsamer Voll-Scan als Fallback.",
            shard_index,
        )
        published = store.candidate_documents_by_status(PipelineStatus.PUBLISHED.value)

    # 05.09.2026 — Produktionsdefekt behoben: Die Risiko-Stufe FEHLTE seit
    # jeher (pipeline-run hat sie als Worker 3, der Shard-Runner nie).
    # Folgen: 'researched'-Kandidaten ohne risk_score scheiterten PERMANENT
    # am Build ('Capsule-Bau erfordert abgeschlossenen Risiko-Check' — 25
    # Fehler im Lauf 33954454588), QA-Ausbeute ~0 trotz '7.200/Tag'-Kapazität.
    # Korrekter kanonischer Flow: candidate -> researched -> RISIKO ->
    # verified -> generated -> qa_passed (identisch zur pipeline-run-Kette).
    stages = [
        ("candidate", "Research", research_one),
        ("researched", "Risiko-Check", assess_one),
        ("verified", "Build Capsule", build_one),
        ("generated", "QA", qa_one),
    ]
    for status, label, worker in stages:
        shard_docs = select_shard_documents(
            store,
            status,
            shard_index=shard_index,
            total_shards=total_shards,
            limit=limit,
            fairness=worker is qa_one,
        )
        logger.info(
            "Shard %d: %d Kandidaten in Stufe '%s' gefunden.", shard_index, len(shard_docs), status
        )
        for doc in shard_docs:
            if consecutive_degraded >= MAX_CONSECUTIVE_DEGRADED:
                logger.error(
                    "Shard %d: %d Kandidaten hintereinander ohne LLM-Antwort "
                    "(Provider-Kontingent/-Erreichbarkeit) — Lauf abgebrochen, "
                    "verbleibende Kandidaten unangetastet. Nach Aufladen des "
                    "Provider-Kontos automatisch wieder produktiv.",
                    shard_index, consecutive_degraded,
                )
                raise RuntimeError(
                    f"LLM provider circuit breaker: {consecutive_degraded} consecutive "
                    "degraded candidates — aborting shard run to save runner minutes."
                )
            logger.info("%s: %s (%s)", label, doc.get("name"), doc.get("wikidata_qid"))
            if dry_run:
                continue
            try:
                extra = {"published": published} if worker is qa_one else {}
                result = worker(doc, store=store, config=config, dry_run=False, **extra)
                # qa_one meldet Provider-Ausfall als "skipped (Chat-Provider
                # degradiert: ...)" — Kandidat unbewertet, kein Status-Wechsel.
                result_text = result[1] if isinstance(result, tuple) else ""
                if isinstance(result, tuple) and str(result_text).startswith("skipped (Chat-Provider degradiert"):
                    consecutive_degraded += 1
                    logger.warning(
                        "Shard %d: Kandidat ohne LLM-Antwort (%d/%d).",
                        shard_index, consecutive_degraded, MAX_CONSECUTIVE_DEGRADED,
                    )
                else:
                    consecutive_degraded = 0
            except Exception as err:
                logger.error("Fehler bei %s fuer %s: %s", label, doc.get("wikidata_qid"), err)

    logger.info("Shard %d Pipeline-Lauf abgeschlossen.", shard_index)


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="smyst.com Sharded Pipeline Runner (Scale-2k)")
    parser.add_argument("--shard-index", type=int, required=True)
    parser.add_argument("--total-shards", type=int, default=10)
    parser.add_argument("--limit", type=int, default=17)
    parser.add_argument("--enabled", action="store_true", help="pipeline.enabled Override")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    run_shard(args.shard_index, args.total_shards, args.limit, enabled=args.enabled, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
