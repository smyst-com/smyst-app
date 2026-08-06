"""smyst.com Reparatur-Worker: gezielter Neuaufbau einzelner Profile.

Der Reparatur-Weg der Qualitaetsschleife: Wenn Evals eine Regression zeigen
oder der Freshness-Check Quellen-Aenderungen meldet (refresh.needs_review),
baut dieser Worker EIN Profil kontrolliert neu auf — ohne Downtime und ohne
Status-Wechsel (das Profil bleibt durchgehend published):

1. Frische Recherche: Wikidata-EntityData + Wikipedia-Summaries neu laden,
   Snapshots + ResearchDocument nach IDrive e2 (reproduzierbar, prueffaehig).
2. Capsule-Neuaufbau MIT bestehender twin_id (Slug/URLs bleiben stabil).
3. QA-Gate VOR dem Schreiben: Chat-Smoke-Test + Vollstaendigkeit gegen die
   NEUE Capsule. Faellt die QA durch, bleibt die Live-Capsule unangetastet
   (rebuild_report dokumentiert den Fehlschlag).
4. Bei bestandener QA: Capsule-Dateien schreiben, refresh.needs_review
   aufloesen, Audit-Eintrag anhaengen.

Es wird NIE geloescht und NIE unpublished — Verschlechterungen werden vom
QA-Gate abgefangen (Spec-Prinzip: viel sammeln, wenig veroeffentlichen).

Start:
    python -m app.workers.rebuild_profile --qid Q1035 --dry-run
    python -m app.workers.rebuild_profile --qid Q1035 --enabled
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, replace
from datetime import date, datetime, timezone
from typing import Callable
from uuid import UUID

from app.ai.capsule_builder import build_capsule
from app.ai.historical_pipeline import DEFAULT_CONFIG, PipelineConfig
from app.ai.qa_checks import ChatProviderDegradedError, run_qa
from app.ai.research_profiles import evaluate_research, parse_entity, with_sources, SourceRef
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.build_capsules import CAPSULE_PREFIX, _put_json
from app.workers.qa_candidates import build_chat_fn
from app.workers.research_candidates import (
    ENTITY_URL,
    SUMMARY_URL,
    _candidate_from_document,
    _get_json,
)

FetchJson = Callable[[str], dict]


def _fresh_research(
    document: dict,
    *,
    store: CandidateStore,
    config: PipelineConfig,
    dry_run: bool,
    fetch_json: FetchJson,
) -> tuple[dict | None, str]:
    """Neue Recherche fuer die QID. Rueckgabe: (research_doc | None, Grund)."""
    candidate = _candidate_from_document(document)
    qid = candidate.wikidata_qid

    entity_payload = fetch_json(ENTITY_URL.format(qid=qid))
    research = parse_entity(entity_payload, qid)

    sources: list[SourceRef] = []
    extracts: dict[str, str] = {}
    if not dry_run:
        key = store.save_source_snapshot(
            qid, "wikidata-entitydata.json", json.dumps(entity_payload).encode("utf-8")
        )
        sources.append(SourceRef("Wikidata EntityData", "wikidata.org", ENTITY_URL.format(qid=qid), key))

    for wiki, title in research.wikipedia_titles.items():
        lang = wiki.removesuffix("wiki")
        url = SUMMARY_URL.format(lang=lang, title=title.replace(" ", "_"))
        try:
            summary = fetch_json(url)
        except Exception:  # einzelne Wiki-Ausfaelle brechen die Recherche nicht ab
            continue
        extracts[wiki] = summary.get("extract", "")
        if not dry_run:
            key = store.save_source_snapshot(
                qid, f"wikipedia-{lang}.json", json.dumps(summary).encode("utf-8")
            )
            sources.append(SourceRef(title, f"{lang}.wikipedia.org", url, key))

    research = with_sources(research, sources if not dry_run else
                            [SourceRef("dry-run", "-", "-", "-")] * (1 + len(extracts)))
    outcome = evaluate_research(
        research,
        candidate_death_date=candidate.death_date,
        min_sources=config.min_sources,
        wikipedia_extracts=extracts,
    )
    if not outcome.ready:
        return None, f"Recherche nicht verwertbar: {outcome.reject_reason}"

    # source_count ist eine Property (fehlt in asdict) — explizit mitgeben,
    # QA und Kandidaten-Dokument brauchen die Zahl.
    research_doc = {
        **asdict(outcome.document),
        "notes": list(outcome.notes),
        "source_count": outcome.document.source_count,
    }
    if not dry_run:
        store.save_research_document(qid, research_doc)
    return research_doc, "ok"


def rebuild_one(
    qid: str,
    *,
    store: CandidateStore,
    config: PipelineConfig,
    dry_run: bool,
    fetch_json: FetchJson = _get_json,
    chat_fn_factory: Callable[[dict], Callable[[str], str] | None] = build_chat_fn,
    now: datetime | None = None,
) -> tuple[str, str]:
    now = now or datetime.now(timezone.utc)
    document = store.load_candidate_document(qid)

    research_doc, reason = _fresh_research(
        document, store=store, config=config, dry_run=dry_run, fetch_json=fetch_json
    )
    if research_doc is None:
        return qid, f"abgebrochen ({reason}) — Live-Capsule unveraendert"

    candidate = _candidate_from_document(document)
    candidate = replace(
        candidate,
        risk_score=document.get("risk_score"),
        risk_flags=document.get("risk_flags") or {},
        image_status=document.get("image_status"),
    )
    existing_twin_id = document.get("twin_id")
    capsule = build_capsule(
        candidate,
        research_doc,
        config=config,
        twin_id=UUID(existing_twin_id) if existing_twin_id else None,
    )
    capsule_doc = capsule.as_document()

    qa_document = {**document, "twin_id": str(capsule.twin_id), "source_count": research_doc.get("source_count", 0)}
    try:
        # published=[] bewusst: der Duplikat-Check wuerde das Profil gegen sich
        # selbst pruefen; fuer den Rebuild zaehlen Vollstaendigkeit, Datums-
        # Konsistenz und der Chat-Smoke-Test gegen die NEUE Capsule.
        report = run_qa(qa_document, capsule_doc, [], chat_fn=chat_fn_factory(capsule_doc))
    except ChatProviderDegradedError as error:
        return qid, f"abgebrochen (Chat-Provider degradiert: {error}) — Live-Capsule unveraendert"

    rebuild_info = {
        "rebuilt_at": now.isoformat(),
        "qa_passed": report.passed,
        "qa_issues": list(report.issues),
        "source_count": research_doc.get("source_count", 0),
    }

    if not report.passed:
        if not dry_run:
            store.save_candidate_document(qid, {**document, "rebuild_report": rebuild_info})
        return qid, f"QA nicht bestanden ({len(report.issues)} Issues) — Live-Capsule unveraendert"

    if not dry_run:
        _put_json(store, f"{CAPSULE_PREFIX}{qid}/capsule.json", capsule_doc)
        prompt_key = _put_json(
            store, f"{CAPSULE_PREFIX}{qid}/prompt.json",
            {"wikidata_qid": qid, "persona_prompt": capsule.persona_prompt, "version": capsule.version},
        )
        seo_key = _put_json(store, f"{CAPSULE_PREFIX}{qid}/seo.json", capsule.seo)
        refresh = document.get("refresh") if isinstance(document.get("refresh"), dict) else {}
        new_document = {
            **document,
            "twin_id": str(capsule.twin_id),
            "prompt_key": prompt_key,
            "seo_key": seo_key,
            "source_count": research_doc.get("source_count", document.get("source_count", 0)),
            "qa_passed": True,
            "qa_report": report.as_document(),
            "rebuild_report": rebuild_info,
            # Reparatur erledigt: offenes Review aufloesen, Baseline setzt der
            # naechste Freshness-Lauf neu.
            "refresh": {**refresh, "needs_review": False, "resolved_at": now.isoformat()},
            "audit_trail": document.get("audit_trail", [])
            + [
                {
                    "wikidata_qid": qid,
                    "from_status": document.get("status"),
                    "to_status": document.get("status"),
                    "reason": "rebuild-one: Recherche + Capsule neu, QA bestanden",
                    "actor": None,
                    "occurred_at": now.isoformat(),
                }
            ],
        }
        store.save_candidate_document(qid, new_document)
    return qid, f"neu gebaut (QA bestanden, slug {capsule.slug}, twin {capsule.twin_id})"


def run_rebuild(
    qids: list[str],
    *,
    store: CandidateStore,
    config: PipelineConfig,
    dry_run: bool,
    run_date: date,
    fetch_json: FetchJson = _get_json,
    chat_fn_factory: Callable[[dict], Callable[[str], str] | None] = build_chat_fn,
    now: datetime | None = None,
) -> dict:
    report: dict = {
        "worker": "rebuild_profile",
        "run_date": run_date.isoformat(),
        "dry_run": dry_run,
        "results": {},
        "errors": {},
    }
    for qid in qids:
        try:
            qid, result = rebuild_one(
                qid, store=store, config=config, dry_run=dry_run,
                fetch_json=fetch_json, chat_fn_factory=chat_fn_factory, now=now,
            )
            report["results"][qid] = result
        except Exception as error:
            report["errors"][qid] = f"{type(error).__name__}: {error}"
    if not dry_run:
        store.save_changelog(run_date, report, suffix="-rebuild")
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Rebuild-Worker (einzelne Profile)")
    parser.add_argument("--qid", action="append", required=True, help="QID (mehrfach moeglich)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--enabled", action="store_true", help="pipeline.enabled Override (Test)")
    args = parser.parse_args(argv)

    config = DEFAULT_CONFIG if not args.enabled else PipelineConfig(enabled=True)
    if not config.enabled and not args.dry_run:
        print("pipeline.enabled ist false — nur --dry-run erlaubt. Abbruch.", file=sys.stderr)
        return 2

    from app.workers.ingest_candidates import _pipeline_bucket

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    report = run_rebuild(
        args.qid, store=store, config=config, dry_run=args.dry_run, run_date=date.today()
    )
    print(json.dumps({"results": report["results"], "errors": report["errors"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
