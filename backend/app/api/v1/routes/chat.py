from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.ai.llm_router import build_default_router
from app.ai.models import LLMRequest
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


@router.post("/start")
async def start_chat(body: StartChatRequest) -> dict[str, object]:
    chat_id = str(uuid4())
    title = _title_for_twin(body.twinId)
    _CHATS[chat_id] = {
        "id": chat_id,
        "title": title,
        "twinId": body.twinId,
        "messages": [],
        "createdAt": _now_ms(),
        "updatedAt": _now_ms(),
    }
    return {"chat": {"id": chat_id, "title": title, "twinId": body.twinId}}


@router.post("/messages")
async def send_message(body: SendMessageRequest) -> dict[str, object]:
    chat = _CHATS.setdefault(
        body.chatId,
        {
            "id": body.chatId,
            "title": "Smyst Twin Chat",
            "twinId": None,
            "messages": [],
            "createdAt": _now_ms(),
            "updatedAt": _now_ms(),
        },
    )
    message = normalize_text(body.message, max_length=4000).value
    twin_id = chat.get("twinId")
    system_prompt = (
        "You are Smyst's safe AI-twin chat engine. Answer briefly, helpfully and clearly. "
        "Never claim to be the real historical person; speak as a careful AI profile."
    )
    prompt = (
        f"Twin/profile: {_title_for_twin(twin_id if isinstance(twin_id, str) else None)}\n"
        f"User message: {message}\n"
        "Answer in the same language as the user. Keep it concise."
    )
    llm_response = await build_default_router().complete(
        LLMRequest(prompt=prompt, system_prompt=system_prompt, max_tokens=220, temperature=0.2)
    )
    assistant_message = {
        "id": str(uuid4()),
        "role": "assistant",
        "content": llm_response.text,
        "createdAt": _now_ms(),
    }
    messages = chat.setdefault("messages", [])
    if isinstance(messages, list):
        messages.append(
            {
                "id": str(uuid4()),
                "role": "user",
                "content": message,
                "createdAt": _now_ms(),
            }
        )
        messages.append(assistant_message)
    chat["updatedAt"] = _now_ms()
    return {
        "chatId": body.chatId,
        "twinId": twin_id,
        "message": assistant_message,
        "mode": llm_response.provider,
    }


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
                "archiveObjectKey": "",
                "score": 1,
                "createdAt": chat["createdAt"],
                "updatedAt": chat["updatedAt"],
            }
        )
    return {"query": q, "results": results}
