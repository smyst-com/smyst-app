from __future__ import annotations

import httpx
import pytest

from app.ai.llm_router import (
    LLMProvider,
    LLMRouter,
    LocalDeterministicProvider,
    OpenAICompatibleProvider,
)
from app.ai.models import LLMRequest, LLMResponse


class FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("POST", "https://example.test/chat/completions")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("failed", request=request, response=response)

    def json(self) -> dict:
        return self.payload


class FakeAsyncClient:
    posts: list[dict] = []
    responses: list[FakeResponse] = []

    def __init__(self, timeout: float) -> None:
        self.timeout = timeout

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def post(self, url: str, *, headers: dict, json: dict) -> FakeResponse:
        self.posts.append({"url": url, "headers": headers, "json": json})
        return self.responses.pop(0)


class FailingProvider(LLMProvider):
    name = "failing"
    model = "failing-model"

    async def complete(self, request: LLMRequest) -> LLMResponse:
        raise RuntimeError("boom")


class StaticProvider(LLMProvider):
    name = "static"
    model = "static-model"

    async def complete(self, request: LLMRequest) -> LLMResponse:
        return LLMResponse(
            text="A real answer from the next provider.",
            provider=self.name,
            model=self.model,
            input_tokens=3,
            output_tokens=7,
            latency_ms=1,
            degraded=False,
        )


def make_request() -> LLMRequest:
    return LLMRequest(
        system_prompt="Answer with care.",
        prompt="Question: Why?\n\nContext:\nBecause memory says so.",
        max_tokens=900,
        temperature=0.4,
    )


@pytest.mark.asyncio
async def test_openai_compatible_provider_parses_chat_completion(monkeypatch) -> None:
    FakeAsyncClient.posts = []
    FakeAsyncClient.responses = [
        FakeResponse(
            {
                "model": "test-model",
                "choices": [{"message": {"content": "This is the model answer."}}],
                "usage": {"prompt_tokens": 11, "completion_tokens": 6},
            }
        )
    ]
    monkeypatch.setattr("app.ai.llm_router.httpx.AsyncClient", FakeAsyncClient)

    provider = OpenAICompatibleProvider(
        "test",
        "https://llm.example/v1/",
        "test-key",
        "test-model",
    )
    response = await provider.complete(make_request())

    assert response.text == "This is the model answer."
    assert response.provider == "test"
    assert response.model == "test-model"
    assert response.input_tokens == 11
    assert response.output_tokens == 6
    assert response.degraded is False
    assert FakeAsyncClient.posts[0]["url"] == "https://llm.example/v1/chat/completions"
    assert FakeAsyncClient.posts[0]["headers"]["Authorization"] == "Bearer test-key"
    assert FakeAsyncClient.posts[0]["json"]["messages"][0]["role"] == "system"
    assert FakeAsyncClient.posts[0]["json"]["max_tokens"] == 900
    assert FakeAsyncClient.posts[0]["json"]["temperature"] == 0.4


@pytest.mark.asyncio
async def test_router_fails_over_to_next_provider() -> None:
    response = await LLMRouter([FailingProvider(), StaticProvider()]).complete(make_request())

    assert response.provider == "static"
    assert response.degraded is False


@pytest.mark.asyncio
async def test_router_can_fall_back_to_local_deterministic_provider() -> None:
    response = await LLMRouter([FailingProvider(), LocalDeterministicProvider()]).complete(
        make_request()
    )

    assert response.provider == "local"
    assert response.degraded is True
    assert "Smyst memory context" in response.text
