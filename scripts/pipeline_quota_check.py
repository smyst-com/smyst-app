"""Leichter Tagesquoten-Check fuer den Pipeline-Watchdog (read-only).

Warum dieses Skript doppelt neben app.workers.pipeline_stats existiert: Der
Watchdog laeuft alle 15 min und soll NICHT das komplette Backend installieren
(pip install -e backend ≈ 2-3 min je Tick). Er braucht nur boto3 und LIST-
Zaehlungen ueber die Status-Marker — identische Logik zu pipeline_stats,
abgespeckt auf Stdlib + boto3.

Ausgabe: ein JSON-Block auf stdout (zeilengenau mit ^QUOTA-BEGINN / ^QUOTA-ENDE
extrahierbar):

    {
      "day": "2026-09-14",
      "daily_target": 10000,
      "published_today": 123,
      "remaining": 4877,
      "totals": {"published": 25971, ...},
      "today": {"published": 123, ...}
    }

Exit-Code immer 0 (Bericht, kein Fehlerfall) — Entscheidungen trifft der
Workflow-Shell-Code darueber.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse

import boto3
from botocore.config import Config

STATUS_PREFIX = "pipeline/status/"
# 5000 -> 10000 (22.09.2026, Freigabe Inhaber im Chat: 'Ja, 10.000/Tag')
DEFAULT_TARGET = 10000
WATCHED = (
    "candidate", "researched", "verified", "generated",
    "reviewed", "published", "rejected", "unpublished",
)


def _client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("IDRIVE_E2_ENDPOINT", "https://s3.us-west-2.idrivee2.com"),
        region_name="us-west-2",
        aws_access_key_id=os.environ["IDRIVE_E2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["IDRIVE_E2_SECRET_KEY"],
        config=Config(read_timeout=60, retries={"max_attempts": 5}),
    )


def status_entries(client, bucket: str, status: str) -> list[tuple[str, dt.datetime | None]]:
    prefix = f"{STATUS_PREFIX}{status}/"
    entries: list[tuple[str, dt.datetime | None]] = []
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []) or []:
            key = obj["Key"]
            qid = key[len(prefix):]
            if qid:
                entries.append((urllib.parse.unquote(qid), obj.get("LastModified")))
    return entries


def main() -> int:
    parser = argparse.ArgumentParser(description="Tagesquoten-Check (read-only)")
    parser.add_argument("--target", type=int, default=None, help="Tagesziel (Default 10000)")
    parser.add_argument("--statuses", default=",".join(WATCHED))
    args = parser.parse_args()

    bucket = os.environ.get("IDRIVE_E2_BUCKET", "smyst-memories")
    client = _client()
    now = dt.datetime.now(dt.timezone.utc)
    day_start = dt.datetime.combine(now.date(), dt.time.min, tzinfo=dt.timezone.utc)
    target = args.target
    if target is None:
        raw = os.environ.get("AUTOPILOT_DAILY_TARGET", "").strip()
        target = int(raw) if raw.isdigit() and raw else DEFAULT_TARGET

    totals: dict[str, int] = {}
    today: dict[str, int] = {}
    for status in [s for s in args.statuses.split(",") if s]:
        entries = status_entries(client, bucket, status)
        totals[status] = len(entries)
        count = 0
        for _qid, stamp in entries:
            if stamp is None:
                count += 1
                continue
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=dt.timezone.utc)
            if stamp >= day_start:
                count += 1
        today[status] = count

    published_today = today.get("published", 0)
    payload = {
        "day": now.date().isoformat(),
        "daily_target": target,
        "published_today": published_today,
        "remaining": max(0, target - published_today),
        "target_reached": published_today >= target,
        "totals": totals,
        "today": today,
        "generated_at": now.isoformat(),
    }
    print("QUOTA-BEGINN")
    print(json.dumps(payload, ensure_ascii=False))
    print("QUOTA-ENDE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
