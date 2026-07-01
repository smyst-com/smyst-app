from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings

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
        "uploadUrlStatus": "auth_required",
    }


@router.post("/upload-url")
async def create_upload_url(
    body: UploadUrlRequest,
    x_smyst_csrf: str | None = Header(default=None),
) -> dict[str, object]:
    if x_smyst_csrf != "1":
        raise HTTPException(status_code=403, detail="csrf_required")
    if body.category not in CATEGORY_LIMITS:
        raise HTTPException(status_code=400, detail="unsupported_category")
    if body.size > CATEGORY_LIMITS[body.category]:
        raise HTTPException(status_code=413, detail="file_too_large")
    raise HTTPException(status_code=401, detail="auth_required_for_signed_upload")


@router.post("/upload-complete")
async def complete_upload(
    body: UploadCompleteRequest,
    x_smyst_csrf: str | None = Header(default=None),
) -> dict[str, object]:
    if x_smyst_csrf != "1":
        raise HTTPException(status_code=403, detail="csrf_required")
    raise HTTPException(status_code=401, detail="auth_required_for_upload_complete")


@router.delete("/account")
async def delete_account_storage(
    x_smyst_delete_confirm: str | None = Header(default=None),
) -> dict[str, object]:
    if x_smyst_delete_confirm != "delete-account-storage":
        raise HTTPException(status_code=403, detail="delete_confirmation_required")
    raise HTTPException(status_code=401, detail="auth_required_for_storage_delete")
