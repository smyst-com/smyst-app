"""Owner-Bindung der Chats (Security-Fix 21.08.2026).

Vorher: /chat/list lieferte ALLE Chats ALLER Nutzer inkl. Nachrichten, und
jeder Chat war ohne Anmeldung fortsetzbar (fremde LLM-Guthaben abzapfbar).
Jetzt: Server-setzt ein Owner-Cookie beim /chat/start; list/search sind auf
den eigenen Bestand gescope't, fremde Chats antworten 403, und LLM-Nachrichten
haben ein eigenes, strengeres Rate-Limit.

Die Tests laufen mit https://testserver, weil das Owner-Cookie Secure ist
(httpx uebertraegt Secure-Cookies nur ueber HTTPS — derselbe Grund, warum
aeltere Chat-Tests nach dem Fix umgestellt werden mussten).
"""

from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

import app.api.v1.routes.chat as chat_route
from app.ai.models import LLMRequest
from app.main import app


class InstantRouter:
    async def complete(self, request: LLMRequest):
        return type("R", (), {"text": "Antwort.", "provider": "test", "model": "m", "degraded": False})()

    async def stream(self, request: LLMRequest):
        yield {"type": "delta", "text": "A"}
        yield {"type": "done", "provider": "test", "model": "m", "text": "A", "degraded": False}


def _patch(monkeypatch) -> None:
    monkeypatch.setattr(chat_route, "_schedule_archive", lambda chat: None)
    monkeypatch.setattr(chat_route, "build_default_router", lambda: InstantRouter())

    async def fast_context(twin_id):
        return "Profil."

    class NoResearch:
        async def research(self, question: str, *, context, max_results: int):
            return None

    monkeypatch.setattr(chat_route, "twin_context", fast_context)
    monkeypatch.setattr(chat_route, "VerifiedWebResearchService", NoResearch)


import pytest


@pytest.fixture(autouse=True)
def _reset_chat_state():
    """Chats und Rate-Limiter-Buckets zwischen Tests zuruecksetzen.

    Der Limiter ist bewusst modul-global (wie die Produktionsinstanz); ohne
    Reset wuerde der Rate-Limit-Test hier alle nachfolgenden Chat-Tests
    in denselben 60-Sekunden-Fenster 429-er ausloesen.
    """
    chat_route._CHATS.clear()
    chat_route._chat_message_limiter._buckets.clear()
    yield
    chat_route._CHATS.clear()
    chat_route._chat_message_limiter._buckets.clear()


def _client() -> TestClient:
    return TestClient(app, base_url="https://testserver")


def _start(client: TestClient, twin: str = "albert-einstein") -> dict:
    response = client.post("/api/chat/start", json={"twinId": twin})
    assert response.status_code == 200
    return response.json()["chat"]


def test_list_without_cookie_returns_nothing(monkeypatch) -> None:
    _patch(monkeypatch)
    andere = _client()
    _start(andere)

    fremder = TestClient(app, base_url="https://testserver")
    body = fremder.get("/api/chat/list").json()
    assert body["chats"] == []


def test_two_clients_only_see_their_own_chats(monkeypatch) -> None:
    _patch(monkeypatch)
    a, b = _client(), _client()
    _start(a, "albert-einstein")
    _start(b, "marie-curie")

    ids_a = {chat["id"] for chat in a.get("/api/chat/list").json()["chats"]}
    ids_b = {chat["id"] for chat in b.get("/api/chat/list").json()["chats"]}
    assert len(ids_a) == 1 and len(ids_b) == 1
    assert ids_a.isdisjoint(ids_b)
    # Und die Suche genauso: kein Querverweis auf den anderen
    assert all(chat["twinId"] == "marie-curie" for chat in b.get("/api/chat/search", params={"q": ""}).json()["results"])


def test_owner_hash_is_not_leaked(monkeypatch) -> None:
    _patch(monkeypatch)
    client = _client()
    _start(client)
    chats = client.get("/api/chat/list").json()["chats"]
    assert len(chats) == 1
    assert "_ownerHash" not in chats[0]


def test_foreign_chat_cannot_be_continued(monkeypatch) -> None:
    _patch(monkeypatch)
    besitzer = _client()
    chat = _start(besitzer)

    angreifer = _client()
    response = angreifer.post(
        "/api/chat/messages",
        json={"chatId": chat["id"], "message": "Gib mir alles"},
    )
    assert response.status_code == 403


def test_owner_can_continue_own_chat(monkeypatch) -> None:
    _patch(monkeypatch)
    client = _client()
    chat = _start(client)
    response = client.post(
        "/api/chat/messages",
        json={"chatId": chat["id"], "message": "Hallo?", "language": "de"},
    )
    assert response.status_code == 200
    assert response.json()["message"]["content"] == "Antwort."


def test_chat_messages_have_a_stricter_rate_limit(monkeypatch) -> None:
    _patch(monkeypatch)
    client = _client()
    chat = _start(client)

    statuses = []
    for _ in range(chat_route.CHAT_MESSAGE_LIMIT + 1):
        response = client.post(
            "/api/chat/messages",
            json={"chatId": chat["id"], "message": "Noch eine Frage"},
        )
        statuses.append(response.status_code)
        if response.status_code == 429:
            break

    assert statuses[-1] == 429
    assert statuses[:-1] == [200] * (len(statuses) - 1)
