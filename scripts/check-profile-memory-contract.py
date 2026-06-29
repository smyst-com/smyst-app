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
    require_text("backend/app/main.py", [
        "FastAPI",
        "CORSMiddleware",
    ])
    require_text("backend/app/api/v1/router.py", [
        "api_router",
        "include_router",
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
        "Profilqualität",
    ])
    require_text("docs/03-api-architecture.md", [
        "IDrive e2",
        "Salad",
        "/api/memories",
        "/api/chat/search",
    ])
    print("profile memory contract validation passed")


if __name__ == "__main__":
    main()
