from __future__ import annotations

import json
import logging
from typing import Any

import boto3
from botocore.config import Config

from app.core.config import settings

logger = logging.getLogger("smyst.integrations.user_store")

# Nutzer-MVP-Daten (Profil, Twins, Memories) gehoeren laut Architektur ins
# Object Brain (IDrive e2, privat). Ein JSON-Dokument pro Nutzer.
USER_DOC_PREFIX = "user-mvp/"

# Groessenlimit pro Nutzer-Dokument (Schutz vor Missbrauch).
MAX_DOC_BYTES = 400 * 1024

_CLIENT: Any = None

# In-Process-Cache; dient ohne e2-Konfiguration auch als RAM-Fallback,
# damit die API immer funktioniert (gleiches Prinzip wie Chats).
_MEMORY: dict[str, dict[str, Any]] = {}


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


def _key(user_sub: str) -> str:
    safe = "".join(ch for ch in user_sub if ch.isalnum() or ch in "-_:")[:160]
    safe = safe.replace(":", "__")
    return f"{USER_DOC_PREFIX}{safe}.json"


def load_user_doc(user_sub: str) -> dict[str, Any] | None:
    """Laedt das Nutzer-Dokument (Cache zuerst, dann IDrive e2).

    None, wenn noch nichts gespeichert wurde oder ein Fehler auftritt.
    """
    if not user_sub:
        return None
    cached = _MEMORY.get(user_sub)
    if cached is not None:
        return cached
    if not storage_configured():
        return None
    try:
        response = _client().get_object(
            Bucket=settings.idrive_e2_bucket, Key=_key(user_sub)
        )
        data = json.loads(response["Body"].read().decode("utf-8"))
        if isinstance(data, dict):
            _MEMORY[user_sub] = data
            return data
        return None
    except Exception:
        return None


def save_user_doc(user_sub: str, doc: dict[str, Any]) -> bool:
    """Speichert das Nutzer-Dokument (Cache sofort, e2 synchron).

    Wirft NIE — ein Speicherfehler in e2 darf die API nicht brechen; die
    Daten bleiben dann bis zum naechsten Deploy im RAM-Cache verfuegbar.
    Es wird ausschliesslich geschrieben, nie geloescht.
    """
    if not user_sub or not isinstance(doc, dict):
        return False
    _MEMORY[user_sub] = doc
    if not storage_configured():
        return True
    try:
        body = json.dumps(doc, ensure_ascii=False).encode("utf-8")
        if len(body) > MAX_DOC_BYTES:
            logger.warning("user doc too large (%d bytes), e2 write skipped", len(body))
            return False
        _client().put_object(
            Bucket=settings.idrive_e2_bucket,
            Key=_key(user_sub),
            Body=body,
            ContentType="application/json",
        )
        return True
    except Exception as exc:
        logger.warning("user doc write failed (%s)", type(exc).__name__)
        return True


def delete_user_doc_from_cache(user_sub: str) -> None:
    """Entfernt das Dokument nur aus dem RAM-Cache (e2 bleibt unberuehrt)."""
    _MEMORY.pop(user_sub, None)

VOICE_SAMPLE_PREFIX = "voice-samples/"


def save_voice_sample(user_sub: str, data: bytes, content_type: str) -> str | None:
    """Speichert die private Stimmprobe des Nutzers im Object Brain.

    Rueckgabe: Objekt-Key oder None (nicht konfiguriert/Fehler).
    Es wird nur geschrieben, nie geloescht (neue Probe ueberschreibt die alte).
    """
    if not user_sub or not data:
        return None
    if not storage_configured():
        return None
    safe = "".join(ch for ch in user_sub if ch.isalnum() or ch in "-_:")[:160]
    safe = safe.replace(":", "__")
    extension = "webm" if "webm" in (content_type or "") else "wav"
    key = f"{VOICE_SAMPLE_PREFIX}{safe}.{extension}"
    try:
        _client().put_object(
            Bucket=settings.idrive_e2_bucket,
            Key=key,
            Body=data,
            ContentType=content_type or "audio/webm",
        )
        return key
    except Exception as exc:
        logger.warning("voice sample write failed (%s)", type(exc).__name__)
        return None
