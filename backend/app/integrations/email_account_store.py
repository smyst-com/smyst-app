"""E-Mail-Konten-Speicher für smyst.com im privaten IDrive-e2-Bucket (Object Brain).

Architektur: Der Control Server bleibt zustandslos; Kontodaten liegen als kleine,
private JSON-Objekte in IDrive e2. Objektschlüssel sind SHA-256-Hashes der
normalisierten E-Mail-Adresse — kein Klartext-Listing von E-Mail-Adressen möglich.
Passwörter liegen ausschließlich als scrypt-Hash vor (siehe app.security.passwords).
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
import uuid
from typing import Any

from app.core.config import settings

ACCOUNT_PREFIX = "auth/email-accounts/v1/"


class EmailAccountStoreError(RuntimeError):
    """Basisfehler des Konten-Speichers."""


class EmailAccountStoreNotConfigured(EmailAccountStoreError):
    """IDrive-e2-Zugangsdaten fehlen (z. B. lokale Entwicklung)."""


class EmailAccountAlreadyExists(EmailAccountStoreError):
    """Für diese E-Mail existiert bereits ein Konto."""


def normalize_email(email: str) -> str:
    return email.strip().lower()


def account_key(email: str) -> str:
    digest = hashlib.sha256(normalize_email(email).encode("utf-8")).hexdigest()
    return f"{ACCOUNT_PREFIX}{digest}.json"


class EmailAccountStore:
    """Synchroner S3-Store; Aufrufer nutzen asyncio.to_thread (boto3 ist blocking)."""

    def __init__(self) -> None:
        self._client_lock = threading.Lock()
        self._client: Any = None
        self._bucket_checked = False

    def is_configured(self) -> bool:
        return bool(settings.idrive_e2_access_key and settings.idrive_e2_secret_key)

    def _get_client(self) -> Any:
        if not self.is_configured():
            raise EmailAccountStoreNotConfigured("IDrive e2 credentials missing")
        with self._client_lock:
            if self._client is None:
                import boto3  # lazy: hält Import-Kosten aus dem App-Start heraus
                from botocore.client import Config

                self._client = boto3.client(
                    "s3",
                    endpoint_url=settings.idrive_e2_endpoint,
                    region_name=settings.idrive_e2_region,
                    aws_access_key_id=settings.idrive_e2_access_key,
                    aws_secret_access_key=settings.idrive_e2_secret_key,
                    config=Config(connect_timeout=5, read_timeout=10, retries={"max_attempts": 2}),
                )
            return self._client

    def _ensure_bucket(self, client: Any) -> None:
        """Legt den privaten Bucket bei Bedarf an (private Buckets sind laut
        IDrive-e2-Kontostatus erlaubt; öffentliche Policies werden nie gesetzt)."""
        if self._bucket_checked:
            return
        from botocore.exceptions import ClientError

        bucket = settings.idrive_e2_bucket
        try:
            client.head_bucket(Bucket=bucket)
        except ClientError as error:
            status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status == 404:
                client.create_bucket(Bucket=bucket)
            else:
                raise
        self._bucket_checked = True

    def get_account(self, email: str) -> dict[str, Any] | None:
        from botocore.exceptions import ClientError

        client = self._get_client()
        self._ensure_bucket(client)
        try:
            response = client.get_object(Bucket=settings.idrive_e2_bucket, Key=account_key(email))
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code", "")
            if code in {"NoSuchKey", "404", "NotFound"}:
                return None
            raise
        payload = json.loads(response["Body"].read().decode("utf-8"))
        return payload if isinstance(payload, dict) else None

    def create_account(self, email: str, password_hash: dict[str, Any], name: str | None) -> dict[str, Any]:
        if self.get_account(email) is not None:
            raise EmailAccountAlreadyExists(normalize_email(email))
        now_ms = int(time.time() * 1000)
        record: dict[str, Any] = {
            "version": 1,
            "sub": f"email:{uuid.uuid4()}",
            "email": normalize_email(email),
            "name": (name or "").strip()[:120] or None,
            "passwordHash": password_hash,
            "status": "active",
            "emailVerified": False,
            "createdAt": now_ms,
            "updatedAt": now_ms,
        }
        self._put_record(record)
        return record

    def update_account(self, record: dict[str, Any]) -> dict[str, Any]:
        record = dict(record)
        record["updatedAt"] = int(time.time() * 1000)
        self._put_record(record)
        return record

    def _put_record(self, record: dict[str, Any]) -> None:
        client = self._get_client()
        self._ensure_bucket(client)
        client.put_object(
            Bucket=settings.idrive_e2_bucket,
            Key=account_key(record["email"]),
            Body=json.dumps(record, separators=(",", ":"), sort_keys=True).encode("utf-8"),
            ContentType="application/json",
        )


_store: EmailAccountStore | None = None
_store_lock = threading.Lock()


def get_email_account_store() -> EmailAccountStore:
    global _store
    with _store_lock:
        if _store is None:
            _store = EmailAccountStore()
        return _store


def set_email_account_store(store: EmailAccountStore | None) -> None:
    """Nur für Tests: erlaubt das Einsetzen eines Fake-Stores."""
    global _store
    with _store_lock:
        _store = store
