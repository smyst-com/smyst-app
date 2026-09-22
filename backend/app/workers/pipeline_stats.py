"""smyst.com Autopilot-Statistik (read-only Standard; --save schreibt Bericht).

Beantwortet die Tagesquote-Fragen des 5.000-Profile-Autopiloten — OHNE den
teuren Voll-Scan (26.000+ GETs, 25-40 min), der die Shard-Laeufe 14.09.2026
ausgebremst hat:

- Bestand je Status (Status-Marker, LIST-Aufrufe)
- Statuswechsel HEUTE (UTC) je Status (Marker-LastModified)
- Tagesziel (Env AUTOPILOT_DAILY_TARGET, Default 10000) + Erreichungsgrad
- Ingest-Cursor-Staende je Kategorie (1 GET)

    python -m app.workers.pipeline_stats                 # nur Ausgabe (JSON)
    python -m app.workers.pipeline_stats --save          # + changelogs/stats-<tag>.json
    python -m app.workers.pipeline_stats --watchdog      # + Exit 1 bei Trockenheit
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, time, timezone
from typing import Any

from app.ai.historical_pipeline import PipelineStatus
from app.integrations.candidate_store import (
    CHANGELOG_PREFIX,
    CandidateStore,
    build_s3_client,
)

#: Tagesstatistik liegt im Changelog-Prefix: Dort schreibt der Pipeline-Key
#: nachweislich (Ingest-Laeufe). Eigene Prefixe (z. B. pipeline/stats/) sind
#: fuer die Pipeline-Credentials gesperrt (AccessDenied, Lauf 34789969666).
STATS_FILE_PREFIX = "stats-"

#: Status, deren HEUTE-Zahlen die Quoten-Entscheidungen tragen.
WATCHED_STATUSES = tuple(status.value for status in PipelineStatus)


#: Tagesziel des Autopiloten. 5000 -> 10000 (22.09.2026, Freigabe Inhaber
#: im Chat: 'Ja, 10.000/Tag'). Env AUTOPILOT_DAILY_TARGET ueberschreibt.
DEFAULT_DAILY_TARGET = 10000


def daily_target() -> int:
    raw = os.environ.get("AUTOPILOT_DAILY_TARGET", "").strip()
    try:
        return max(0, int(raw)) if raw else DEFAULT_DAILY_TARGET
    except ValueError:
        return DEFAULT_DAILY_TARGET


def utc_day_start(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return datetime.combine(now.date(), time.min, tzinfo=timezone.utc)


def build_report(store: CandidateStore, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    since = utc_day_start(now)
    report: dict[str, Any] = {
        "worker": "pipeline_stats",
        "generated_at": now.isoformat(),
        "day": now.date().isoformat(),
        "day_start_utc": since.isoformat(),
        "daily_target": daily_target(),
        "totals": {},
        "today": {},
    }
    for status in WATCHED_STATUSES:
        try:
            entries = store.status_entries(status)
        except Exception as error:  # noqa: BLE001 - Bericht soll weiterlaufen
            report["totals"][status] = None
            report.setdefault("errors", {})[status] = f"{type(error).__name__}: {error}"
            continue
        report["totals"][status] = len(entries)
        count = 0
        for _qid, last_modified in entries:
            stamp = last_modified
            if stamp is None:
                count += 1
                continue
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            if stamp >= since:
                count += 1
        report["today"][status] = count
    published_today = report["today"].get(PipelineStatus.PUBLISHED.value) or 0
    target = report["daily_target"]
    report["quota"] = {
        "published_today": published_today,
        "target": target,
        "remaining": max(0, target - published_today),
        "reached_percent": round(100.0 * published_today / target, 1) if target else None,
        "target_reached": published_today >= target,
    }
    try:
        report["ingest_cursor"] = store.load_ingest_cursor()
    except Exception as error:  # noqa: BLE001
        report["ingest_cursor"] = {}
        report.setdefault("errors", {})["ingest_cursor"] = f"{type(error).__name__}: {error}"
    return report


def save_report(store: CandidateStore, report: dict) -> str | None:
    """Bericht nach pipeline/changelogs/stats-<tag>.json — niemals tödlich."""
    body = json.dumps(report, ensure_ascii=False, default=str).encode("utf-8")
    key = f"{CHANGELOG_PREFIX}{STATS_FILE_PREFIX}{report.get('day', date.today().isoformat())}.json"
    try:
        store._client.put_object(  # noqa: SLF001 - bewusster interner Zugriff (Muster: _put_json)
            Bucket=store._bucket, Key=key, Body=body, ContentType="application/json"
        )
    except Exception as error:  # noqa: BLE001 - Statistik darf den Lauf nicht roet machen
        report.setdefault("errors", {})["save_report"] = f"{type(error).__name__}: {error}"
        return None
    return key


def main(argv: list[str] | None = None) -> int:
    from app.core.config import settings

    parser = argparse.ArgumentParser(description="smyst.com Autopilot-Statistik (read-only)")
    parser.add_argument("--save", action="store_true", help="Bericht nach pipeline/changelogs/ schreiben")
    parser.add_argument(
        "--watchdog", action="store_true",
        help="Exit 1, wenn HEUTE weder publiziert wurde noch Nachschub (candidate/generated/reviewed) existiert",
    )
    args = parser.parse_args(argv)

    store = CandidateStore(build_s3_client(), settings.idrive_e2_bucket)
    report = build_report(store)
    if args.save:
        key = save_report(store, report)
        report["saved_to"] = key

    if args.watchdog:
        today = report["today"]
        supply = sum(
            today.get(status, 0) or 0
            for status in (PipelineStatus.CANDIDATE.value, PipelineStatus.GENERATED.value, PipelineStatus.REVIEWED.value)
        )
        if (report["today"].get(PipelineStatus.PUBLISHED.value) or 0) == 0 and supply == 0:
            report["watchdog"] = "TROCKEN: heute weder Publikation noch Nachschub — Ingest pruefen"
            print(json.dumps(report, ensure_ascii=False, default=str))
            return 1

    print(json.dumps(report, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
