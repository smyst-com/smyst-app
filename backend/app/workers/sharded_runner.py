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

from app.ai.historical_pipeline import DEFAULT_CONFIG, PipelineConfig
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.build_capsules import build_one
from app.workers.qa_candidates import qa_one
from app.workers.research_candidates import research_one

logger = logging.getLogger(__name__)


def qid_belongs_to_shard(qid: str, shard_index: int, total_shards: int) -> bool:
    # Stabiler Hash: Pythons hash() ist prozesszufaellig — verschiedene Runner
    # wuerden verschiedene Shards berechnen und doppelt/ueberhaupt nicht arbeiten.
    if not qid:
        return False
    digest = hashlib.md5(qid.encode("utf-8"), usedforsecurity=False).hexdigest()
    return (int(digest[:8], 16) % total_shards) == shard_index


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

    stages = [
        ("candidate", "Research", research_one),
        ("researched", "Build Capsule", build_one),
        ("generated", "QA", qa_one),
    ]
    for status, label, worker in stages:
        documents = store.candidate_documents_by_status(status, limit=1000)
        shard_docs = [
            doc for doc in documents
            if qid_belongs_to_shard(str(doc.get("wikidata_qid") or ""), shard_index, total_shards)
        ][:limit]
        logger.info("Shard %d: %d Kandidaten in Stufe '%s' gefunden.", shard_index, len(shard_docs), status)
        for doc in shard_docs:
            logger.info("%s: %s (%s)", label, doc.get("name"), doc.get("wikidata_qid"))
            if dry_run:
                continue
            try:
                worker(doc, store=store, config=config, dry_run=False)
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
