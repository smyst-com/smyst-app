"""smyst.com Sharded Worker Runner.

Orchestriert Pipeline-Worker-Stufen für einen spezifischen Shard (0..N-1) in GitHub Actions.
Filtert Kandidaten anhand von (hash(QID) % total_shards == shard_index) und führt
research, build_capsules und qa_candidates im Batch-Modus aus.

Start:
    python -m app.workers.sharded_runner --shard-index 0 --total-shards 10 --limit 17
    python -m app.workers.sharded_runner --shard-index 0 --total-shards 10 --limit 17 --dry-run
"""

from __future__ import annotations

import argparse
import logging
import sys
from typing import List

from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.integrations.pipeline_config_store import load_config
from app.workers.build_capsules import build_one
from app.workers.qa_candidates import qa_one
from app.workers.research_candidates import research_one

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("sharded_runner")


def qid_belongs_to_shard(qid: str, shard_index: int, total_shards: int) -> bool:
    """Prüft, ob eine Wikidata QID zu diesem Runner-Shard gehört."""
    clean_qid = qid.upper().strip()
    if clean_qid.startswith("Q") and clean_qid[1:].isdigit():
        num = int(clean_qid[1:])
    else:
        num = abs(hash(clean_qid))
    return (num % total_shards) == shard_index


def run_sharded_pipeline(
    shard_index: int,
    total_shards: int,
    limit: int,
    dry_run: bool = False,
) -> None:
    logger.info(
        "Starte Sharded Pipeline Runner [Shard %d/%d, Limit=%d, dry_run=%s]",
        shard_index,
        total_shards,
        limit,
        dry_run,
    )

    client = build_s3_client()
    config = load_config(client=client)
    store = CandidateStore(client=client, bucket=config.bucket_name)

    # 1. Research Candidates Stufe
    pending_research = store.list_documents(prefix="pipeline/candidates/")
    shard_research_candidates = [
        doc for doc in pending_research
        if doc.get("status") == "discovered"
        and qid_belongs_to_shard(doc.get("wikidata_qid", ""), shard_index, total_shards)
    ][:limit]

    logger.info("Shard %d: %d Kandidaten in Stufe 'discovered' gefunden.", shard_index, len(shard_research_candidates))
    for doc in shard_research_candidates:
        logger.info("Researching Candidate: %s (%s)", doc.get("name"), doc.get("wikidata_qid"))
        if not dry_run:
            try:
                research_one(doc, store=store, config=config, dry_run=False)
            except Exception as err:
                logger.error("Fehler bei Research für %s: %s", doc.get("wikidata_qid"), err)

    # 2. Build Capsules Stufe
    pending_build = store.list_documents(prefix="pipeline/candidates/")
    shard_build_candidates = [
        doc for doc in pending_build
        if doc.get("status") == "researched"
        and qid_belongs_to_shard(doc.get("wikidata_qid", ""), shard_index, total_shards)
    ][:limit]

    logger.info("Shard %d: %d Kandidaten in Stufe 'researched' gefunden.", shard_index, len(shard_build_candidates))
    for doc in shard_build_candidates:
        logger.info("Building Capsule: %s (%s)", doc.get("name"), doc.get("wikidata_qid"))
        if not dry_run:
            try:
                build_one(doc, store=store, config=config, dry_run=False)
            except Exception as err:
                logger.error("Fehler bei Build Capsule für %s: %s", doc.get("wikidata_qid"), err)

    # 3. QA Candidates Stufe
    pending_qa = store.list_documents(prefix="pipeline/candidates/")
    shard_qa_candidates = [
        doc for doc in pending_qa
        if doc.get("status") == "generated"
        and qid_belongs_to_shard(doc.get("wikidata_qid", ""), shard_index, total_shards)
    ][:limit]

    logger.info("Shard %d: %d Kandidaten in Stufe 'generated' gefunden.", shard_index, len(shard_qa_candidates))
    for doc in shard_qa_candidates:
        logger.info("QA Candidate: %s (%s)", doc.get("name"), doc.get("wikidata_qid"))
        if not dry_run:
            try:
                qa_one(doc, store=store, config=config, dry_run=False)
            except Exception as err:
                logger.error("Fehler bei QA für %s: %s", doc.get("wikidata_qid"), err)

    logger.info("Shard %d Pipeline-Lauf abgeschlossen.", shard_index)


def main() -> None:
    parser = argparse.ArgumentParser(description="smyst.com Sharded Worker Runner")
    parser.add_argument("--shard-index", type=int, required=True, help="Shard Index (0..total_shards-1)")
    parser.add_argument("--total-shards", type=int, default=10, help="Anzahl aller Shards (Default: 10)")
    parser.add_argument("--limit", type=int, default=17, help="Kandidaten-Limit pro Stufe und Shard")
    parser.add_argument("--dry-run", action="store_true", help="Simulationsmodus ohne Speichern")

    args = parser.parse_args()

    if args.shard_index < 0 or args.shard_index >= args.total_shards:
        logger.error("Ungültiger shard-index %d (muss zwischen 0 und %d liegen)", args.shard_index, args.total_shards - 1)
        sys.exit(1)

    run_sharded_pipeline(
        shard_index=args.shard_index,
        total_shards=args.total_shards,
        limit=args.limit,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
