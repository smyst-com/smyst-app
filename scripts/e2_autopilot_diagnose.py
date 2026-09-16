"""Autopilot-Freigabe-Diagnose (nur lesend) fuer den e2-Write-Probe-Workflow.

Beantwortet die Frage 'Klick auf "Alle freigeben" war wirkungslos' mit
Bucket-Fakten: Wie viele Staging-Marker liegen in pipeline/autopilot/pending/,
wie viele davon sind bereits geschlossene Tombstones ({decision: ...}), und
welche Entscheidungen (applied/rejected/incomplete) wurden wann geschrieben?

    python scripts/e2_autopilot_diagnose.py          # Tabelle auf stdout
    python scripts/e2_autopilot_diagnose.py --json   # ein JSON-Objekt
"""

from __future__ import annotations

import argparse
import json
import os

import boto3
from botocore.config import Config

ENDPOINT = "https://s3.us-west-2.idrivee2.com"
PENDING_PREFIX = "pipeline/autopilot/pending/"
DECIDED_PREFIXES = {
    "applied": "pipeline/autopilot/applied/",
    "rejected": "pipeline/autopilot/rejected/",
    "incomplete": "pipeline/autopilot/incomplete/",
}
#: Wie viele Marker exemplarisch mit Inhalt gezeigt werden (Kurzfassung).
SAMPLE_LIMIT = 5


def _client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("IDRIVE_E2_ENDPOINT", ENDPOINT),
        region_name="us-west-2",
        aws_access_key_id=os.environ["IDRIVE_E2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["IDRIVE_E2_SECRET_KEY"],
        config=Config(read_timeout=60, retries={"max_attempts": 2}),
    )


def _list_keys(client, bucket: str, prefix: str, limit: int | None = None) -> list[str]:
    keys: list[str] = []
    kwargs: dict = {"Bucket": bucket, "Prefix": prefix}
    while True:
        response = client.list_objects_v2(**kwargs)
        for obj in response.get("Contents", []) or []:
            keys.append(obj["Key"])
            if limit is not None and len(keys) >= limit:
                return keys
        if not response.get("IsTruncated"):
            return keys
        kwargs["ContinuationToken"] = response.get("NextContinuationToken")


def diagnose(client, bucket: str) -> dict:
    marker_keys = [
        key for key in _list_keys(client, bucket, PENDING_PREFIX)
        if key.endswith(".json") and "/" not in key[len(PENDING_PREFIX):]
    ]
    tombstones: list[str] = []
    staging_samples: list[dict] = []
    for key in marker_keys:
        try:
            body = client.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
            record = json.loads(body)
        except Exception as error:  # noqa: BLE001 - Diagnose sammelt, sie wirft nicht
            staging_samples.append({"key": key, "error": f"{type(error).__name__}: {str(error)[:120]}"})
            continue
        if isinstance(record, dict) and record.get("decision"):
            tombstones.append(key)
        elif len(staging_samples) < SAMPLE_LIMIT:
            staging_samples.append({
                "key": key,
                "old_version": record.get("old_version") if isinstance(record, dict) else None,
                "new_version": record.get("new_version") if isinstance(record, dict) else None,
                "staged_at": record.get("staged_at") if isinstance(record, dict) else None,
            })

    decided: dict[str, dict] = {}
    for label, prefix in DECIDED_PREFIXES.items():
        keys = _list_keys(client, bucket, prefix)
        decided[label] = {"count": len(keys), "newest": sorted(keys)[-SAMPLE_LIMIT:]}
    tombstone_decisions: dict[str, int] = {}
    for key in tombstones:
        try:
            record = json.loads(
                client.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
            )
            decision = str(record.get("decision"))
        except Exception:  # noqa: BLE001
            decision = "unlesbar"
        tombstone_decisions[decision] = tombstone_decisions.get(decision, 0) + 1

    return {
        "bucket": bucket,
        "pending_marker": len(marker_keys),
        "pending_tombstones": len(tombstones),
        "tombstone_decisions": tombstone_decisions,
        "staging_beispiele": staging_samples,
        "entscheidungen": decided,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    bucket = os.environ.get("IDRIVE_E2_BUCKET", "smyst-memories")
    report = diagnose(_client(), bucket)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"Bucket: {report['bucket']}")
        print(f"Staging-Marker in pending/: {report['pending_marker']}")
        print(f"  davon geschlossen (Tombstone): {report['pending_tombstones']} {report['tombstone_decisions']}")
        for label, info in report["entscheidungen"].items():
            print(f"{label}/: {info['count']} Eintraege")
            for key in info["newest"]:
                print(f"  neu: {key}")
        if report["staging_beispiele"]:
            print("Offene Staging-Beispiele:")
            for sample in report["staging_beispiele"]:
                print(f"  {sample}")


if __name__ == "__main__":
    main()
