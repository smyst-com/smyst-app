"""Serverseitige Session-Widerrufbarkeit (Security-Runde 2, 29.09.2026).

Sessions sind zustandslose HMAC-Tokens mit 30 Tagen Laufzeit. Bis hierher
konnte ein gestohlener Token bis zum Ablauf nicht ungültig gemacht werden
(logout löschte nur Cookie/Bearer-Speicher beim Nutzer). Dieses Modul führt
einen Widerrufs-Index je Nutzer:

- revoke_sub(sub) markiert ALLE vor diesem Zeitpunkt ausgestellten Tokens
  des Nutzers als ungültig (Epoch-Ansatz: revokedAtMs >= token.createdAt).
- is_revoked() wird in auth._session_from_request geprüft — jeder Guard im
  Backend erbt den Schutz automatisch.

Persistenz: IDrive e2 (Object Brain), Objekt-Schlüssel encodieren den
Zeitpunkt (revoked-sessions/<subHash>-<ts>.json), damit der Index per LISTING
ohne GETs aufgebaut wird. In-Process-Cache mit 60 s TTL haelt den Auth-Pfad
kostenlos (Cache-Hit ~0 ms; maximal 1 LIST pro Minute pro Prozess). Ohne
konfiguriertes e2 gilt der Widerruf prozesslokal (RAM-Fallback, gleiches
Prinzip wie user_store/Chats).

Bewusst KEIN Un-Revoke beim Admin-Unblock (Fail-Secure): Nach Unblock loggt
sich der Nutzer einmal neu ein.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any

import boto3
from botocore.config import Config

from app.core.config import settings

logger = logging.getLogger("smyst.security.session_revocation")

REVOCATION_PREFIX = "revoked-sessions/"
INDEX_TTL_SECONDS = 60

_CLIENT: Any = None
_INDEX: dict[str, int] = {}
_INDEX_LOADED_AT: float = 0.0


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
            config=Config(connect_timeout=3, read_timeout=4, retries={"max_attempts": 1}),
        )
    return _CLIENT


def _sub_hash(sub: str) -> str:
    return hashlib.sha256(sub.encode("utf-8")).hexdigest()[:40]


def reset_cache_for_tests() -> None:
    """Test-Hook: RAM-Index und Zeitstempel zuruecksetzen."""
    global _INDEX, _INDEX_LOADED_AT
    _INDEX = {}
    _INDEX_LOADED_AT = 0.0


def _refresh_index_locked() -> dict[str, int]:
    """Laedt den Widerrufs-Index per LISTING (Zeitstempel steckt im Key)."""
    global _INDEX, _INDEX_LOADED_AT
    now = time.time()
    if now - _INDEX_LOADED_AT < INDEX_TTL_SECONDS:
        return _INDEX
    _INDEX_LOADED_AT = now
    if not storage_configured():
        return _INDEX
    try:
        client = _client()
        paginator = client.get_paginator("list_objects_v2")
        index: dict[str, int] = {}
        for page in paginator.paginate(Bucket=settings.idrive_e2_bucket, Prefix=REVOCATION_PREFIX):
            for item in page.get("Contents", []) or []:
                name = str(item.get("Key", "")).rsplit("/", 1)[-1]
                if not name.endswith(".json"):
                    continue
                stem = name[: -len(".json")]
                if "-" not in stem:
                    continue
                sub_hash, _, ts_part = stem.rpartition("-")
                try:
                    revoked_at = int(ts_part)
                except ValueError:
                    continue
                if revoked_at <= 0:
                    continue
                previous = index.get(sub_hash, 0)
                index[sub_hash] = max(previous, revoked_at)
        _INDEX = index
    except Exception:
        # Bei Storage-Fehler bleibt der letzte Stand gelten (kein Crash im
        # Auth-Pfad); der naechste Refresh nach TTL probiert erneut.
        logger.warning("session revocation index refresh failed", exc_info=True)
    return _INDEX


def is_revoked(sub: str, issued_at_ms: int) -> bool:
    """True, wenn ein Widerruf STRENG NACH der Token-Ausgabe existiert.

    Strikt (>) statt >= : Der Passwort-Reset widerruft zuerst und stellt
    direkt danach die neue Session aus - bei Gleichheit der Millisekunden
    muesste sich die frische Session sonst selbst widerrufen.
    """
    if not sub:
        return False
    revoked_at = _refresh_index_locked().get(_sub_hash(sub))
    return revoked_at is not None and revoked_at > max(0, int(issued_at_ms))


def revoke_sub(sub: str, reason: str = "manual") -> bool:
    """Macht alle VOR jetzt ausgestellten Session-Tokens dieses Nutzers ungueltig."""
    if not sub:
        return False
    now_ms = int(time.time() * 1000)
    sub_hash = _sub_hash(sub)
    if storage_configured():
        try:
            _client().put_object(
                Bucket=settings.idrive_e2_bucket,
                Key=f"{REVOCATION_PREFIX}{sub_hash}-{now_ms}.json",
                Body=json.dumps({"subHash": sub_hash, "revokedAtMs": now_ms, "reason": reason}).encode("utf-8"),
                ContentType="application/json",
            )
        except Exception:
            # RAM-Eintrag trotzdem setzen: besser prozesslokal widerrufen als gar nicht.
            logger.warning("session revocation persist failed", exc_info=True)
    _INDEX[sub_hash] = max(_INDEX.get(sub_hash, 0), now_ms)
    logger.info("sessions revoked for sub (hash=%s, reason=%s)", sub_hash, reason)
    return True
