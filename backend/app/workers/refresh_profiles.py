"""smyst.com Freshness-Worker: periodische Re-Recherche veroeffentlichter Profile.

Baustein 2 der Qualitaetsschleife: Veroeffentlichte Profile veralten, wenn
sich ihre Quellen weiterentwickeln (Wikipedia-Korrekturen, neue Fakten,
Lizenz-/Bildaenderungen). Dieser Worker prueft published-Profile, deren
letzter Check aelter als --max-age-days ist:

1. Wikidata EntityData neu laden (lastrevid = Aenderungsstand der Stammdaten).
2. Wikipedia-Summaries der verlinkten Artikel neu laden (Extract-Texte).
3. Fingerprint (SHA-256) ueber beides mit dem gespeicherten Stand vergleichen.

Ergebnis je Profil: 'refresh'-Block im Kandidaten-Dokument
(checked_at, content_hash, changed, needs_review, lastrevid). Bei Abweichung
wird needs_review=true gesetzt und bleibt gesetzt, bis ein Mensch das Profil
im Admin-Review aktualisiert hat — der Worker aendert NIE den Status und
veroeffentlicht NIE ungeprueft neue Inhalte (Spec-Prinzip: viel sammeln,
wenig veroeffentlichen). Der erste Lauf legt nur die Baseline an.

Start:
    python -m app.workers.refresh_profiles --limit 10 --dry-run
    python -m app.workers.refresh_profiles --enabled --limit 10 --max-age-days 30
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import date, datetime, timedelta, timezone
from typing import Callable

from app.ai.historical_pipeline import DEFAULT_CONFIG, PipelineConfig, PipelineStatus
from app.ai.research_profiles import parse_entity
from app.integrations.candidate_store import CandidateStore, build_s3_client
from app.workers.research_candidates import ENTITY_URL, SUMMARY_URL, _get_json

#: Standard-Intervall: monatlich reicht fuer historische Quellenlagen.
DEFAULT_MAX_AGE_DAYS = 30

#: Mehr Wikis bringen kaum Signal; de/en decken die Kuratierung ab.
_PREFERRED_WIKIS = ("dewiki", "enwiki")

FetchJson = Callable[[str], dict]


def compute_content_hash(lastrevid: object, extracts: dict[str, str]) -> str:
    payload = json.dumps(
        {"lastrevid": lastrevid, "extracts": dict(sorted(extracts.items()))},
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def refresh_one(
    document: dict,
    *,
    now: datetime,
    fetch_json: FetchJson = _get_json,
) -> tuple[dict, str]:
    """Prueft ein Profil auf Quellen-Aenderungen. Rueckgabe: (refresh-Block, Text)."""
    qid = document["wikidata_qid"]
    entity_payload = fetch_json(ENTITY_URL.format(qid=qid))
    entity = (entity_payload.get("entities") or {}).get(qid) or {}
    lastrevid = entity.get("lastrevid")
    research = parse_entity(entity_payload, qid)

    extracts: dict[str, str] = {}
    for wiki in _PREFERRED_WIKIS:
        title = research.wikipedia_titles.get(wiki)
        if not title:
            continue
        url = SUMMARY_URL.format(lang=wiki.removesuffix("wiki"), title=title.replace(" ", "_"))
        try:
            extracts[wiki] = str(fetch_json(url).get("extract", ""))
        except Exception:  # einzelne Wiki-Ausfaelle brechen den Check nicht ab
            continue

    content_hash = compute_content_hash(lastrevid, extracts)
    previous = document.get("refresh") if isinstance(document.get("refresh"), dict) else {}
    previous_hash = previous.get("content_hash")
    changed = previous_hash is not None and previous_hash != content_hash
    needs_review = changed or bool(previous.get("needs_review"))

    refresh_block = {
        "checked_at": now.isoformat(),
        "content_hash": content_hash,
        "lastrevid": lastrevid,
        "changed": changed,
        "needs_review": needs_review,
        "previous_checked_at": previous.get("checked_at"),
    }
    if previous_hash is None:
        result = "baseline angelegt"
    elif changed:
        result = "Quellen geaendert -> needs_review"
    elif needs_review:
        result = "unveraendert (needs_review noch offen)"
    else:
        result = "unveraendert"
    return refresh_block, result


def _is_due(document: dict, *, now: datetime, max_age_days: int) -> bool:
    refresh = document.get("refresh")
    if not isinstance(refresh, dict) or not refresh.get("checked_at"):
        return True
    try:
        checked_at = datetime.fromisoformat(str(refresh["checked_at"]))
    except ValueError:
        return True
    if checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=timezone.utc)
    return now - checked_at >= timedelta(days=max_age_days)


def _refresh_sort_key(document: dict) -> tuple[bool, str]:
    refresh = document.get("refresh")
    if not isinstance(refresh, dict) or not refresh.get("checked_at"):
        return (False, "")  # nie geprueft -> nach vorn
    return (True, str(refresh["checked_at"]))


def run_refresh_batch(
    *,
    store: CandidateStore,
    limit: int,
    dry_run: bool,
    run_date: date,
    max_age_days: int = DEFAULT_MAX_AGE_DAYS,
    fetch_json: FetchJson = _get_json,
    now: datetime | None = None,
) -> dict:
    now = now or datetime.now(timezone.utc)
    documents = [
        document
        for document in store.candidate_documents_by_status(PipelineStatus.PUBLISHED.value)
        if _is_due(document, now=now, max_age_days=max_age_days)
    ]
    documents.sort(key=_refresh_sort_key)
    if limit is not None:
        documents = documents[: max(limit, 0)]
    report: dict = {
        "worker": "refresh_profiles",
        "run_date": run_date.isoformat(),
        "started_at": now.isoformat(),
        "dry_run": dry_run,
        "max_age_days": max_age_days,
        "results": {},
        "changed": [],
        "errors": {},
    }
    for document in documents:
        qid = document.get("wikidata_qid", "?")
        try:
            refresh_block, result = refresh_one(document, now=now, fetch_json=fetch_json)
            report["results"][qid] = result
            if refresh_block["changed"]:
                report["changed"].append(qid)
            if not dry_run:
                store.save_candidate_document(qid, {**document, "refresh": refresh_block})
        except Exception as error:
            report["errors"][qid] = f"{type(error).__name__}: {error}"
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        store.save_changelog(run_date, report, suffix="-refresh")
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com Freshness-Worker (published-Profile)")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--max-age-days", type=int, default=DEFAULT_MAX_AGE_DAYS)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--enabled", action="store_true", help="pipeline.enabled Override (Test)")
    args = parser.parse_args(argv)

    config = DEFAULT_CONFIG if not args.enabled else PipelineConfig(enabled=True)
    if not config.enabled and not args.dry_run:
        print("pipeline.enabled ist false — nur --dry-run erlaubt. Abbruch.", file=sys.stderr)
        return 2

    from app.workers.ingest_candidates import _pipeline_bucket

    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    report = run_refresh_batch(
        store=store,
        limit=args.limit,
        dry_run=args.dry_run,
        run_date=date.today(),
        max_age_days=args.max_age_days,
    )
    print(
        json.dumps(
            {
                "results": len(report["results"]),
                "changed": len(report["changed"]),
                "errors": len(report["errors"]),
            }
        )
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
