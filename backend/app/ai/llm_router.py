from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass
from time import perf_counter
from typing import Any
from urllib.parse import urljoin

import httpx
from app.ai.models import LLMRequest, LLMResponse
from app.core.config import Settings, get_settings


DEFAULT_SYSTEM_PROMPT = (
    "You are Smyst's safe AI-twin answer engine. Answer as the requested persona "
    "without claiming to be the real person. Use the provided memory context when relevant."
)


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    base_url: str
    api_key_attr: str
    default_model: str


class LLMProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def complete(self, request: LLMRequest) -> LLMResponse:
        raise NotImplementedError


class LocalDeterministicProvider(LLMProvider):
    name = "local"
    model = "smyst-local-deterministic-v1"

    async def complete(self, request: LLMRequest) -> LLMResponse:
        started = perf_counter()
        context_marker = "Context:"
        answer = request.prompt
        if context_marker in request.prompt:
            answer = request.prompt.split(context_marker, 1)[-1].strip()
        answer = (
            "I can answer from the available Smyst memory context. "
            + " ".join(answer.split()[:120])
        )
        latency_ms = int((perf_counter() - started) * 1000)
        return LLMResponse(
            text=answer,
            provider=self.name,
            model=self.model,
            input_tokens=len(request.prompt.split()),
            output_tokens=len(answer.split()),
            latency_ms=latency_ms,
            degraded=True,
        )


class ExternalProviderPlaceholder(LLMProvider):
    def __init__(self, name: str, model: str) -> None:
        self.name = name
        self.model = model

    async def complete(self, request: LLMRequest) -> LLMResponse:
        raise RuntimeError(f"LLM provider '{self.name}' is not configured")


class GeminiProvider(ExternalProviderPlaceholder):
    def __init__(self) -> None:
        super().__init__("gemini", "gemini-routing-target")


class ClaudeProvider(ExternalProviderPlaceholder):
    def __init__(self) -> None:
        super().__init__("claude", "claude-routing-target")


class GrokProvider(ExternalProviderPlaceholder):
    def __init__(self) -> None:
        super().__init__("grok", "grok-routing-target")


class DeepSeekProvider(ExternalProviderPlaceholder):
    def __init__(self) -> None:
        super().__init__("deepseek", "deepseek-routing-target")


class KimiProvider(ExternalProviderPlaceholder):
    def __init__(self) -> None:
        super().__init__("kimi", "kimi-routing-target")


class ManusProvider(ExternalProviderPlaceholder):
    def __init__(self) -> None:
        super().__init__("manus", "manus-routing-target")


class MistralProvider(ExternalProviderPlaceholder):
    def __init__(self) -> None:
        super().__init__("mistral", "mistral-routing-target")


class OpenAICompatibleProvider(LLMProvider):
    def __init__(
        self,
        name: str,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 60,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> None:
        self.name = name
        self.base_url = base_url.rstrip("/") + "/"
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.max_tokens = max_tokens
        self.temperature = temperature

    @property
    def chat_completions_url(self) -> str:
        return urljoin(self.base_url, "chat/completions")

    async def complete(self, request: LLMRequest) -> LLMResponse:
        started = perf_counter()
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": request.system_prompt or DEFAULT_SYSTEM_PROMPT},
                {"role": "user", "content": request.prompt},
            ],
            "max_tokens": request.max_tokens or self.max_tokens,
            "temperature": (
                request.temperature if request.temperature is not None else self.temperature
            ),
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}

        response = None
        last_error: Exception | None = None
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for attempt in range(2):
                try:
                    response = await client.post(
                        self.chat_completions_url,
                        headers=headers,
                        json=payload,
                    )
                    response.raise_for_status()
                    break
                except Exception as exc:
                    last_error = exc
                    if attempt == 0:
                        await asyncio.sleep(0.15)
                        continue
                    raise

        if response is None:
            raise last_error or RuntimeError(f"LLM provider '{self.name}' returned no response")

        data = response.json()
        text = self._parse_text(data)
        usage = data.get("usage") or {}
        latency_ms = int((perf_counter() - started) * 1000)
        return LLMResponse(
            text=text,
            provider=self.name,
            model=data.get("model") or self.model,
            input_tokens=int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or usage.get("output_tokens") or 0),
            latency_ms=latency_ms,
            degraded=False,
        )

    def _parse_text(self, data: dict[str, Any]) -> str:
        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError(f"LLM provider '{self.name}' returned no choices")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content
        if isinstance(content, list):
            text = "".join(part.get("text", "") for part in content if isinstance(part, dict))
            if text.strip():
                return text
        raise RuntimeError(f"LLM provider '{self.name}' returned empty content")


class AnthropicProvider(OpenAICompatibleProvider):
    async def complete(self, request: LLMRequest) -> LLMResponse:
        try:
            return await super().complete(request)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in {400, 404, 405}:
                raise
            return await self._complete_native(request)

    async def _complete_native(self, request: LLMRequest) -> LLMResponse:
        started = perf_counter()
        payload = {
            "model": self.model,
            "system": request.system_prompt or DEFAULT_SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": request.prompt}],
            "max_tokens": request.max_tokens or self.max_tokens,
            "temperature": (
                request.temperature if request.temperature is not None else self.temperature
            ),
        }
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
        }

        response = None
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for attempt in range(2):
                try:
                    response = await client.post(
                        urljoin(self.base_url, "messages"),
                        headers=headers,
                        json=payload,
                    )
                    response.raise_for_status()
                    break
                except Exception:
                    if attempt == 0:
                        await asyncio.sleep(0.15)
                        continue
                    raise

        if response is None:
            raise RuntimeError("Anthropic provider returned no response")

        data = response.json()
        content = data.get("content") or []
        text = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        if not text.strip():
            raise RuntimeError("Anthropic provider returned empty content")
        usage = data.get("usage") or {}
        latency_ms = int((perf_counter() - started) * 1000)
        return LLMResponse(
            text=text,
            provider=self.name,
            model=data.get("model") or self.model,
            input_tokens=int(usage.get("input_tokens") or 0),
            output_tokens=int(usage.get("output_tokens") or 0),
            latency_ms=latency_ms,
            degraded=False,
        )


class ManusProvider(LLMProvider):
    name = "manus"

    def __init__(
        self,
        api_key: str,
        agent_profile: str = "manus-1.6-lite",
        base_url: str = "https://api.manus.ai/v2",
        timeout: float = 60,
        poll_attempts: int = 18,
        poll_interval: float = 1.0,
    ) -> None:
        self.api_key = api_key
        self.model = agent_profile
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.poll_attempts = poll_attempts
        self.poll_interval = poll_interval

    async def complete(self, request: LLMRequest) -> LLMResponse:
        started = perf_counter()
        headers = {
            "x-manus-api-key": self.api_key,
            "content-type": "application/json",
        }
        task_payload = {
            "agent_profile": self.model,
            "interactive": False,
            "hide_in_task_list": True,
            "share_visibility": "private",
            "message": {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"{request.system_prompt or DEFAULT_SYSTEM_PROMPT}\n\n{request.prompt}",
                    }
                ],
            },
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            created = await client.post(
                f"{self.base_url}/task.create",
                headers=headers,
                json=task_payload,
            )
            created.raise_for_status()
            task_id = self._extract_task_id(created.json())

            last_status = "unknown"
            for _ in range(self.poll_attempts):
                messages_response = await client.get(
                    f"{self.base_url}/task.listMessages",
                    headers=headers,
                    params={"task_id": task_id, "limit": 20, "order": "desc"},
                )
                messages_response.raise_for_status()
                messages = messages_response.json()
                text = self._extract_answer(messages)
                if text:
                    latency_ms = int((perf_counter() - started) * 1000)
                    return LLMResponse(
                        text=text,
                        provider=self.name,
                        model=self.model,
                        input_tokens=len(request.prompt.split()),
                        output_tokens=len(text.split()),
                        latency_ms=latency_ms,
                        degraded=False,
                    )
                last_status = self._extract_status(messages) or last_status
                if last_status in {"stopped", "failed"}:
                    break
                await asyncio.sleep(self.poll_interval)

        raise RuntimeError(f"Manus task did not return an answer; status={last_status}")

    def _extract_task_id(self, data: dict[str, Any]) -> str:
        task_id = data.get("task_id") or (data.get("data") or {}).get("task_id")
        if not isinstance(task_id, str) or not task_id.strip():
            raise RuntimeError("Manus task.create returned no task_id")
        return task_id

    def _extract_answer(self, data: dict[str, Any]) -> str:
        items = data.get("messages") or data.get("items") or data.get("data") or []
        if isinstance(items, dict):
            items = items.get("messages") or items.get("items") or []
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict) or item.get("type") != "assistant_message":
                continue
            content = item.get("content")
            if isinstance(content, str) and content.strip():
                return content
            if isinstance(content, list):
                text = "".join(part.get("text", "") for part in content if isinstance(part, dict))
                if text.strip():
                    return text
        return ""

    def _extract_status(self, data: dict[str, Any]) -> str | None:
        items = data.get("messages") or data.get("items") or data.get("data") or []
        if isinstance(items, dict):
            items = items.get("messages") or items.get("items") or []
        for item in items if isinstance(items, list) else []:
            if isinstance(item, dict) and item.get("type") == "status_update":
                status = item.get("status")
                if isinstance(status, str):
                    return status
        return None


PROVIDER_CONFIGS: dict[str, ProviderConfig] = {
    "openrouter": ProviderConfig(
        name="openrouter",
        base_url="https://openrouter.ai/api/v1",
        api_key_attr="openrouter_api_key",
        default_model="openai/gpt-4o",
    ),
    "openai": ProviderConfig(
        name="openai",
        base_url="https://api.openai.com/v1",
        api_key_attr="openai_api_key",
        default_model="gpt-4o",
    ),
    "anthropic": ProviderConfig(
        name="anthropic",
        base_url="https://api.anthropic.com/v1",
        api_key_attr="anthropic_api_key",
        default_model="claude-3-7-sonnet-latest",
    ),
    "gemini": ProviderConfig(
        name="gemini",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key_attr="gemini_api_key",
        default_model="gemini-2.5-flash",
    ),
    "xai": ProviderConfig(
        name="xai",
        base_url="https://api.x.ai/v1",
        api_key_attr="xai_api_key",
        default_model="grok-3",
    ),
    "deepseek": ProviderConfig(
        name="deepseek",
        base_url="https://api.deepseek.com",
        api_key_attr="deepseek_api_key",
        default_model="deepseek-v4-flash",
    ),
    "moonshot": ProviderConfig(
        name="moonshot",
        base_url="https://api.moonshot.ai/v1",
        api_key_attr="moonshot_api_key",
        default_model="kimi-k2-0711-preview",
    ),
    "manus": ProviderConfig(
        name="manus",
        base_url="https://api.manus.ai/v2",
        api_key_attr="manus_api_key",
        default_model="manus-1.6-lite",
    ),
    "zhipu": ProviderConfig(
        name="zhipu",
        base_url="https://api.z.ai/api/paas/v4",
        api_key_attr="zhipu_api_key",
        default_model="glm-4.6",
    ),
    "dashscope": ProviderConfig(
        name="dashscope",
        base_url="https://dashscope-intl.aliyun.com/compatible-mode/v1",
        api_key_attr="dashscope_api_key",
        default_model="qwen-plus",
    ),
    "mistral": ProviderConfig(
        name="mistral",
        base_url="https://api.mistral.ai/v1",
        api_key_attr="mistral_api_key",
        default_model="mistral-large-latest",
    ),
    "groq": ProviderConfig(
        name="groq",
        base_url="https://api.groq.com/openai/v1",
        api_key_attr="groq_api_key",
        default_model="llama-3.3-70b-versatile",
    ),
    "together": ProviderConfig(
        name="together",
        base_url="https://api.together.xyz/v1",
        api_key_attr="together_api_key",
        default_model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
    ),
    "cohere": ProviderConfig(
        name="cohere",
        base_url="https://api.cohere.ai/compatibility/v1",
        api_key_attr="cohere_api_key",
        default_model="command-a-03-2025",
    ),
    "perplexity": ProviderConfig(
        name="perplexity",
        base_url="https://api.perplexity.ai",
        api_key_attr="perplexity_api_key",
        default_model="sonar-pro",
    ),
}

PROVIDER_ALIASES = {
    "claude": "anthropic",
    "grok": "xai",
    "kimi": "moonshot",
    "moonshotai": "moonshot",
    "manusai": "manus",
    "glm": "zhipu",
    "zai": "zhipu",
    "qwen": "dashscope",
    "alibaba": "dashscope",
}

DEFAULT_PROVIDER_ORDER = [
    "openrouter",
    "openai",
    "anthropic",
    "gemini",
    "xai",
    "deepseek",
    "moonshot",
    "manus",
    "zhipu",
    "dashscope",
    "mistral",
    "groq",
    "together",
    "cohere",
    "perplexity",
]


def _canonical_provider_name(name: str) -> str:
    normalized = name.strip().lower().replace("-", "_")
    return PROVIDER_ALIASES.get(normalized, normalized)


def _provider_order(settings: Settings) -> list[str]:
    configured = [
        _canonical_provider_name(name)
        for name in settings.llm_provider_order_raw.split(",")
        if name.strip()
    ]
    order = configured or DEFAULT_PROVIDER_ORDER
    return [name for name in order if name in PROVIDER_CONFIGS]


def provider_statuses(settings: Settings | None = None) -> list[dict[str, object]]:
    active_settings = settings or get_settings()
    model_overrides = {
        _canonical_provider_name(provider): model
        for provider, model in active_settings.llm_default_models.items()
    }
    statuses: list[dict[str, object]] = []
    seen: set[str] = set()

    status_order = [
        *_provider_order(active_settings),
        *(name for name in DEFAULT_PROVIDER_ORDER if name not in _provider_order(active_settings)),
    ]
    for provider_name in status_order:
        if provider_name in seen:
            continue
        seen.add(provider_name)
        config = PROVIDER_CONFIGS[provider_name]
        key_value = getattr(active_settings, config.api_key_attr, None)
        statuses.append(
            {
                "provider": config.name,
                "key_name": config.api_key_attr.upper(),
                "configured": bool(key_value),
                "supported": True,
                "model": model_overrides.get(provider_name, config.default_model),
                "base_url": config.base_url,
            }
        )

    return statuses


def build_default_router(settings: Settings | None = None) -> LLMRouter:
    active_settings = settings or get_settings()
    model_overrides = {
        _canonical_provider_name(provider): model
        for provider, model in active_settings.llm_default_models.items()
    }
    providers: list[LLMProvider] = []
    seen: set[str] = set()

    for provider_name in _provider_order(active_settings):
        if provider_name in seen:
            continue
        seen.add(provider_name)
        config = PROVIDER_CONFIGS[provider_name]
        api_key = getattr(active_settings, config.api_key_attr, None)
        if not api_key:
            continue
        model = model_overrides.get(provider_name, config.default_model)
        provider_cls = (
            AnthropicProvider if provider_name == "anthropic" else OpenAICompatibleProvider
        )
        if provider_name == "manus":
            providers.append(ManusProvider(api_key, agent_profile=model, base_url=config.base_url))
        else:
            providers.append(provider_cls(config.name, config.base_url, api_key, model))

    providers.append(LocalDeterministicProvider())
    return LLMRouter(providers)


class LLMRouter:
    """Provider router with deterministic fallback."""

    def __init__(self, providers: list[LLMProvider] | None = None) -> None:
        self.providers = providers or [LocalDeterministicProvider()]

    @staticmethod
    def supported_provider_targets() -> list[str]:
        return [*DEFAULT_PROVIDER_ORDER, *PROVIDER_ALIASES, "local"]

    async def complete(self, request: LLMRequest) -> LLMResponse:
        last_error: Exception | None = None
        for provider in self.providers:
            try:
                return await provider.complete(request)
            except Exception as exc:
                last_error = exc
                continue
        if last_error:
            raise last_error
        raise RuntimeError("No LLM providers configured")
