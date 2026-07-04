from __future__ import annotations

import json
import logging
from typing import Any

import boto3
from botocore.config import Config

from app.core.config import settings

logger = logging.getLogger("smyst.integrations.chat_store")

# Chat-Archive gehoeren laut Architektur ins Object Brain (IDrive e2, privat).
CHAT_ARCHIVE_PREFIX = "chat-archives/"

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


def _key(chat_id: str) -> str:
    safe = "".join(ch for ch in chat_id if ch.isalnum() or ch in "-_")[:120]
    return f"{CHAT_ARCHIVE_PREFIX}{safe}.json"


def archive_chat(chat: dict[str, Any]) -> bool:
    """Schreibt den Chat als JSON-Archiv nach IDrive e2 (synchron, im Threadpool
    aufrufen). Wirft NIE — ein Archivfehler darf den Chat nicht brechen.
    Es wird ausschliesslich geschrieben, nie geloescht.
    """
    if not storage_configured():
        return False
    try:
        chat_id = str(chat.get("id") or "")
        if not chat_id:
            return False
        _client().put_object(
            Bucket=settings.idrive_e2_bucket,
            Key=_key(chat_id),
            Body=json.dumps(chat, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )
        return True
    except Exception as exc:
        logger.warning("chat archive write failed (%s)", type(exc).__name__)
        return False


def load_chat(chat_id: str) -> dict[str, Any] | None:
    """Laedt ein Chat-Archiv (synchron, im Threadpool aufrufen).

    None bei fehlender Konfiguration, fehlendem Objekt oder jedem Fehler.
    """
    if not storage_configured() or not chat_id:
        return None
    try:
        response = _client().get_object(
            Bucket=settings.idrive_e2_bucket, Key=_key(chat_id)
        )
        data = json.loads(response["Body"].read().decode("utf-8"))
        if isinstance(data, dict) and data.get("id"):
            return data
        return None
    except Exception:
        return None
