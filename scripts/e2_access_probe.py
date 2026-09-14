"""e2-Zugriffsprobe (read + write) fuer Health-Check und manuelle Diagnose.

Signatur des Vorfalls vom 13.09.2026 ~23:30 UTC: LIST/GET OK, HEAD 403,
PUT AccessDenied — bucket-weit, in allen Prefixen (auch seit Wochen
beschriebenen). Ursache liegt beim e2-Konto (Kontingent oder Schluessel-
Rechte) und ist NUR in der IDrive-e2-Konsole des Inhabers behebbar.

Das Skript schreibt nur winzige Probe-Objekte (Probe-Praefix bzw.
pipeline/changelogs/probe-<ts>.json) und loescht sie anschliessend wieder,
wenn der Loesch-Zugriff erlaubt ist.

    python scripts/e2_access_probe.py            # Tabelle auf stdout
    python scripts/e2_access_probe.py --json     # ein JSON-Objekt
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys

import boto3
from botocore.config import Config

ENDPOINT = "https://s3.us-west-2.idrivee2.com"


def _client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("IDRIVE_E2_ENDPOINT", ENDPOINT),
        region_name="us-west-2",
        aws_access_key_id=os.environ["IDRIVE_E2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["IDRIVE_E2_SECRET_KEY"],
        config=Config(read_timeout=60, retries={"max_attempts": 2}),
    )


def run_probe(bucket: str | None = None) -> dict:
    bucket = bucket or os.environ.get("IDRIVE_E2_BUCKET", "smyst-memories")
    client = _client()
    ts = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S")
    results: dict[str, str] = {}

    def probe(label, fn):
        try:
            fn()
            results[label] = "OK"
        except Exception as error:  # noqa: BLE001 - Probe sammelt, sie wirft nicht
            results[label] = f"{type(error).__name__}: {str(error)[:120]}"

    def _list():
        next(iter(
            client.get_paginator("list_objects_v2").paginate(
                Bucket=bucket, Prefix="pipeline/status/published/",
                PaginationConfig={"MaxItems": 1},
            )
        ), None)

    probe("LIST", _list)
    probe("HEAD", lambda: client.head_object(
        Bucket=bucket, Key="pipeline/published/index.json"))
    probe("PUT", lambda: client.put_object(
        Bucket=bucket, Key=f"pipeline/changelogs/probe-{ts}.json", Body=b"probe"))
    probe("DELETE", lambda: client.delete_object(
        Bucket=bucket, Key=f"pipeline/changelogs/probe-{ts}.json"))
    return {
        "bucket": bucket,
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "results": results,
        "write_blocked": not results.get("PUT", "").startswith("OK"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="e2-Zugriffsprobe")
    parser.add_argument("--json", action="store_true", help="JSON statt Tabelle")
    args = parser.parse_args()
    report = run_probe()
    if args.json:
        print(json.dumps(report, ensure_ascii=False))
    else:
        print(f"e2-Zugriffsprobe ({report['checked_at']}, Bucket {report['bucket']}):")
        for label, status in report["results"].items():
            print(f"  {label:8} {status}")
        if report["write_blocked"]:
            print("  FOLGE: Schreibzugriff blockiert — Autopilot kann nichts speichern.")
            print("  Massnahme (nur Inhaber): IDrive-e2-Konsole pruefen —")
            print("  Bucket-Kontingent (Plan) oder Schluessel-Berechtigung (Read/Write).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
