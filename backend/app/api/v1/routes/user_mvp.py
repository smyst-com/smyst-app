"""User-MVP-Endpunkte: Profil, eigene Twins, Memories, Export, Support.

Diese Routen schliessen die Luecke zwischen Frontend (useTwinMvp.ts) und
Backend: /api/profile, /api/twins, /api/memories, /api/account/export,
DELETE /api/account und /api/support/report.

Privacy by Design:
- Alle Endpunkte wirken ausschliesslich auf das Konto der angemeldeten
  Session (HttpOnly-Cookie) — kein Zugriff auf fremde Daten moeglich.
- Persistenz als ein privates JSON-Dokument pro Nutzer im Object Brain
  (IDrive e2, Prefix user-mvp/), RAM-Cache als Fallback ohne e2-Keys.
- Es wird nie hart geloescht; DELETE /account leert das Dokument und
  schreibt einen Tombstone-Zeitstempel.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.v1.routes.auth import _session_from_request
from app.integrations import user_store

logger = logging.getLogger("smyst.api.user_mvp")

router = APIRouter(tags=["user-mvp"])

TWIN_STYLES = {"warm", "direct", "humorous", "wise", "neutral"}
TWIN_VISIBILITIES = {"private", "public"}
MEMORY_TYPES = {
    "fact", "preference", "goal", "relationship", "project",
    "style", "decision", "warning", "sensitive",
}
MEMORY_STATUSES = {"pending", "confirmed", "edited", "rejected"}
PROFILE_VISIBILITIES = {"private", "shared", "public_snapshot"}
SUPPORT_TYPES = {"bug", "abuse", "privacy", "safety", "feedback"}

MAX_TWINS = 20
MAX_MEMORIES = 500
MAX_KNOWLEDGE_PER_TWIN = 200
MAX_MEDIA_PER_TWIN = 200

STORAGE_NOTE = "Privat im Object Brain (IDrive e2) gespeichert; ohne Speicher-Keys nur fluechtig im RAM."


def _error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"ok": False, "error": {"code": code, "message": message}},
    )


def _now_ms() -> int:
    return int(time.time() * 1000)


def _require_sub(request: Request) -> tuple[str | None, JSONResponse | None]:
    session = _session_from_request(request)
    if not session:
        return None, _error(401, "auth_required", "Bitte melde dich an, um deine Daten zu speichern.")
    sub = str(session.get("sub", "")).strip()
    if not sub:
        return None, _error(401, "auth_required", "Session ohne Nutzerkennung.")
    return sub, None


def _clean_text(value: Any, max_len: int) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:max_len]


def _clean_list(value: Any, max_items: int = 10, max_len: int = 60) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = _clean_text(item, max_len)
        if text and text not in out:
            out.append(text)
        if len(out) >= max_items:
            break
    return out


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or f"twin-{uuid.uuid4().hex[:8]}"


def _default_profile(sub: str) -> dict[str, Any]:
    now = _now_ms()
    return {
        "id": "default",
        "userSub": sub,
        "displayName": "",
        "headline": "",
        "privateBio": "",
        "publicBio": "",
        "roles": [],
        "expertise": [],
        "goals": [],
        "languages": [],
        "tone": "neutral",
        "visibility": "private",
        "qualityScore": 0,
        "memoryCount": 0,
        "chatCount": 0,
        "objectPrefix": user_store.USER_DOC_PREFIX,
        "createdAt": now,
        "updatedAt": now,
    }


def _load_doc(sub: str) -> dict[str, Any]:
    doc = user_store.load_user_doc(sub)
    if not isinstance(doc, dict):
        doc = {}
    doc.setdefault("userSub", sub)
    doc.setdefault("profile", _default_profile(sub))
    doc.setdefault("twins", [])
    doc.setdefault("memories", [])
    doc.setdefault("supportReports", [])
    return doc


def _quality_score(profile: dict[str, Any], memory_count: int) -> int:
    score = 0
    if _clean_text(profile.get("displayName"), 120):
        score += 20
    if _clean_text(profile.get("headline"), 160):
        score += 10
    if _clean_text(profile.get("privateBio"), 4000):
        score += 15
    if _clean_text(profile.get("publicBio"), 4000):
        score += 15
    if profile.get("roles"):
        score += 10
    if profile.get("expertise"):
        score += 10
    if profile.get("goals"):
        score += 5
    if profile.get("languages"):
        score += 5
    score += min(10, memory_count * 2)
    return min(100, score)


def _sync_counts(doc: dict[str, Any]) -> None:
    profile = doc["profile"]
    profile["memoryCount"] = len(doc["memories"])
    profile["qualityScore"] = _quality_score(profile, len(doc["memories"]))


def _find_twin(doc: dict[str, Any], twin_id: str) -> dict[str, Any] | None:
    for twin in doc["twins"]:
        if twin.get("id") == twin_id:
            return twin
    return None


class ProfilePatch(BaseModel):
    displayName: str | None = None
    headline: str | None = None
    privateBio: str | None = None
    publicBio: str | None = None
    roles: list[str] | None = None
    expertise: list[str] | None = None
    goals: list[str] | None = None
    languages: list[str] | None = None
    tone: str | None = None
    visibility: str | None = None


class TwinCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    style: str | None = None
    visibility: str | None = None
    slug: str | None = None
    imageUrl: str | None = None
    imageKey: str | None = None
    categories: list[str] | None = None
    languages: list[str] | None = None


class TwinPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    style: str | None = None
    visibility: str | None = None
    slug: str | None = None
    imageUrl: str | None = None
    imageKey: str | None = None
    categories: list[str] | None = None
    languages: list[str] | None = None


class KnowledgeCreate(BaseModel):
    twinId: str = Field(min_length=1, max_length=80)
    title: str | None = None
    text: str = Field(min_length=1, max_length=8000)


class MediaCreate(BaseModel):
    twinId: str = Field(min_length=1, max_length=80)
    uploadId: str | None = None
    key: str = Field(min_length=1, max_length=400)
    category: str = Field(min_length=1, max_length=60)
    contentType: str | None = None
    filename: str | None = None
    size: int | None = None


class MemoryCreate(BaseModel):
    type: str | None = None
    text: str = Field(min_length=1, max_length=4000)
    sourceType: str | None = None
    chatId: str | None = None
    uploadId: str | None = None
    sourceLabel: str | None = None
    visibility: str | None = None
    sensitivity: str | None = None
    confidence: float | None = None
    status: str | None = None
    twinIds: list[str] | None = None
    reviewAt: int | None = None


class MemoryPatch(BaseModel):
    type: str | None = None
    text: str | None = None
    visibility: str | None = None
    sensitivity: str | None = None
    confidence: float | None = None
    status: str | None = None
    twinIds: list[str] | None = None
    reviewAt: int | None = None


class SupportReport(BaseModel):
    type: str | None = None
    message: str = Field(min_length=1, max_length=4000)
    context: str | None = None


def _apply_profile_patch(profile: dict[str, Any], patch: ProfilePatch) -> None:
    if patch.displayName is not None:
        profile["displayName"] = _clean_text(patch.displayName, 120)
    if patch.headline is not None:
        profile["headline"] = _clean_text(patch.headline, 160)
    if patch.privateBio is not None:
        profile["privateBio"] = _clean_text(patch.privateBio, 4000)
    if patch.publicBio is not None:
        profile["publicBio"] = _clean_text(patch.publicBio, 4000)
    if patch.roles is not None:
        profile["roles"] = _clean_list(patch.roles)
    if patch.expertise is not None:
        profile["expertise"] = _clean_list(patch.expertise)
    if patch.goals is not None:
        profile["goals"] = _clean_list(patch.goals)
    if patch.languages is not None:
        profile["languages"] = _clean_list(patch.languages)
    if patch.tone is not None:
        profile["tone"] = _clean_text(patch.tone, 40) or "neutral"
    if patch.visibility is not None and patch.visibility in PROFILE_VISIBILITIES:
        profile["visibility"] = patch.visibility
    profile["updatedAt"] = _now_ms()


@router.get("/profile")
def get_profile(request: Request) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    _sync_counts(doc)
    return {"profile": doc["profile"], "limits": {"maxTwins": MAX_TWINS, "maxMemories": MAX_MEMORIES}}


@router.patch("/profile")
def patch_profile(request: Request, patch: ProfilePatch) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    _apply_profile_patch(doc["profile"], patch)
    _sync_counts(doc)
    user_store.save_user_doc(sub, doc)
    return {"profile": doc["profile"], "storagePlan": {"note": STORAGE_NOTE}}


@router.get("/twins")
def list_twins(request: Request) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    return {"twins": doc["twins"]}


@router.post("/twins")
def create_twin(request: Request, payload: TwinCreate) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    if len(doc["twins"]) >= MAX_TWINS:
        return _error(409, "twin_limit", f"Maximal {MAX_TWINS} Twins pro Konto.")
    now = _now_ms()
    name = _clean_text(payload.name, 120)
    description = _clean_text(payload.description, 2000)
    base_slug = _slugify(_clean_text(payload.slug, 80) or name)
    slug = base_slug
    existing = {t.get("slug") for t in doc["twins"]}
    counter = 2
    while slug in existing:
        slug = f"{base_slug}-{counter}"
        counter += 1
    twin: dict[str, Any] = {
        "id": f"twin-{uuid.uuid4().hex[:12]}",
        "userSub": sub,
        "name": name,
        "slug": slug,
        "description": description,
        "imageUrl": _clean_text(payload.imageUrl, 400),
        "imageKey": _clean_text(payload.imageKey, 400),
        "categories": _clean_list(payload.categories),
        "languages": _clean_list(payload.languages, max_items=5, max_len=8) or ["de"],
        "visibility": payload.visibility if payload.visibility in TWIN_VISIBILITIES else "private",
        "style": payload.style if payload.style in TWIN_STYLES else "neutral",
        "knowledgeTexts": [],
        "mediaRefs": [],
        "contextSummary": description[:400],
        "status": "ready" if name and description else "draft",
        "createdAt": now,
        "updatedAt": now,
    }
    doc["twins"].append(twin)
    user_store.save_user_doc(sub, doc)
    return {"twin": twin}


@router.get("/twins/{twin_id}")
def get_twin(request: Request, twin_id: str) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    twin = _find_twin(doc, twin_id)
    if not twin:
        return _error(404, "twin_not_found", "Twin nicht gefunden.")
    return {"twin": twin}


@router.patch("/twins/{twin_id}")
def patch_twin(request: Request, twin_id: str, patch: TwinPatch) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    twin = _find_twin(doc, twin_id)
    if not twin:
        return _error(404, "twin_not_found", "Twin nicht gefunden.")
    if patch.name is not None:
        twin["name"] = _clean_text(patch.name, 120) or twin["name"]
    if patch.description is not None:
        twin["description"] = _clean_text(patch.description, 2000)
        twin["contextSummary"] = twin["description"][:400]
    if patch.style is not None and patch.style in TWIN_STYLES:
        twin["style"] = patch.style
    if patch.visibility is not None and patch.visibility in TWIN_VISIBILITIES:
        twin["visibility"] = patch.visibility
    if patch.slug is not None:
        twin["slug"] = _slugify(_clean_text(patch.slug, 80) or twin["name"])
    if patch.imageUrl is not None:
        twin["imageUrl"] = _clean_text(patch.imageUrl, 400)
    if patch.imageKey is not None:
        twin["imageKey"] = _clean_text(patch.imageKey, 400)
    if patch.categories is not None:
        twin["categories"] = _clean_list(patch.categories)
    if patch.languages is not None:
        twin["languages"] = _clean_list(patch.languages, max_items=5, max_len=8) or twin["languages"]
    twin["status"] = "ready" if twin["name"] and twin["description"] else "draft"
    twin["updatedAt"] = _now_ms()
    user_store.save_user_doc(sub, doc)
    return {"twin": twin}


@router.post("/twins/knowledge")
def add_knowledge(request: Request, payload: KnowledgeCreate) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    twin = _find_twin(doc, payload.twinId)
    if not twin:
        return _error(404, "twin_not_found", "Twin nicht gefunden.")
    if len(twin["knowledgeTexts"]) >= MAX_KNOWLEDGE_PER_TWIN:
        return _error(409, "knowledge_limit", "Wissenslimit fuer diesen Twin erreicht.")
    item = {
        "id": f"know-{uuid.uuid4().hex[:12]}",
        "title": _clean_text(payload.title, 160),
        "text": _clean_text(payload.text, 8000),
        "createdAt": _now_ms(),
    }
    twin["knowledgeTexts"].append(item)
    twin["updatedAt"] = _now_ms()
    user_store.save_user_doc(sub, doc)
    return {"twin": twin, "item": item}


@router.post("/twins/media")
def add_media(request: Request, payload: MediaCreate) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    twin = _find_twin(doc, payload.twinId)
    if not twin:
        return _error(404, "twin_not_found", "Twin nicht gefunden.")
    if len(twin["mediaRefs"]) >= MAX_MEDIA_PER_TWIN:
        return _error(409, "media_limit", "Medienlimit fuer diesen Twin erreicht.")
    media = {
        "id": f"media-{uuid.uuid4().hex[:12]}",
        "uploadId": _clean_text(payload.uploadId, 120),
        "key": _clean_text(payload.key, 400),
        "category": _clean_text(payload.category, 60),
        "contentType": _clean_text(payload.contentType, 120),
        "filename": _clean_text(payload.filename, 200),
        "size": int(payload.size or 0),
        "createdAt": _now_ms(),
    }
    twin["mediaRefs"].append(media)
    twin["updatedAt"] = _now_ms()
    user_store.save_user_doc(sub, doc)
    return {"twin": twin, "media": media}


@router.get("/memories")
def list_memories(request: Request, status: str | None = None, twinId: str | None = None) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    memories = doc["memories"]
    if status and status in MEMORY_STATUSES:
        memories = [m for m in memories if m.get("status") == status]
    if twinId:
        memories = [m for m in memories if twinId in (m.get("twinIds") or [])]
    return {"memories": memories, "limits": {"maxMemories": MAX_MEMORIES}}


@router.post("/memories")
def create_memory(request: Request, payload: MemoryCreate) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    if len(doc["memories"]) >= MAX_MEMORIES:
        return _error(409, "memory_limit", f"Maximal {MAX_MEMORIES} Memories pro Konto.")
    now = _now_ms()
    memory = {
        "id": f"mem-{uuid.uuid4().hex[:12]}",
        "userSub": sub,
        "profileId": "default",
        "type": payload.type if payload.type in MEMORY_TYPES else "fact",
        "text": _clean_text(payload.text, 4000),
        "source": {
            "type": payload.sourceType if payload.sourceType in {"chat", "upload", "profile", "manual"} else "manual",
            "chatId": _clean_text(payload.chatId, 120),
            "uploadId": _clean_text(payload.uploadId, 120),
            "label": _clean_text(payload.sourceLabel, 200),
        },
        "visibility": payload.visibility if payload.visibility in PROFILE_VISIBILITIES else "private",
        "sensitivity": payload.sensitivity if payload.sensitivity in {"normal", "personal", "sensitive"} else "normal",
        "confidence": max(0.0, min(1.0, float(payload.confidence if payload.confidence is not None else 0.8))),
        "status": payload.status if payload.status in MEMORY_STATUSES else "confirmed",
        "twinIds": _clean_list(payload.twinIds, max_items=MAX_TWINS, max_len=80),
        "reviewAt": int(payload.reviewAt or 0),
        "objectKey": "",
        "createdAt": now,
        "updatedAt": now,
    }
    doc["memories"].append(memory)
    _sync_counts(doc)
    user_store.save_user_doc(sub, doc)
    return {"memory": memory}


@router.patch("/memories/{memory_id}")
def patch_memory(request: Request, memory_id: str, patch: MemoryPatch) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    memory = next((m for m in doc["memories"] if m.get("id") == memory_id), None)
    if not memory:
        return _error(404, "memory_not_found", "Memory nicht gefunden.")
    if patch.type is not None and patch.type in MEMORY_TYPES:
        memory["type"] = patch.type
    if patch.text is not None:
        memory["text"] = _clean_text(patch.text, 4000) or memory["text"]
    if patch.visibility is not None and patch.visibility in PROFILE_VISIBILITIES:
        memory["visibility"] = patch.visibility
    if patch.sensitivity is not None and patch.sensitivity in {"normal", "personal", "sensitive"}:
        memory["sensitivity"] = patch.sensitivity
    if patch.confidence is not None:
        memory["confidence"] = max(0.0, min(1.0, float(patch.confidence)))
    if patch.status is not None and patch.status in MEMORY_STATUSES:
        memory["status"] = patch.status
    if patch.twinIds is not None:
        memory["twinIds"] = _clean_list(patch.twinIds, max_items=MAX_TWINS, max_len=80)
    if patch.reviewAt is not None:
        memory["reviewAt"] = int(patch.reviewAt)
    memory["updatedAt"] = _now_ms()
    _sync_counts(doc)
    user_store.save_user_doc(sub, doc)
    return {"memory": memory}


@router.delete("/memories/{memory_id}")
def delete_memory(request: Request, memory_id: str) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    before = len(doc["memories"])
    doc["memories"] = [m for m in doc["memories"] if m.get("id") != memory_id]
    if len(doc["memories"]) == before:
        return _error(404, "memory_not_found", "Memory nicht gefunden.")
    _sync_counts(doc)
    user_store.save_user_doc(sub, doc)
    return {"ok": True}


@router.get("/account/export")
def export_account(request: Request) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    session = _session_from_request(request) or {}
    doc = _load_doc(sub)
    _sync_counts(doc)
    return {
        "ok": True,
        "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "storageNote": STORAGE_NOTE,
        "user": {
            "sub": sub,
            "email": session.get("email"),
            "name": session.get("name"),
        },
        "profile": doc["profile"],
        "memories": doc["memories"],
        "twins": doc["twins"],
        "chats": [],
        "objectLayout": {
            "profile": user_store.USER_DOC_PREFIX,
            "chatArchives": [],
            "memories": [],
        },
    }


@router.delete("/account")
def delete_account_data(request: Request) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    deleted = {
        "twins": len(doc["twins"]),
        "memories": len(doc["memories"]),
        "profile": 1,
    }
    now = _now_ms()
    empty = {
        "userSub": sub,
        "profile": _default_profile(sub),
        "twins": [],
        "memories": [],
        "supportReports": doc.get("supportReports", []),
        "deletedAt": now,
    }
    user_store.save_user_doc(sub, empty)
    user_store.delete_user_doc_from_cache(sub)
    logger.info("user data reset for sub type %s", sub.split(":", 1)[0] or "unknown")
    return {"ok": True, "deleted": deleted, "storageNote": STORAGE_NOTE}


@router.post("/support/report")
def support_report(request: Request, payload: SupportReport) -> Any:
    sub, err = _require_sub(request)
    if err:
        return err
    doc = _load_doc(sub)
    report = {
        "id": f"report-{uuid.uuid4().hex[:12]}",
        "type": payload.type if payload.type in SUPPORT_TYPES else "feedback",
        "message": _clean_text(payload.message, 4000),
        "context": _clean_text(payload.context, 400),
        "createdAt": _now_ms(),
    }
    doc["supportReports"] = (doc.get("supportReports") or [])[-49:] + [report]
    user_store.save_user_doc(sub, doc)
    return {"ok": True, "reportId": report["id"], "message": "Danke, dein Bericht ist eingegangen."}

