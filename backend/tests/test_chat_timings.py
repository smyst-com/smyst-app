"""Der Chat-Stream weist aus, wo die Zeit bis zum ersten Wort hingeht.

Von aussen war nur die Summe messbar (~450 ms, US-Messung 16.08.2026). Ohne die
Anteile optimiert man auf Verdacht — genau so entstand #408, das nichts brachte.
"""

from __future__ import annotations

import asyncio
import json

from fastapi.testclient import TestClient

import app.api.v1.routes.chat as chat_route
from app.ai.models import LLMRequest
from app.main import app

CONTEXT_DELAY = 0.10
RESEARCH_DELAY = 0.25
MODEL_DELAY = 0.15


class SlowStreamingRouter:
    async def stream(self, request: LLMRequest):
        await asyncio.sleep(MODEL_DELAY)
        yield {"type": "delta", "text": "Hallo"}
        yield {
            "type": "done",
            "provider": "test",
            "model": "test-model",
            "text": "Hallo",
            "degraded": False,
        }


def _patch(monkeypatch) -> None:
    monkeypatch.setattr(chat_route, "_schedule_archive", lambda chat: None)
    monkeypatch.setattr(chat_route, "build_default_router", lambda: SlowStreamingRouter())

    async def slow_context(twin_id):
        await asyncio.sleep(CONTEXT_DELAY)
        return "Kuratiertes Profilwissen."

    class SlowResearch:
        async def research(self, question: str, *, context, max_results: int):
            await asyncio.sleep(RESEARCH_DELAY)

    monkeypatch.setattr(chat_route, "twin_context", slow_context)
    monkeypatch.setattr(chat_route, "VerifiedWebResearchService", SlowResearch)


def setup_function() -> None:
    chat_route._CHATS.clear()


def _done_event(monkeypatch) -> dict:
    _patch(monkeypatch)
    client = TestClient(app)
    chat = client.post("/api/chat/start", json={"twinId": "t"}).json()["chat"]
    response = client.post(
        "/api/chat/messages/stream",
        json={"chatId": chat["id"], "message": "Hallo!"},
    )
    assert response.status_code == 200
    for block in response.text.split("\n\n"):
        line = next((ln for ln in block.split("\n") if ln.startswith("data:")), None)
        if not line:
            continue
        event = json.loads(line[5:])
        if event.get("done"):
            return event
    raise AssertionError("kein done-Event im Stream")


def test_done_event_reports_the_three_shares(monkeypatch) -> None:
    timings = _done_event(monkeypatch)["timings"]

    ms = 1000
    # Grosszuegige Grenzen: geprueft wird die Zuordnung, nicht die Uhr.
    assert CONTEXT_DELAY * ms <= timings["twinContextMs"] < RESEARCH_DELAY * ms
    assert timings["webResearchMs"] >= RESEARCH_DELAY * ms
    assert timings["modelFirstTokenMs"] >= MODEL_DELAY * ms
    assert timings["totalMs"] >= (RESEARCH_DELAY + MODEL_DELAY) * ms


def test_preparation_is_the_longer_share_not_the_sum(monkeypatch) -> None:
    """Twin-Kontext und Recherche laufen parallel — die Summe waere falsch."""
    timings = _done_event(monkeypatch)["timings"]

    assert timings["preparationMs"] == max(
        timings["twinContextMs"], timings["webResearchMs"]
    )
    assert timings["preparationMs"] < timings["twinContextMs"] + timings["webResearchMs"]


def test_timings_do_not_disturb_the_event_protocol(monkeypatch) -> None:
    event = _done_event(monkeypatch)

    assert event["done"] is True
    assert event["message"]["content"] == "Hallo"
    assert event["mode"] == "test"
