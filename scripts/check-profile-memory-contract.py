#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    raise SystemExit(f"FAILED profile memory contract check: {message}")


def require_text(path: str, terms: list[str]) -> None:
    content = (ROOT / path).read_text(encoding="utf-8")
    missing = [term for term in terms if term not in content]
    if missing:
        fail(f"{path} missing required terms: {', '.join(missing)}")


def main() -> None:
    require_text("workers/auth-github.ts", [
        "profile:write",
        "ROLE_PERMISSIONS",
    ])
    require_text("workers/api.ts", [
        "handleGetProfile",
        "handleUpdateProfile",
        "handleListMemories",
        "handleCreateMemory",
        "handleUpdateMemory",
        "handleDeleteMemory",
        "handleSearchChats",
        "persistManagedObject",
        "deleteManagedObject",
        "/storage/object",
        "chatArchiveObjectKey",
        "memoryObjectKey",
        "profileObjectKey",
        "hasProfileWritePermission",
    ])
    require_text("workers/storage-idrive.ts", [
        "handlePutManagedObject",
        "handleGetManagedObject",
        "handleDeleteManagedObject",
        "PUT /storage/object",
        "GET /storage/object",
        "DELETE /storage/object",
        "isManagedObjectKey",
        "putObjectToIdrive",
        "getObjectFromIdrive",
        "delete-object",
    ])
    require_text("src/lib/useTwinMvp.ts", [
        "getProfile",
        "updateProfile",
        "listMemories",
        "createMemory",
        "updateMemory",
        "deleteMemory",
        "searchTwinChats",
    ])
    require_text("src/App.tsx", [
        "Profil speichern",
        "Memory speichern",
        "Chatverlauf suchen",
        "Profilqualitaet",
    ])
    require_text("docs/03-api-architecture.md", [
        "PUT /storage/object",
        "/api/memories",
        "/api/chat/search",
        "IDrive e2",
    ])
    require_text("docs/FREE_ONLY_PROFILE_MEMORY_AI_PLAN.md", [
        "GitHub.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden",
        "Cloudflare.com darf nur im dauerhaft kostenlosen Free-Tarif genutzt werden",
        "IDrive e2 / S3-kompatibler Storage ist der zentrale Hauptspeicher",
        "Phase 1 trainiert keine eigenen Modelle",
    ])
    print("profile memory contract validation passed")


if __name__ == "__main__":
    main()
