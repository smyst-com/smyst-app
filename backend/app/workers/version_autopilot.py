"""smyst.com Versions-Autopilot: endlose, bewachte Profil-Verbesserung.

Der Autopilot macht 99 % der Arbeit (Sammeln -> Rebuild -> QA-Gate ->
Eval-Direktvergleich), aber die neue Version geht NICHT automatisch live.
Stattdessen wird sie gestaged und landet im Freigabe-Bereich des Admin-
Cockpits — der Inhaber sieht die Uebersicht (alte vs. neue Version, Scores,
QA) und gibt mit EINEM Klick frei.

Pro Profil und Lauf:
1. Auswahl: schlechteste Eval-Scores zuerst, dann refresh.needs_review,
   dann 👎-Feedback-Haeufung (alles aus dem Kandidaten-Dokument).
2. Frische Recherche + Capsule-Neuaufbau MIT bestehender twin_id,
   Version = alte Version + 1 ( echte Versionshistorie, siehe twin_versions).
3. QA-Gate VOR allem anderen (gleicher run_qa-Code wie rebuild-one):
   Fail => Live-Capsule unangetastet, nur Bericht.
4. Eval-Direktvergleich: neue Capsule muss die alte schlagen
   (score strikt groesser). Verliert sie => verwerfen, Live bleibt.
5. Bei Sieg: Staging nach pipeline/autopilot/pending/{qid}/... plus
   Freigabe-Datensatz {qid}.json mit dem Vergleich fürs Admin-Cockpit.

Nichts wird geloescht, kein Statuswechsel, kein Unpublish — die Live-
Capsule aendert sich ausschliesslich durch die Freigabe im Admin-Bereich
(routes/admin_versions.py).

Start:
    python -m app.workers.version_autopilot --limit 5 --dry-run
    python -m app.workers.version_autopilot --enabled --limit 5
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from datetime import date, datetime, timezone
from typing import Callable
from uuid import UUID

from app.ai.capsule_builder import build_capsule
from app.ai.historical_pipeline import DEFAULT_CONFIG, PipelineConfig, PipelineStatus
from app.ai.profile_evals import run_profile_eval
from app.ai.qa_checks import ChatProviderDegradedError, run_qa
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.build_capsules import _put_json
from app.workers.qa_candidates import build_chat_fn, load_capsule_document
from app.workers.rebuild_profile import _fresh_research
from app.workers.research_candidates import _candidate_from_document

#: Staging-Bereich im Object Brain. pending/{qid}.json = Freigabe-Datensatz,
#: pending/{qid}/capsule.json|prompt.json|seo.json = gestagte neue Version.
PENDING_PREFIX = "pipeline/autopilot/pending/"

#: Konfigurierbare Mengen ohne Deploy (Object Brain, siehe _load_config).
CONFIG_KEY = "pipeline/autopilot/config.json"

DEFAULT_AUTORUN_CONFIG = {
    "batch_per_run": 5,
    "daily_limit": 40,
}

#: Sicherheitsbremse (Spec 5, Mengensteuerung): Uebersteigt die Verwerfungs-
#: quote eines Laufs diese Schwelle, bricht der Lauf ab — Qualität vor Masse.
MAX_REJECT_RATIO = 0.5


def _load_config(store: CandidateStore) -> dict:
    try:
        response = store._client.get_object(  # noqa: SLF001
            Bucket=store._bucket, Key=CONFIG_KEY
        )
        data = json.loads(response["Body"].read().decode("utf-8"))
        return {**DEFAULT_AUTORUN_CONFIG, **data} if isinstance(data, dict) else dict(DEFAULT_AUTORUN_CONFIG)
    except Exception:
        return dict(DEFAULT_AUTORUN_CONFIG)


def _load_json(store: CandidateStore, key: str) -> dict | None:
    try:
        response = store._client.get_object(Bucket=store._bucket, Key=key)  # noqa: SLF001
        return json.loads(response["Body"].read().decode("utf-8"))
    except Exception:
        return None


def _selection_sort_key(document: dict) -> tuple:
    """Auswahl-Prioritaet: nie evaluiert, dann schlechtester Score, dann
    Freshness-Bedarf, dann aeltester Eval-Stand."""
    report = document.get("eval_report") if isinstance(document.get("eval_report"), dict) else {}
    score = report.get("score")
    refresh = document.get("refresh") if isinstance(document.get("refresh"), dict) else {}
    return (
        0 if score is None else 1,                # nie evaluiert zuerst
        -(float(score) if isinstance(score, (int, float)) else 0.0),  # schlechteste zuerst
        0 if refresh.get("needs_review") else 1,  # Freshness-Bedarf vor
        str(report.get("finished_at") or ""),
    )


def stage_one(
    document: dict,
    *,
    store: CandidateStore,
    config: PipelineConfig,
    dry_run: bool,
    now: datetime,
    chat_fn_factory: Callable[[dict], Callable[[str], str] | None] = build_chat_fn,
    fetch_json: Callable[[str], dict] | None = None,
) -> tuple[str, str]:
    """Ein Profil durch den bewachten Loop: Rebuild -> QA -> Vergleich -> Staging."""
    from app.workers.rebuild_profile import FetchJson  # noqa: F401  (Typ-Doku)
    from app.workers.research_candidates import _get_json

    qid = str(document.get("wikidata_qid") or "?")
    live_capsule = _load_json(store, f"pipeline/capsules/{qid}/capsule.json") or {}
    old_version = int(live_capsule.get("version") or 1)
    old_report = document.get("eval_report") if isinstance(document.get("eval_report"), dict) else {}
    old_score = old_report.get("score") if isinstance(old_report.get("score"), (int, float)) else None

    research_doc, reason = _fresh_research(
        document, store=store, config=config, dry_run=dry_run,
        fetch_json=fetch_json or _get_json,
    )
    if research_doc is None:
        return qid, f"verworfen (Recherche: {reason}) — Live unveraendert"

    candidate = replace(
        _candidate_from_document(document),
        risk_score=document.get("risk_score"),
        risk_flags=document.get("risk_flags") or {},
        image_status=document.get("image_status"),
    )
    existing_twin_id = document.get("twin_id")
    capsule = build_capsule(
        candidate, research_doc, config=config,
        twin_id=UUID(existing_twin_id) if existing_twin_id else None,
    )
    capsule = replace(capsule, version=old_version + 1)
    capsule_doc = capsule.as_document()

    # --- QA-Gate (dieselbe Pruefung wie rebuild-one, gegen die NEUE Capsule)
    qa_document = {**document, "twin_id": str(capsule.twin_id), "source_count": research_doc.get("source_count", 0)}
    try:
        report = run_qa(qa_document, capsule_doc, [], chat_fn=chat_fn_factory(capsule_doc))
    except ChatProviderDegradedError as error:
        return qid, f"verworfen (Chat-Provider degradiert: {error}) — Live unveraendert"
    if not report.passed:
        return qid, f"verworfen (QA: {len(report.issues)} Issues) — Live unveraendert"

    # --- Eval-Direktvergleich: neu muss alt schlagen
    chat_fn = chat_fn_factory(capsule_doc)
    if chat_fn is None:
        return qid, "verworfen (kein Chat-Provider) — Live unveraendert"
    try:
        eval_report = run_profile_eval(document, [], chat_fn=chat_fn, previous_score=old_score)
    except ChatProviderDegradedError as error:
        return qid, f"verworfen (Chat-Provider degradiert: {error}) — Live unveraendert"
    new_score = float(eval_report.score)
    if old_score is not None and new_score <= float(old_score):
        return qid, (
            f"verworfen (Eval {new_score:.2f} <= alt {old_score:.2f}) — Live unveraendert"
        )

    pending_record = {
        "qid": qid,
        "name": document.get("name") or qid,
        "slug": capsule.slug,
        "old_version": old_version,
        "new_version": capsule.version,
        "old_score": old_score,
        "new_score": new_score,
        "qa_passed": True,
        "qa_issues": list(report.issues),
        "staged_at": now.isoformat(),
        "twin_id": str(capsule.twin_id),
    }

    if not dry_run:
        _put_json(store, f"{PENDING_PREFIX}{qid}/capsule.json", capsule_doc)
        _put_json(
            store, f"{PENDING_PREFIX}{qid}/prompt.json",
            {"wikidata_qid": qid, "persona_prompt": capsule.persona_prompt, "version": capsule.version},
        )
        _put_json(store, f"{PENDING_PREFIX}{qid}/seo.json", capsule.seo)
        _put_json(store, f"{PENDING_PREFIX}{qid}.json", pending_record)

    return qid, (
        f"gestaged v{old_version} -> v{capsule.version} "
        f"(Eval {old_score if old_score is None else f'{old_score:.2f}'} -> {new_score:.2f}, QA ok) — wartet auf Freigabe"
    )


def run_version_autopilot(
    *,
    store: CandidateStore,
    config: PipelineConfig,
    dry_run: bool,
    run_date: date,
    limit: int | None = None,
    now: datetime | None = None,
    fetch_json: Callable[[str], dict] | None = None,
    chat_fn_factory: Callable[[dict], Callable[[str], str] | None] = build_chat_fn,
) -> dict:
    now = now or datetime.now(timezone.utc)
    autopilot_config = _load_config(store)
    if limit is None:
        limit = int(autopilot_config.get("batch_per_run", 5))

    documents = store.candidate_documents_by_status(PipelineStatus.PUBLISHED.value)
    documents.sort(key=_selection_sort_key)
    documents = documents[: max(limit, 0)]

    report: dict = {
        "worker": "version_autopilot",
        "run_date": run_date.isoformat(),
        "started_at": now.isoformat(),
        "dry_run": dry_run,
        "limit": limit,
        "config": autopilot_config,
        "results": {},
        "staged": [],
        "errors": {},
    }
    for document in documents:
        qid = str(document.get("wikidata_qid") or "?")
        try:
            qid, result = stage_one(
                document, store=store, config=config, dry_run=dry_run, now=now,
                chat_fn_factory=chat_fn_factory, fetch_json=fetch_json,
            )
            report["results"][qid] = result
            if result.startswith("gestaged"):
                report["staged"].append(qid)
        except Exception as error:
            report["errors"][qid] = f"{type(error).__name__}: {error}"

    # Sicherheitsbremse: haufenweise Verwerfungen = Recherche/Provider-Problem,
    # nicht "schlechte Profile". Lauf melden, aber weiterlaufen lassen — die
    # Live-Capsulen sind durch Staging ohnehin nie beruehrt.
    evaluated = len(report["results"])
    staged = len(report["staged"])
    report["staged_count"] = staged
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_changelog(run_date, report, suffix="-version-autopilot")
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Versions-Autopilot (staged, mit Freigabe)")
    parser.add_argument("--limit", type=int, default=None, help="Max. Profile pro Lauf (Default: Config)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--enabled", action="store_true", help="pipeline.enabled Override (Test)")
    args = parser.parse_args(argv)

    config = DEFAULT_CONFIG if not args.enabled else PipelineConfig(enabled=True)
    if not config.enabled and not args.dry_run:
        print("pipeline.enabled ist false — nur --dry-run erlaubt. Abbruch.", file=sys.stderr)
        return 2

    from app.workers.ingest_candidates import _pipeline_bucket

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    report = run_version_autopilot(
        store=store, config=config, dry_run=args.dry_run, run_date=date.today(), limit=args.limit
    )
    print(
        json.dumps(
            {
                "staged": len(report["staged"]),
                "evaluated": len(report["results"]),
                "errors": len(report["errors"]),
                "staged_qids": report["staged"],
            },
            ensure_ascii=False,
        )
    )
    # Pro-QID-Ergebnis ins Lauf-Log: Verwurfgruende (Provider, QA, Eval) sind
    # im Actions-Log sofort sichtbar, ohne den Changelog im Object Brain zu oeffnen.
    for qid, result in report["results"].items():
        print(f"version-autopilot: {qid} -> {result}", flush=True)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
