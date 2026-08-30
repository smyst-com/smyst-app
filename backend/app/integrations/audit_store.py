"""Revisionssicheres Admin-Audit-Log im Object Brain (IDrive e2, privat).

Jede schreibende Admin-Aktion (Sperren, Freigaben, Verwerfen, Einnahmen-
Erfassung) wird als kleines JSON-Objekt unter audit/admin-actions/ abgelegt:
append-only, wird nie geloescht oder veraendert (Ehrlichkeits- und Nachvoll-
ziehbarkeitsregel der Qualitaetsschleife, siehe AGENTS.md).

Robustheits-Regeln wie feedback_store: Schreiben wirft NIE (eine Audit-
Pflicht darf die Aktion selbst nicht blockieren), Lesen liefert bei jedem
Fehler eine leere Liste. Ohne e2-Konfiguration laeuft ein RAM-Fallback —
lokal testbar, in Produktion persistiert dann e2.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import boto3
from botocore.config import Config

from app.core.config import settings

logger = logging.getLogger("smyst.integrations.audit_store")

AUDIT_PREFIX = "audit/admin-actions/"

_CLIENT: Any = None
_MEMORY: list[dict[str, Any]] = []


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


def record_action(
    *, actor_sub: str | None, actor_email: str | None, action: str,
    target_type: str, target_id: str | None = None, detail: str | None = None,
) -> dict[str, Any]:
    """Haengt eine Audit-Record an (synchron, im Threadpool aufrufen).

    Wirft nie; Rueckgabe ist der Record inklusive id/createdAt.
    """
    record: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "actorSub": actor_sub,
        "actorEmail": actor_email,
        "action": action,
        "targetType": target_type,
        "targetId": target_id,
        "detail": detail,
        "createdAt": datetime.now(UTC).isoformat(),
    }
    _MEMORY.append(record)
    if len(_MEMORY) > 500:
        del _MEMORY[:-500]
    if not storage_configured():
        return record
    try:
        day = record["createdAt"][:10].replace("-", "")
        _client().put_object(
            Bucket=settings.idrive_e2_bucket,
            Key=f"{AUDIT_PREFIX}{day}/{record['id']}.json",
            Body=json.dumps(record, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )
    except Exception as exc:  # noqa: BLE001 — Audit darf die Aktion nie blockieren
        logger.warning("audit write failed (%s)", type(exc).__name__)
    return record


def list_recent(limit: int = 50) -> list[dict[str, Any]]:
    """Neueste Audit-Records (synchron, im Threadpool aufrufen).

    Liste die letzten 7 Tages-Buckets und sortiert nach createdAt absteigend.
    [] bei fehlender Konfiguration oder Fehlern.
    """
    if not storage_configured():
        return list(reversed(_MEMORY[-limit:]))
    try:
        from datetime import timedelta

        client = _client()
        records: list[dict[str, Any]] = []
        today = datetime.now(UTC).date()
        for offset in range(7):
            day = (today - timedelta(days=offset)).strftime("%Y%m%d")
            paginator = client.get_paginator("list_objects_v2")
            for page in paginator.paginate(
                Bucket=settings.idrive_e2_bucket, Prefix=f"{AUDIT_PREFIX}{day}/"
            ):
                for entry in page.get("Contents", []) or []:
                    try:
                        response = client.get_object(
                            Bucket=settings.idrive_e2_bucket, Key=entry["Key"]
                        )
                        data = json.loads(response["Body"].read().decode("utf-8"))
                        if isinstance(data, dict):
                            records.append(data)
                    except Exception:  # noqa: BLE001, S112
                        continue
        records.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)
        return records[:limit]
    except Exception:  # noqa: BLE001
        return list(reversed(_MEMORY[-limit:]))
