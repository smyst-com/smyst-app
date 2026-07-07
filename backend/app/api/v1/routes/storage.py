"""Sichere Upload-/Download-Pipeline (signierte URLs, Phase 1 echt).

Ersetzt den bisherigen Vertrags-Stub: POST /storage/upload-url liefert jetzt
eine echte presigned PUT-URL fuer IDrive e2 (Direct-Upload, keine grossen
Dateien ueber den Control-Pfad), POST /storage/upload-complete verifiziert
das Objekt serverseitig (HEAD) und protokolliert Metadaten im Nutzerdokument.

Privacy & Security by Design:
- Nur mit angemeldeter Session (HttpOnly-Cookie) + CSRF-Header.
- Jeder Nutzer laedt ausschliesslich unter seinem eigenen Prefix
  user-uploads/{sub}/... hoch; upload-complete prueft die Zugehoerigkeit.
- URLs sind zeitlich begrenzt (PUT 10 Min, GET 60 Min), Content-Type wird
  mitsigniert, Groessen- und Typlimits pro Kategorie.
- Bucket-CORS wird idempotent auf https://smyst.com begrenzt gesetzt.
- Es wird nichts geloescht; der Delete-Endpunkt bleibt bewusst gesperrt.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from typing import Any

import boto3
from botocore.config import Config
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.v1.routes.auth import _session_from_request
from app.core.config import settings

logger = logging.getLogger("smyst.api.storage")

router = APIRouter(prefix="/storage", tags=["storage"])

CATEGORY_LIMITS: dict[str, int] = {
    "audio": 25 * 1024 * 1024,
    "image": 10 * 1024 * 1024,
    "video": 50 * 1024 * 1024,
    "document": 20 * 1024 * 1024,
    "profile_image": 2 * 1024 * 1024,
    "backup": 25 * 1024 * 1024,
    "twin_data": 10 * 1024 * 1024,
    "static_asset": 10 * 1024 * 1024,
    "app_build": 50 * 1024 * 1024,
    "release_file": 50 * 1024 * 1024,
    "audit_log": 10 * 1024 * 1024,
    "error_report": 20 * 1024 * 1024,
    "admin_export": 25 * 1024 * 1024,
    "rag_document": 20 * 1024 * 1024,
    "embedding_file": 50 * 1024 * 1024,
    "search_index_backup": 50 * 1024 * 1024,
    "prompt_file": 5 * 1024 * 1024,
    "model_file": 50 * 1024 * 1024,
    "training_data": 50 * 1024 * 1024,
    "thumbnail": 2 * 1024 * 1024,
    "subtitle": 2 * 1024 * 1024,
    "translation_file": 5 * 1024 * 1024,
    "legal_document": 10 * 1024 * 1024,
    "qa_artifact": 50 * 1024 * 1024,
    "maintenance_asset": 10 * 1024 * 1024,
    "cache_file": 10 * 1024 * 1024,
    "public_cdn_file": 20 * 1024 * 1024,
    "private_signed_file": 50 * 1024 * 1024,
}

# Kategorien mit strenger Typbindung; alle anderen erlauben gaengige Typen.
STRICT_TYPE_PREFIXES: dict[str, tuple[str, ...]] = {
    "audio": ("audio/",),
    "image": ("image/",),
    "video": ("video/",),
    "profile_image": ("image/jpeg", "image/png", "image/webp", "image/avif"),
    "thumbnail": ("image/jpeg", "image/png", "image/webp", "image/avif"),
    "document": (
        "application/pdf",
        "text/plain",
        "text/markdown",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.",
    ),
}
DEFAULT_TYPE_PREFIXES: tuple[str, ...] = (
    "application/",
    "text/",
    "image/",
    "audio/",
    "video/",
)

UPLOAD_URL_TTL_SECONDS = 600
DOWNLOAD_URL_TTL_SECONDS = 3600
MAX_UPLOADS_TRACKED = 500

CORS_ALLOWED_ORIGINS = [
    "https://smyst.com",
    "https://www.smyst.com",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
]

_CLIENT: Any = None
_CORS_CHECKED = False


class UploadUrlRequest(BaseModel):
    contentType: str = Field(min_length=3, max_length=160)
    filename: str = Field(min_length=1, max_length=180)
    size: int = Field(gt=0, le=50 * 1024 * 1024)
    category: str = Field(min_length=2, max_length=80)
    twinId: str | None = Field(default=None, max_length=160)


class UploadCompleteRequest(BaseModel):
    uploadId: str = Field(min_length=1, max_length=120)
    key: str = Field(min_length=1, max_length=600)
    size: int = Field(gt=0, le=50 * 1024 * 1024)


def _storage_ready() -> bool:
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


def _safe_segment(value: str, max_len: int) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value or "").strip("-.")
    return cleaned[:max_len] or "datei"


def _sub_segment(sub: str) -> str:
    safe = "".join(ch for ch in sub if ch.isalnum() or ch in "-_:")[:160]
    return safe.replace(":", "__")


def _allowed_type(category: str, content_type: str) -> bool:
    lowered = (content_type or "").lower()
    prefixes = STRICT_TYPE_PREFIXES.get(category, DEFAULT_TYPE_PREFIXES)
    return any(lowered == prefix or lowered.startswith(prefix) for prefix in prefixes)


def _ensure_cors() -> None:
    """Setzt die Bucket-CORS-Regel idempotent (einmal pro Prozess).

    Ein Fehler blockiert Uploads nicht (Regel kann bereits manuell gesetzt
    sein); er wird nur geloggt.
    """
    global _CORS_CHECKED
    if _CORS_CHECKED or not _storage_ready():
        return
    try:
        _client().put_bucket_cors(
            Bucket=settings.idrive_e2_bucket,
            CORSConfiguration={
                "CORSRules": [
                    {
                        "AllowedOrigins": CORS_ALLOWED_ORIGINS,
                        "AllowedMethods": ["PUT", "GET", "HEAD"],
                        "AllowedHeaders": ["*"],
                        "ExposeHeaders": ["ETag"],
                        "MaxAgeSeconds": 3600,
                    }
                ]
            },
        )
        logger.info("bucket cors ensured")
    except Exception as exc:
        logger.warning("bucket cors setup failed (%s)", type(exc).__name__)
    _CORS_CHECKED = True


def _require_session(request: Request, detail: str) -> dict[str, Any]:
    session = _session_from_request(request)
    if not session or not str(session.get("sub", "")).strip():
        raise HTTPException(status_code=401, detail=detail)
    return session


def _filename_from_key(key: str, upload_id: str) -> str:
    filename = key.rsplit("/", 1)[-1] if key else "Datei"
    prefix = f"{upload_id}-" if upload_id else ""
    if prefix and filename.startswith(prefix):
        filename = filename[len(prefix) :]
    return filename or "Datei"


@router.get("/capabilities")
async def storage_capabilities() -> dict[str, object]:
    return {
        "configured": _storage_ready(),
        "provider": "idrive_e2",
        "bucket": settings.idrive_e2_bucket,
        "region": settings.idrive_e2_region,
        "maxBytes": CATEGORY_LIMITS,
        "supportsChunkUpload": False,
        "supportsResume": False,
        "publicRead": False,
        "privateSignedFiles": True,
        "uploadUrlStatus": "ready" if _storage_ready() else "not_configured",
    }


@router.get("/uploads")
def list_uploads(
    request: Request,
    category: str | None = None,
    limit: int = 100,
) -> dict[str, object]:
    """Liefert die private Upload-Mediathek des angemeldeten Nutzers.

    Es werden nur kleine, bereits protokollierte Metadaten aus dem
    Nutzerdokument gelesen. Die eigentlichen Dateien bleiben im Object Brain;
    fuer die Vorschau erzeugen wir jeweils eine frische signierte GET-URL.
    """
    session = _require_session(request, "auth_required_for_uploads")
    sub = str(session.get("sub", ""))
    prefix = f"user-uploads/{_sub_segment(sub)}/"
    safe_limit = max(1, min(int(limit or 100), 200))
    try:
        from app.api.v1.routes.user_mvp import _load_doc

        doc = _load_doc(sub)
    except Exception as exc:
        logger.warning("upload metadata load failed (%s)", type(exc).__name__)
        doc = {}
    uploads = doc.get("uploads")
    if not isinstance(uploads, list):
        uploads = []

    items: list[dict[str, object]] = []
    for raw in reversed(uploads):
        if not isinstance(raw, dict):
            continue
        key = str(raw.get("key") or "")
        if not key.startswith(prefix):
            continue
        upload_category = str(raw.get("category") or "")
        if category and upload_category != category:
            continue
        upload_id = str(raw.get("uploadId") or "")
        get_url = ""
        if _storage_ready():
            try:
                get_url = _client().generate_presigned_url(
                    "get_object",
                    Params={"Bucket": settings.idrive_e2_bucket, "Key": key},
                    ExpiresIn=DOWNLOAD_URL_TTL_SECONDS,
                )
            except Exception as exc:
                logger.warning("upload presign failed (%s)", type(exc).__name__)
        items.append(
            {
                "uploadId": upload_id,
                "key": key,
                "name": _filename_from_key(key, upload_id),
                "size": int(raw.get("size") or 0),
                "contentType": str(raw.get("contentType") or ""),
                "category": upload_category,
                "uploadedAt": int(raw.get("uploadedAt") or 0),
                "getUrl": get_url,
                "signedUrlExpiresIn": DOWNLOAD_URL_TTL_SECONDS if get_url else 0,
                "visibility": "private",
                "status": "ready",
            }
        )
        if len(items) >= safe_limit:
            break
    return {
        "ok": True,
        "uploads": items,
        "privateSignedFiles": True,
        "deleteLocked": True,
    }


@router.post("/upload-url")
def create_upload_url(
    request: Request,
    body: UploadUrlRequest,
    x_smyst_csrf: str | None = Header(default=None),
) -> dict[str, object]:
    if x_smyst_csrf != "1":
        raise HTTPException(status_code=403, detail="csrf_required")
    if body.category not in CATEGORY_LIMITS:
        raise HTTPException(status_code=400, detail="unsupported_category")
    if body.size > CATEGORY_LIMITS[body.category]:
        raise HTTPException(status_code=413, detail="file_too_large")
    if not _allowed_type(body.category, body.contentType):
        raise HTTPException(status_code=400, detail="unsupported_content_type")
    session = _require_session(request, "auth_required_for_signed_upload")
    if not _storage_ready():
        raise HTTPException(status_code=503, detail="storage_not_configured")
    _ensure_cors()
    sub_segment = _sub_segment(str(session.get("sub", "")))
    upload_id = uuid.uuid4().hex
    key = (
        f"user-uploads/{sub_segment}/{body.category}/"
        f"{upload_id}-{_safe_segment(body.filename, 120)}"
    )
    try:
        upload_url = _client().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.idrive_e2_bucket,
                "Key": key,
                "ContentType": body.contentType,
            },
            ExpiresIn=UPLOAD_URL_TTL_SECONDS,
        )
        get_url = _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.idrive_e2_bucket, "Key": key},
            ExpiresIn=DOWNLOAD_URL_TTL_SECONDS,
        )
    except Exception as exc:
        logger.warning("presign failed (%s)", type(exc).__name__)
        raise HTTPException(status_code=503, detail="storage_unavailable") from exc
    return {
        "uploadId": upload_id,
        "uploadUrl": upload_url,
        "key": key,
        "getUrl": get_url,
        "expiresAt": int(time.time() * 1000) + UPLOAD_URL_TTL_SECONDS * 1000,
        "contentType": body.contentType,
        "maxBytes": CATEGORY_LIMITS[body.category],
        "category": body.category,
        "supportsChunkUpload": False,
        "supportsResume": False,
    }


@router.post("/upload-complete")
def complete_upload(
    request: Request,
    body: UploadCompleteRequest,
    x_smyst_csrf: str | None = Header(default=None),
) -> dict[str, object]:
    if x_smyst_csrf != "1":
        raise HTTPException(status_code=403, detail="csrf_required")
    session = _require_session(request, "auth_required_for_upload_complete")
    if not _storage_ready():
        raise HTTPException(status_code=503, detail="storage_not_configured")
    sub = str(session.get("sub", ""))
    prefix = f"user-uploads/{_sub_segment(sub)}/"
    if not body.key.startswith(prefix):
        raise HTTPException(status_code=403, detail="key_not_owned")
    try:
        head = _client().head_object(Bucket=settings.idrive_e2_bucket, Key=body.key)
    except Exception as exc:
        raise HTTPException(status_code=409, detail="upload_not_found") from exc
    stored_size = int(head.get("ContentLength", 0))
    if stored_size != body.size:
        raise HTTPException(status_code=409, detail="size_mismatch")
    # Kleine Upload-Metadaten im Nutzerdokument protokollieren (auditierbar).
    try:
        from app.api.v1.routes.user_mvp import _load_doc
        from app.integrations import user_store

        doc = _load_doc(sub)
        uploads = doc.get("uploads")
        if not isinstance(uploads, list):
            uploads = []
        uploads.append(
            {
                "uploadId": body.uploadId,
                "key": body.key,
                "size": stored_size,
                "contentType": head.get("ContentType", ""),
                "category": body.key.split("/")[2] if body.key.count("/") >= 3 else "",
                "uploadedAt": int(time.time() * 1000),
            }
        )
        doc["uploads"] = uploads[-MAX_UPLOADS_TRACKED:]
        user_store.save_user_doc(sub, doc)
    except Exception as exc:
        logger.warning("upload metadata record failed (%s)", type(exc).__name__)
    return {"ok": True, "uploadId": body.uploadId, "key": body.key, "size": stored_size}


@router.delete("/account")
async def delete_account_storage(
    x_smyst_delete_confirm: str | None = Header(default=None),
) -> dict[str, object]:
    if x_smyst_delete_confirm != "delete-account-storage":
        raise HTTPException(status_code=403, detail="delete_confirmation_required")
    raise HTTPException(status_code=401, detail="auth_required_for_storage_delete")
