"""smyst.com Seed-Worker: kuratierte Kandidaten aus einer Datei einspielen.

Die Discovery-Stufe (Wikidata-SPARQL) wird uebersprungen, weil die Auswahl
menschlich kuratiert ist. ALLE Sicherungen des Ingest bleiben erhalten:

- QID-Aufloesung gegen Wikidata (Dedup-Anker, keine erfundenen QIDs),
- Datums-Verifikation: Wikidata-Sterbejahr muss zum kuratierten Sterbejahr
  passen (+/- 2 Jahre), sonst gilt der Kandidat als nicht aufgeloest,
- Blacklist-/Dedup-/Sterbejahr-Screening via screen_candidates,
- Audit-Changelog nach IDrivee2.com (Suffix "-seed", ueberschreibt nie den
  taeglichen Ingest-Bericht).

Start:
    python -m app.workers.seed_candidates --file smyst_179_candidates.json --dry-run
    python -m app.workers.seed_candidates --file smyst_179_candidates.json --enabled

Kuratierte Seeds sind bewusst von der Sitelink-Untergrenze ausgenommen
(min_sitelinks dient als Bekanntheits-Proxy der automatischen Discovery;
bei menschlicher Kuratierung ersetzt die Kuratierung diesen Proxy).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
from dataclasses import replace
from datetime import date, datetime, timezone
from pathlib import Path

import httpx

from app.ai.historical_pipeline import DEFAULT_CONFIG, HistoricalCandidate, PipelineConfig
from app.ai.wikidata_candidates import USER_AGENT, screen_candidates
from app.integrations.candidate_store import CandidateStore, build_s3_client

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
SEED_MIN_SITELINKS = 3          # kuratierte Auswahl ersetzt den Bekanntheits-Proxy
DEATH_YEAR_TOLERANCE = 2        # Wikidata vs. kuratiertes Sterbejahr
MAX_SEARCH_RESULTS = 6
REQUEST_PAUSE_SECONDS = 0.2     # hoeflich zur Wikidata-API


def default_fetch_json(url: str, *, timeout_seconds: float = 30.0) -> dict:
    response = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout_seconds)
    response.raise_for_status()
    return response.json()


def _api_url(**params: str) -> str:
    return f"{WIKIDATA_API}?{urllib.parse.urlencode({**params, 'format': 'json'})}"


def _wb_time_to_date(value: dict | None) -> date | None:
    """Wikidata-Zeitwert -> date. v.-Chr.-Daten und Unparsebares -> None."""
    if not value:
        return None
    raw = value.get("time", "")
    if raw.startswith("-"):
        return None
    match = re.match(r"\+(\d{4})-(\d{2})-(\d{2})", raw)
    if not match:
        return None
    year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
    try:
        return date(year, month or 1, day or 1)
    except ValueError:
        return None


def _first_claim_time(entity: dict, prop: str) -> dict | None:
    for claim in entity.get("claims", {}).get(prop, []):
        snak = claim.get("mainsnak", {})
        if snak.get("snaktype") == "value":
            return snak.get("datavalue", {}).get("value")
    return None


def death_year_hint(seed: dict) -> int | None:
    """Kuratiertes Sterbejahr aus death_date oder death_label (erste Jahreszahl)."""
    iso = seed.get("death_date")
    if iso:
        return int(str(iso)[:4])
    label = seed.get("death_label") or ""
    match = re.search(r"(\d{3,4})", label)
    return int(match.group(1)) if match else None


def _parse_seed_date(iso: str | None) -> date | None:
    if not iso:
        return None
    try:
        return date.fromisoformat(str(iso)[:10])
    except ValueError:
        return None


def resolve_candidate(
    seed: dict,
    *,
    fetch_json,
    languages: tuple[str, ...] = ("de", "en"),
    sleep=time.sleep,
) -> dict | None:
    """Loest einen kuratierten Seed gegen Wikidata auf (QID + Lebensdaten).

    Akzeptiert nur Treffer, deren Sterbejahr (P570) zum kuratierten
    Sterbejahr passt — das verhindert Namensvetter-Verwechslungen.
    """
    hint = death_year_hint(seed)
    if hint is None:
        return None
    names = [seed["name"], *seed.get("name_variants", [])]
    seen_ids: list[str] = []
    for language in languages:
        for name in names:
            url = _api_url(
                action="wbsearchentities", search=name, language=language,
                type="item", limit=str(MAX_SEARCH_RESULTS),
            )
            try:
                payload = fetch_json(url)
            except Exception:
                continue
            for hit in payload.get("search", []):
                qid = hit.get("id")
                if qid and qid not in seen_ids:
                    seen_ids.append(qid)
            sleep(REQUEST_PAUSE_SECONDS)
        if seen_ids:
            break  # deutsche Treffer reichen; en nur als Fallback
    if not seen_ids:
        return None

    url = _api_url(
        action="wbgetentities", ids="|".join(seen_ids[: MAX_SEARCH_RESULTS * 2]),
        props="claims|sitelinks",
    )
    try:
        entities = fetch_json(url).get("entities", {})
    except Exception:
        return None
    sleep(REQUEST_PAUSE_SECONDS)

    for qid in seen_ids:
        entity = entities.get(qid) or {}
        death = _wb_time_to_date(_first_claim_time(entity, "P570"))
        if death is None or abs(death.year - hint) > DEATH_YEAR_TOLERANCE:
            continue
        birth = _wb_time_to_date(_first_claim_time(entity, "P569")) or _parse_seed_date(
            seed.get("birth_date")
        )
        return {
            "qid": qid,
            "death_date": death,
            "birth_date": birth,
            "birth_label": seed.get("birth_label"),
            "death_label": seed.get("death_label"),
            "sitelink_count": len(entity.get("sitelinks", {})),
        }
    return None


def load_seed_file(path: str | Path) -> list[dict]:
    document = json.loads(Path(path).read_text(encoding="utf-8"))
    candidates = document.get("candidates") if isinstance(document, dict) else document
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("Seed-Datei enthaelt keine Kandidatenliste")
    for entry in candidates:
        if not entry.get("name") or not entry.get("category"):
            raise ValueError(f"Seed-Eintrag ohne name/category: {entry}")
    return candidates


def run_seed(
    seeds: list[dict],
    *,
    config: PipelineConfig,
    store: CandidateStore,
    dry_run: bool,
    run_date: date,
    fetch_json=default_fetch_json,
    sleep=time.sleep,
    limit: int | None = None,
) -> dict:
    seed_config = replace(config, min_sitelinks=SEED_MIN_SITELINKS)
    existing = store.existing_qids()
    report: dict = {
        "worker": "seed_candidates",
        "run_date": run_date.isoformat(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "totals": {"seeds": 0, "accepted": 0, "rejected": 0,
                   "skipped_duplicates": 0, "unresolved": 0},
        "accepted": [], "rejected": [], "skipped_duplicates": [], "unresolved": [],
    }

    resolved: list[HistoricalCandidate] = []
    for seed in seeds[:limit] if limit else seeds:
        report["totals"]["seeds"] += 1
        resolution = resolve_candidate(seed, fetch_json=fetch_json, sleep=sleep)
        if resolution is None:
            report["unresolved"].append({"name": seed["name"], "hint": death_year_hint(seed)})
            report["totals"]["unresolved"] += 1
            continue
        resolved.append(
            HistoricalCandidate(
                wikidata_qid=resolution["qid"],
                name=seed["name"],
                death_date=resolution["death_date"],
                birth_date=resolution["birth_date"],
                birth_label=resolution.get("birth_label"),
                death_label=resolution.get("death_label"),
                category=seed["category"],
                language=seed.get("language"),
                sitelink_count=resolution["sitelink_count"],
            )
        )

    result = screen_candidates(resolved, existing_qids=existing, config=seed_config)
    if not dry_run:
        for candidate in result.accepted:
            store.save_candidate(candidate)
            existing.add(candidate.wikidata_qid)

    report["accepted"] = [
        {"qid": c.wikidata_qid, "name": c.name, "death": c.death_date.isoformat()}
        for c in result.accepted
    ]
    report["rejected"] = [
        {"qid": c.wikidata_qid, "name": c.name, "reason": reason}
        for c, reason in result.rejected
    ]
    report["skipped_duplicates"] = list(result.skipped_duplicates)
    report["totals"]["accepted"] = len(result.accepted)
    report["totals"]["rejected"] = len(result.rejected)
    report["totals"]["skipped_duplicates"] = len(result.skipped_duplicates)
    report["finished_at"] = datetime.now(timezone.utc).isoformat()

    if not dry_run:
        store.save_changelog(run_date, report, suffix="-seed")
    return report


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - CLI-Verdrahtung
    parser = argparse.ArgumentParser(description="smyst.com kuratierter Kandidaten-Seed")
    parser.add_argument("--file", required=True, help="Seed-Datei (JSON)")
    parser.add_argument("--limit", type=int, default=None, help="nur die ersten N Seeds")
    parser.add_argument("--dry-run", action="store_true", help="nichts speichern, nur Bericht")
    parser.add_argument("--enabled", action="store_true", help="pipeline.enabled Override")
    args = parser.parse_args(argv)

    config = DEFAULT_CONFIG if not args.enabled else PipelineConfig(enabled=True)
    if not config.enabled and not args.dry_run:
        print("pipeline.enabled ist false — nur --dry-run erlaubt. Abbruch.", file=sys.stderr)
        return 2

    seeds = load_seed_file(args.file)
    store = CandidateStore(build_s3_client(), _pipeline_bucket())
    report = run_seed(
        seeds, config=config, store=store, dry_run=args.dry_run,
        run_date=date.today(), limit=args.limit,
    )
    print(json.dumps(
        {**report["totals"], "unresolved": report["unresolved"],
         "rejected": report["rejected"]},
        ensure_ascii=False,
    ))
    return 1 if report["totals"]["unresolved"] and not report["totals"]["accepted"] else 0


def _pipeline_bucket() -> str:  # pragma: no cover
    from app.core.config import settings

    return settings.idrive_e2_bucket


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
