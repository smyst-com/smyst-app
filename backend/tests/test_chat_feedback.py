"""Tests fuer Baustein 3: Nutzerfeedback zu Chat-Antworten (/api/chat/feedback)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.ai.models import LLMRequest, LLMResponse
import app.api.v1.routes.chat as chat_route
from app.main import app


class StubRouter:
    async def complete(self, request: LLMRequest) -> LLMResponse:
        return LLMResponse(
            text="Ich bin das KI-Profil und antworte in der ersten Person.",
            provider="test",
            model="test-model",
            input_tokens=1,
            output_tokens=1,
            latency_ms=1,
        )


class NoResearch:
    async def research(self, question: str, *, context, max_results: int):
        return None


def setup_function() -> None:
    chat_route._CHATS.clear()


def _chat_with_answer(monkeypatch) -> tuple[TestClient, str, str]:
    monkeypatch.setattr(chat_route, "_schedule_archive", lambda chat: None)
    monkeypatch.setattr(chat_route, "build_default_router", lambda: StubRouter())
    monkeypatch.setattr(chat_route, "VerifiedWebResearchService", NoResearch)
    client = TestClient(app, base_url="https://testserver")
    chat = client.post("/api/chat/start", json={"twinId": "mata-hari"}).json()["chat"]
    reply = client.post(
        "/api/chat/messages",
        json={"chatId": chat["id"], "message": "Wer bist du?"},
    ).json()
    return client, chat["id"], reply["message"]["id"]


def test_feedback_is_stored_on_message_and_forwarded_to_store(monkeypatch) -> None:
    client, chat_id, message_id = _chat_with_answer(monkeypatch)
    saved: list[dict] = []
    monkeypatch.setattr(chat_route.feedback_store, "save_feedback", saved.append)

    response = client.post(
        "/api/chat/feedback",
        json={
            "chatId": chat_id,
            "messageId": message_id,
            "rating": "down",
            "comment": "Antwort war ausweichend.",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True, "messageId": message_id, "rating": "down"}
    message = next(
        m for m in chat_route._CHATS[chat_id]["messages"] if m["id"] == message_id
    )
    assert message["feedback"]["rating"] == "down"
    assert message["feedback"]["comment"] == "Antwort war ausweichend."
    assert len(saved) == 1
    record = saved[0]
    assert record["twinId"] == "mata-hari"
    assert record["question"] == "Wer bist du?"
    assert record["answer"].startswith("Ich bin das KI-Profil")
    assert record["rating"] == "down"


def test_feedback_up_needs_no_comment(monkeypatch) -> None:
    client, chat_id, message_id = _chat_with_answer(monkeypatch)
    monkeypatch.setattr(chat_route.feedback_store, "save_feedback", lambda record: True)

    response = client.post(
        "/api/chat/feedback",
        json={"chatId": chat_id, "messageId": message_id, "rating": "up"},
    )

    assert response.status_code == 200
    message = next(
        m for m in chat_route._CHATS[chat_id]["messages"] if m["id"] == message_id
    )
    assert message["feedback"]["rating"] == "up"
    assert message["feedback"]["comment"] is None


def test_feedback_rejects_unknown_message_and_user_messages(monkeypatch) -> None:
    client, chat_id, message_id = _chat_with_answer(monkeypatch)
    monkeypatch.setattr(chat_route.feedback_store, "save_feedback", lambda record: True)

    unknown = client.post(
        "/api/chat/feedback",
        json={"chatId": chat_id, "messageId": "gibt-es-nicht", "rating": "up"},
    )
    assert unknown.status_code == 404

    user_message = next(
        m for m in chat_route._CHATS[chat_id]["messages"] if m["role"] == "user"
    )
    on_user = client.post(
        "/api/chat/feedback",
        json={"chatId": chat_id, "messageId": user_message["id"], "rating": "up"},
    )
    assert on_user.status_code == 404

    bad_rating = client.post(
        "/api/chat/feedback",
        json={"chatId": chat_id, "messageId": message_id, "rating": "great"},
    )
    assert bad_rating.status_code == 422
