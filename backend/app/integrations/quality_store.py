"""Qualitaets-Zusammenfassung der Profile im Object Brain (IDrive e2, privat).

Der Aggregations-Worker (app/workers/report_quality) scannt 3x taeglich alle
published-Profile und schreibt EINE kompakte Zusammenfassung unter einem
festen Key. Der Admin-Endpoint (/api/admin/quality) liest nur diesen einen
Key — kein Live-Scan ueber 1000+ Objekte pro Seitenaufruf.

Gleiche Robustheits-Regeln wie chat_store/feedback_store: Schreiben wirft
NIE, Lesen liefert bei jedem Fehler None. Nur schreiben, nie loeschen.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import boto3
from botocore.config import Config

from app.core.config import settings

logger = logging.getLogger("smyst.integrations.quality_store")

SUMMARY_KEY = "pipeline/quality/summary.json"

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


def save_summary(summary: dict[str, Any]) -> bool:
    """Schreibt die Qualitaets-Zusammenfassung (synchron, im Threadpool aufrufen)."""
    if not storage_configured():
        return False
    try:
        _client().put_object(
            Bucket=settings.idrive_e2_bucket,
            Key=SUMMARY_KEY,
            Body=json.dumps(summary, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )
        return True
    except Exception as exc:
        logger.warning("quality summary write failed (%s)", type(exc).__name__)
        return False


def load_summary() -> dict[str, Any] | None:
    """Laedt die Zusammenfassung (synchron, im Threadpool aufrufen); None bei Fehler."""
    if not storage_configured():
        return None
    try:
        response = _client().get_object(Bucket=settings.idrive_e2_bucket, Key=SUMMARY_KEY)
        data = json.loads(response["Body"].read().decode("utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None
