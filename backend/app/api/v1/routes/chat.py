from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import AsyncIterator
from uuid import uuid4

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.ai.llm_router import build_default_router
from app.ai.models import LLMRequest
from app.ai.twin_context import twin_context
from app.integrations import chat_store
from app.security.sanitization import normalize_text

router = APIRouter(prefix="/chat", tags=["chat"])

_CHATS: dict[str, dict[str, object]] = {}


class StartChatRequest(BaseModel):
    twinId: str | None = Field(default=None, max_length=160)


class SendMessageRequest(BaseModel):
    chatId: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=4000)


def _now_ms() -> int:
    return int(datetime.now(UTC).timestamp() * 1000)


def _title_for_twin(twin_id: str | None) -> str:
    if not twin_id:
        return "Smyst Twin Chat"
    return twin_id.replace("-", " ").replace("_", " ").title()


async def _ensure_chat(chat_id: str) -> dict[str, object]:
    """Chat aus RAM holen; sonst aus dem IDrive-e2-Archiv wiederherstellen
    (Chats ueberleben so Container-Neustarts); sonst neu anlegen."""
    chat = _CHATS.get(chat_id)
    if chat is not None:
        return chat
    restored = await asyncio.to_thread(chat_store.load_chat, chat_id)
    if restored is not None:
        _CHATS[chat_id] = restored
        return restored
    created: dict[str, object] = {
        "id": chat_id,
        "title": "Smyst Twin Chat",
        "twinId": None,
        "messages": [],
        "createdAt": _now_ms(),
        "updatedAt": _now_ms(),
    }
    _CHATS[chat_id] = created
    return created


def _schedule_archive(chat: dict[str, object]) -> None:
    """Archiv-Schreiben nach IDrive e2, fire-and-forget. Wirft nie."""
    try:
        snapshot = {**chat, "messages": list(chat.get("messages") or [])}
        loop = asyncio.get_running_loop()
        loop.create_task(asyncio.to_thread(chat_store.archive_chat, snapshot))
    except Exception:
        pass


async def _build_llm_request(chat: dict[str, object], message: str) -> LLMRequest:
    twin_id = chat.get("twinId")
    context = await twin_context(twin_id if isinstance(twin_id, str) else None)
    system_prompt = (
        "You are the AI twin of the named profile on smyst.com. Always answer in the first "
        "person, in the persona's voice, tone and perspective. Never speak about the persona "
        "in the third person. You are a transparent AI twin, not the real person: never claim "
        "real-time experiences, and acknowledge being an AI twin if asked directly. Answer "
        "briefly, helpfully and clearly."
    )
    context_block = f"Curated public profile knowledge:\n{context}\n" if context else ""
    prompt = (
        f"Twin/profile: {_title_for_twin(twin_id if isinstance(twin_id, str) else None)}\n"
        + context_block
        + f"User message: {message}\n"
        "Answer in the same language as the user. Keep it concise."
    )
    return LLMRequest(prompt=prompt, system_prompt=system_prompt, max_tokens=220, temperature=0.2)


def _persist_exchange(
    chat: dict[str, object], user_text: str, assistant_message: dict[str, object]
) -> None:
    messages = chat.setdefault("messages", [])
    if isinstance(messages, list):
        messages.append(
            {
                "id": str(uuid4()),
                "role": "user",
                "content": user_text,
                "createdAt": _now_ms(),
            }
        )
        messages.append(assistant_message)
    chat["updatedAt"] = _now_ms()
    _schedule_archive(chat)


@router.post("/start")
async def start_chat(body: StartChatRequest) -> dict[str, object]:
    chat_id = str(uuid4())
    title = _title_for_twin(body.twinId)
    chat: dict[str, object] = {
        "id": chat_id,
        "title": title,
        "twinId": body.twinId,
        "messages": [],
        "createdAt": _now_ms(),
        "updatedAt": _now_ms(),
    }
    _CHATS[chat_id] = chat
    _schedule_archive(chat)
    return {"chat": {"id": chat_id, "title": title, "twinId": body.twinId}}


@router.post("/messages")
async def send_message(body: SendMessageRequest) -> dict[str, object]:
    chat = await _ensure_chat(body.chatId)
    message = normalize_text(body.message, max_length=4000).value
    llm_request = await _build_llm_request(chat, message)
    llm_response = await build_default_router().complete(llm_request)
    assistant_message = {
        "id": str(uuid4()),
        "role": "assistant",
        "content": llm_response.text,
        "createdAt": _now_ms(),
    }
    _persist_exchange(chat, message, assistant_message)
    return {
        "chatId": body.chatId,
        "twinId": chat.get("twinId"),
        "message": assistant_message,
        "mode": llm_response.provider,
    }


@router.post("/messages/stream")
async def send_message_stream(body: SendMessageRequest) -> StreamingResponse:
    """SSE-Variante von /messages: streamt Antwort-Deltas, dann ein done-Event.

    Event-Format (jeweils eine `data:`-Zeile mit JSON):
    - {"delta": "..."}  Text-Fragment
    - {"done": true, "chatId": ..., "twinId": ..., "message": {...}, "mode": ...}
    - {"error": true}   Stream abgebrochen; Client faellt auf /messages zurueck
    """
    chat = await _ensure_chat(body.chatId)
    message = normalize_text(body.message, max_length=4000).value
    llm_router = build_default_router()
    request = await _build_llm_request(chat, message)

    def _sse(payload: dict[str, object]) -> str:
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    async def event_source() -> AsyncIterator[str]:
        try:
            async for event in llm_router.stream(request):
                if event.get("type") == "delta":
                    yield _sse({"delta": event.get("text", "")})
                elif event.get("type") == "done":
                    assistant_message = {
                        "id": str(uuid4()),
                        "role": "assistant",
                        "content": event.get("text", ""),
                        "createdAt": _now_ms(),
                    }
                    _persist_exchange(chat, message, assistant_message)
                    yield _sse(
                        {
                            "done": True,
                            "chatId": body.chatId,
                            "twinId": chat.get("twinId"),
                            "message": assistant_message,
                            "mode": event.get("provider", "unknown"),
                        }
                    )
                    return
                else:
                    yield _sse({"error": True})
                    return
            yield _sse({"error": True})
        except Exception:
            yield _sse({"error": True})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/list")
async def list_chats() -> dict[str, object]:
    return {"chats": list(_CHATS.values())}


@router.get("/search")
async def search_chats(q: str = "", twinId: str | None = None) -> dict[str, object]:
    query = q.strip().lower()
    results = []
    for chat in _CHATS.values():
        if twinId and chat.get("twinId") != twinId:
            continue
        text = " ".join(
            item.get("content", "")
            for item in chat.get("messages", [])
            if isinstance(item, dict)
        ).lower()
        if query and query not in text:
            continue
        results.append(
            {
                "id": chat["id"],
                "title": chat["title"],
                "twinId": chat.get("twinId"),
                "publicTwinSlug": chat.get("twinId"),
                "summary": text[:240],
                "messageCount": len(chat.get("messages", [])),
                "archiveObjectKey": chat_store.CHAT_ARCHIVE_PREFIX + str(chat["id"]) + ".json",
                "score": 1,
                "createdAt": chat["createdAt"],
                "updatedAt": chat["updatedAt"],
            }
        )
    return {"query": q, "results": results}
