"""Testmatrix und Berichte des Language-Autopiloten im Object Brain.

Der smyst language autopilot (24/7, Auftrag Inhaber 24.09.2026) prueft die
Kombinationen Profil x Sprache x Funktion x Plattform gegen das echte
Live-System und persistiert:

  language-autopilot/status.json          Ein/Aus, Herzschlag, Laufzaehler
  language-autopilot/matrix/<key>.json    eine Zeile pro Kombination
  language-autopilot/reports/<date>.json  taeglicher Pruefbericht

Gleiche Robustheits-Regeln wie feedback_store: Schreiben wirft nie, Lesen
liefert bei Fehlern leere Ergebnisse. Es wird ausschliesslich geschrieben,
nie geloescht — das ist zugleich das Audit-Protokoll der Prueflaeufe.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

import boto3
from botocore.config import Config

from app.core.config import settings

logger = logging.getLogger("smyst.integrations.language_report_store")

PREFIX = "language-autopilot/"
STATUS_KEY = PREFIX + "status.json"
MATRIX_PREFIX = PREFIX + "matrix/"
REPORTS_PREFIX = PREFIX + "reports/"

_CLIENT: Any = None


def storage_configured() -> bool:
    return bool(settings.idrive_e2_access_key and settings.idrive_e2_secret_key)


def _client() -> Any:
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = boto3.client(
            "s3",
            endpoint_url=settings.idrive_e2_endpoint,
            region_name=settings.idrive_e2_region,
            aws_access_key_id=settings.idrive_e2_access_key,
            aws_secret_access_key=settings.idrive_e2_secret_key,
            config=Config(connect_timeout=4, read_timeout=8, retries={"max_attempts": 1}),
        )
    return _CLIENT


def _safe(value: str) -> str:
    return "".join(ch for ch in (value or "") if ch.isalnum() or ch in "-_")[:160]


def matrix_key(profile: str, language: str, function: str, platform: str) -> str:
    return (
        MATRIX_PREFIX
        + f"{_safe(profile)}__{_safe(language)}__{_safe(function)}__{_safe(platform)}.json"
    )


def _read_json(key: str) -> dict[str, Any] | None:
    if not storage_configured():
        return None
    try:
        response = _client().get_object(Bucket=settings.idrive_e2_bucket, Key=key)
        data = json.loads(response["Body"].read().decode("utf-8"))
        return data if isinstance(data, dict) else None
    except _client().exceptions.NoSuchKey:
        return None
    except Exception:
        return None


def _write_json(key: str, payload: dict[str, Any]) -> bool:
    if not storage_configured():
        return False
    try:
        _client().put_object(
            Bucket=settings.idrive_e2_bucket,
            Key=key,
            Body=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )
        return True
    except Exception as exc:
        logger.warning("language autopilot write failed for %s (%s)", key, type(exc).__name__)
        return False


def default_status() -> dict[str, Any]:
    return {
        "enabled": True,
        "version": 1,
        "createdAt": datetime.now(UTC).isoformat(),
        "lastHeartbeat": None,
        "lastRunAt": None,
        "nextRunAt": None,
        "runsCount": 0,
        "lastRunSummary": None,
    }


def load_status() -> dict[str, Any]:
    status = _read_json(STATUS_KEY)
    if status is None:
        return default_status()
    merged = {**default_status(), **status}
    return merged


def save_status(status: dict[str, Any]) -> bool:
    return _write_json(STATUS_KEY, status)


def set_enabled(enabled: bool) -> dict[str, Any]:
    """Ein-/Ausschalten (Admin). Gibt den neuen Status zurueck."""
    status = load_status()
    status["enabled"] = bool(enabled)
    status["changedAt"] = datetime.now(UTC).isoformat()
    save_status(status)
    return status


def heartbeat(summary: dict[str, Any] | None = None) -> dict[str, Any]:
    """Lebenszeichen nach jedem Lauf (gezaehlt, nie geloescht)."""
    status = load_status()
    status["lastHeartbeat"] = datetime.now(UTC).isoformat()
    status["runsCount"] = int(status.get("runsCount") or 0) + 1
    if summary is not None:
        status["lastRunAt"] = status["lastHeartbeat"]
        status["lastRunSummary"] = summary
    save_status(status)
    return status


def load_matrix(*, limit: int = 5000) -> list[dict[str, Any]]:
    """Alle Matrix-Eintraege (leer bei Fehlern/nicht konfiguriert)."""
    if not storage_configured():
        return []
    entries: list[dict[str, Any]] = []
    try:
        client = _client()
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=MATRIX_PREFIX):
            for entry in page.get("Contents", []) or []:
                if len(entries) >= limit:
                    return entries
                try:
                    response = client.get_object(
                        Bucket=settings.idrive_e2_bucket, Key=entry["Key"]
                    )
                    data = json.loads(response["Body"].read().decode("utf-8"))
                    if isinstance(data, dict):
                        entries.append(data)
                except Exception:
                    continue
    except Exception:
        return []
    return entries


def upsert_matrix_entry(entry: dict[str, Any]) -> bool:
    """Ein Testergebnis schreiben (lastTestedAt, Result, Fehler, Latenz)."""
    required = ("profile", "language", "function", "platform")
    if not all(entry.get(field) for field in required):
        return False
    key = matrix_key(
        str(entry["profile"]), str(entry["language"]), str(entry["function"]), str(entry["platform"])
    )
    previous = _read_json(key) or {}
    attempts = int(previous.get("attempts") or 0) + 1
    payload = {
        **previous,
        **entry,
        "attempts": attempts,
        "history": (previous.get("history") or [])[-9:] + [
            {
                "at": entry.get("testedAt"),
                "result": entry.get("result"),
                "latencyMs": entry.get("latencyMs"),
                "model": entry.get("model"),
            }
        ],
    }
    return _write_json(key, payload)


def save_report(report: dict[str, Any], day: str | None = None) -> bool:
    stamp = day or datetime.now(UTC).strftime("%Y-%m-%d")
    return _write_json(REPORTS_PREFIX + f"{stamp}.json", report)
