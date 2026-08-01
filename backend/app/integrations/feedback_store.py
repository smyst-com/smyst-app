"""Nutzerfeedback zu Chat-Antworten im Object Brain (IDrive e2, privat).

Baustein 3 der Qualitaetsschleife: Daumen hoch/runter und Meldungen aus dem
Twin-Chat werden als einzelne JSON-Records gespeichert. Daumen-runter-Records
liest der Eval-Worker (app/workers/eval_profiles) als Regressions-Testfaelle —
jede gemeldete schlechte Antwort wird automatisch zum Pruefstein des Profils.

Gleiche Robustheits-Regeln wie chat_store: Schreiben wirft NIE (Feedback darf
den Chat nicht brechen), Lesen liefert bei jedem Fehler eine leere Liste.
Es wird ausschliesslich geschrieben, nie geloescht.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import boto3
from botocore.config import Config

from app.core.config import settings

logger = logging.getLogger("smyst.integrations.feedback_store")

FEEDBACK_PREFIX = "chat-feedback/"

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
            config=Config(connect_timeout=4, read_timeout=6, retries={"max_attempts": 1}),
        )
    return _CLIENT


def _safe(value: str) -> str:
    return "".join(ch for ch in (value or "") if ch.isalnum() or ch in "-_")[:120]


def _key(twin_id: str | None, message_id: str) -> str:
    twin = _safe(twin_id or "") or "ohne-twin"
    return f"{FEEDBACK_PREFIX}{twin}/{_safe(message_id)}.json"


def save_feedback(record: dict[str, Any]) -> bool:
    """Schreibt einen Feedback-Record (synchron, im Threadpool aufrufen)."""
    if not storage_configured():
        return False
    try:
        message_id = str(record.get("messageId") or "")
        if not message_id:
            return False
        twin_id = record.get("twinId")
        _client().put_object(
            Bucket=settings.idrive_e2_bucket,
            Key=_key(twin_id if isinstance(twin_id, str) else None, message_id),
            Body=json.dumps(record, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )
        return True
    except Exception as exc:
        logger.warning("feedback write failed (%s)", type(exc).__name__)
        return False


def list_feedback(twin_id: str | None = None, *, limit: int = 50) -> list[dict[str, Any]]:
    """Laedt Feedback-Records, optional auf einen Twin gefiltert.

    Synchron (im Threadpool aufrufen); [] bei fehlender Konfiguration oder
    jedem Fehler. Reihenfolge unsortiert — Aufrufer sortieren nach createdAt.
    """
    if not storage_configured():
        return []
    try:
        prefix = FEEDBACK_PREFIX + (_safe(twin_id) + "/" if twin_id else "")
        client = _client()
        records: list[dict[str, Any]] = []
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=prefix):
            for entry in page.get("Contents", []) or []:
                if len(records) >= limit:
                    return records
                try:
                    response = client.get_object(
                        Bucket=settings.idrive_e2_bucket, Key=entry["Key"]
                    )
                    data = json.loads(response["Body"].read().decode("utf-8"))
                    if isinstance(data, dict):
                        records.append(data)
                except Exception:
                    continue
        return records
    except Exception:
        return []
