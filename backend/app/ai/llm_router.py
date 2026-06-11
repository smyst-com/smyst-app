from __future__ import annotations

from abc import ABC, abstractmethod
from time import perf_counter

from app.ai.models import LLMRequest, LLMResponse


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


class LLMRouter:
    """Provider router with deterministic fallback.

    Production adapters for Gemini, Claude, Grok, DeepSeek, Kimi, Manus, and
    Mistral plug in here with timeout, circuit breaker, cost, and quality policy.
    """

    def __init__(self, providers: list[LLMProvider] | None = None) -> None:
        self.providers = providers or [LocalDeterministicProvider()]

    @staticmethod
    def supported_provider_targets() -> list[str]:
        return [
            "gemini",
            "claude",
            "grok",
            "deepseek",
            "kimi",
            "manus",
            "mistral",
            "local",
        ]

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
