"""Absichern, dass der Chat-Stream sofort startet und die Vorarbeit parallel laeuft.

Hintergrund (14.08.2026): Twin-Kontext und Web-Recherche liefen nacheinander in
der Handler-Funktion, also VOR der StreamingResponse. Gemessen kamen dadurch
9,8s lang keine Bytes, danach die komplette Antwort in 0,5s — das Streaming war
faktisch wirkungslos. Diese Tests halten beide Eigenschaften fest.
"""

from __future__ import annotations

import asyncio
import json
import time

from fastapi.testclient import TestClient

import app.api.v1.routes.chat as chat_route
from app.ai.models import LLMRequest
from app.main import app

SLOW = 0.25
"""Kunstliche Dauer je Vorarbeit; lang genug, um Reihenfolge messbar zu machen."""


class StreamingRouter:
    async def stream(self, request: LLMRequest):
        yield {"type": "delta", "text": "Hallo"}
        yield {
            "type": "done",
            "provider": "test",
            "model": "test-model",
            "text": "Hallo",
            "degraded": False,
        }


class Intervals:
    """Sammelt Start/Ende der beiden Vorarbeiten, um Ueberlappung zu pruefen."""

    def __init__(self) -> None:
        self.spans: dict[str, tuple[float, float]] = {}

    async def track(self, name: str):
        start = time.perf_counter()
        await asyncio.sleep(SLOW)
        self.spans[name] = (start, time.perf_counter())

    def overlap(self) -> float:
        (a_start, a_end), (b_start, b_end) = self.spans["context"], self.spans["research"]
        return min(a_end, b_end) - max(a_start, b_start)


def _patch(monkeypatch, intervals: Intervals) -> None:
    monkeypatch.setattr(chat_route, "_schedule_archive", lambda chat: None)
    monkeypatch.setattr(chat_route, "build_default_router", lambda: StreamingRouter())

    async def slow_context(twin_id):
        await intervals.track("context")
        return "Kuratiertes Profilwissen."

    class SlowResearch:
        async def research(self, question: str, *, context, max_results: int):
            # Liefert wie das Original None, wenn es keine Treffer gibt.
            await intervals.track("research")

    monkeypatch.setattr(chat_route, "twin_context", slow_context)
    monkeypatch.setattr(chat_route, "VerifiedWebResearchService", SlowResearch)


def setup_function() -> None:
    chat_route._CHATS.clear()


def test_twin_context_and_web_research_run_concurrently(monkeypatch) -> None:
    """Beide Vorarbeiten sind unabhaengig — sie muessen sich zeitlich ueberlappen."""
    intervals = Intervals()
    _patch(monkeypatch, intervals)
    client = TestClient(app, base_url="https://testserver")
    chat = client.post("/api/chat/start", json={"twinId": "t"}).json()["chat"]

    started = time.perf_counter()
    response = client.post(
        "/api/chat/messages/stream",
        json={"chatId": chat["id"], "message": "Hallo!"},
    )
    elapsed = time.perf_counter() - started

    assert response.status_code == 200
    # Nacheinander waeren es 2 * SLOW; parallel zaehlt nur die laengere Vorarbeit.
    assert elapsed < SLOW * 1.8, f"Vorarbeit lief seriell ({elapsed:.2f}s)"
    assert intervals.overlap() > SLOW * 0.5, "Vorarbeiten ueberlappten sich nicht"


def test_stream_flushes_before_slow_preparation(monkeypatch) -> None:
    """Das erste Byte darf nicht auf Twin-Kontext und Recherche warten.

    Gemessen wird direkt an der ASGI-Schnittstelle: der TestClient puffert die
    Antwort, dort waere der fruehe Flush nicht sichtbar.
    """
    intervals = Intervals()
    _patch(monkeypatch, intervals)
    client = TestClient(app, base_url="https://testserver")
    client.post("/api/chat/start", json={"twinId": "t"})
    chat = client.get("/api/chat/list").json()["chats"][0]

    body = json.dumps({"chatId": chat["id"], "message": "Hallo!"}).encode()
    # Der Chat ist seit dem Owner-Fix (21.08.) an das Start-Cookie gebunden;
    # die raw-ASGI-Anfrage unten muss dasselbe Cookie mitbringen.
    owner_token = client.cookies.get("smyst_chat_owner", "")
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.1"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/chat/messages/stream",
        "raw_path": b"/api/chat/messages/stream",
        "query_string": b"",
        "root_path": "",
        "headers": [
            (b"host", b"testserver"),
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode()),
            (b"cookie", f"smyst_chat_owner={owner_token}".encode()),
        ],
        "client": ("testclient", 123),
        "server": ("testserver", 80),
    }
    sent: list[tuple[float, dict]] = []

    delivered = False

    async def receive():
        # Die Middleware-Kette ruft receive() mehrfach; der Body darf nur einmal
        # kommen, danach blockieren wir (der Task wird am Ende abgeraeumt).
        nonlocal delivered
        if not delivered:
            delivered = True
            return {"type": "http.request", "body": body, "more_body": False}
        await asyncio.sleep(3600)
        return {"type": "http.disconnect"}

    async def send(event):
        sent.append((time.perf_counter(), event))

    async def drive():
        started = time.perf_counter()
        await app(scope, receive, send)
        return started

    started = asyncio.run(drive())

    bodies = [(at, ev) for at, ev in sent if ev["type"] == "http.response.body"]
    first_at, first_event = bodies[0]
    first_byte_after = first_at - started

    assert first_byte_after < SLOW, f"Erstes Byte kam erst nach {first_byte_after:.2f}s"
    # SSE-Kommentar: keine "data:"-Zeile, der Client-Parser ueberspringt ihn.
    assert first_event["body"].startswith(b":")


def test_stream_still_delivers_delta_and_done(monkeypatch) -> None:
    """Der Umbau darf das Event-Protokoll nicht veraendern."""
    intervals = Intervals()
    _patch(monkeypatch, intervals)
    client = TestClient(app, base_url="https://testserver")
    chat = client.post("/api/chat/start", json={"twinId": "t"}).json()["chat"]

    response = client.post(
        "/api/chat/messages/stream",
        json={"chatId": chat["id"], "message": "Hallo!"},
    )

    body = response.text
    assert '"delta": "Hallo"' in body
    assert '"done": true' in body
