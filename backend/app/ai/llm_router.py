from __future__ import annotations

import asyncio
import json
import logging
from abc import ABC, abstractmethod
from time import perf_counter
from typing import Any, AsyncIterator
from urllib.parse import urljoin

import httpx
from app.ai.models import LLMRequest, LLMResponse
from app.ai.provider_catalog import (
    DEFAULT_PROVIDER_ORDER,
    PROVIDER_ALIASES,
    PROVIDER_CONFIGS,
    STALE_MODEL_ALIASES,
)
from app.core.config import Settings, get_settings

logger = logging.getLogger("smyst.ai.llm_router")

DEFAULT_SYSTEM_PROMPT = (
    "You are Smyst's safe AI-twin answer engine. Answer as the requested persona "
    "without claiming to be the real person. Use the provided memory context when relevant."
)

# Statuscodes, bei denen ein Retry sinnlos ist (Key/Anfrage kaputt -> sofort
# zum naechsten Provider in der Kette wechseln statt erneut zu versuchen).
NO_RETRY_STATUSES = frozenset({400, 401, 403, 404, 422})
RETRY_BACKOFF_SECONDS = 0.15
RATE_LIMIT_BACKOFF_SECONDS = 1.0


class LLMProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def complete(self, request: LLMRequest) -> LLMResponse:
        raise NotImplementedError

    async def healthcheck(self, request: LLMRequest) -> dict[str, object]:
        await self.complete(request)
        return {"mode": "generation_ping"}


class ProviderHealthError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        category: str,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.category = category
        self.status_code = status_code


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
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.name = name
        self.base_url = base_url.rstrip("/") + "/"
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.extra_headers = extra_headers or {}

    @property
    def chat_completions_url(self) -> str:
        return urljoin(self.base_url, "chat/completions")

    @property
    def models_url(self) -> str:
        return urljoin(self.base_url, "models")

    async def complete(self, request: LLMRequest) -> LLMResponse:
        started = perf_counter()
        payload = self._build_payload(request)
        headers = {"Authorization": f"Bearer {self.api_key}", **self.extra_headers}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await self._post_with_retry(
                client, self.chat_completions_url, headers, payload
            )

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

    def _build_payload(self, request: LLMRequest) -> dict[str, Any]:
        return {
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

    async def stream(self, request: LLMRequest) -> AsyncIterator[str]:
        """Streamt Antwort-Deltas ueber die OpenAI-kompatible SSE-Schnittstelle.

        Wirft bei Fehlern; der Router faellt dann auf den naechsten Provider
        bzw. auf die nicht-streamende complete()-Antwort zurueck.
        """
        payload = {**self._build_payload(request), "stream": True}
        headers = {"Authorization": f"Bearer {self.api_key}", **self.extra_headers}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST", self.chat_completions_url, headers=headers, json=payload
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data)
                    except ValueError:
                        continue
                    choices = chunk.get("choices") or [{}]
                    delta = (choices[0].get("delta") or {}).get("content")
                    if delta:
                        yield delta

    async def _post_with_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        headers: dict[str, str],
        payload: dict[str, Any],
    ) -> Any:
        """POST mit differenziertem Retry.

        - 400/401/403/404/422: kein Retry (Key oder Anfrage kaputt) -> sofort raisen,
          Router wechselt zum naechsten Provider.
        - 429: ein Retry nach laengerem Backoff (Rate Limit).
        - 5xx / Netzwerkfehler: ein Retry nach kurzem Backoff.
        """
        for attempt in range(2):
            try:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                return response
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if status in NO_RETRY_STATUSES or attempt == 1:
                    raise
                logger.warning(
                    "llm provider '%s' got HTTP %s, retrying once", self.name, status
                )
                await asyncio.sleep(
                    RATE_LIMIT_BACKOFF_SECONDS if status == 429 else RETRY_BACKOFF_SECONDS
                )
            except Exception as exc:
                if attempt == 1:
                    raise
                logger.warning(
                    "llm provider '%s' request error (%s), retrying once",
                    self.name,
                    type(exc).__name__,
                )
                await asyncio.sleep(RETRY_BACKOFF_SECONDS)
        raise RuntimeError(f"LLM provider '{self.name}' returned no response")

    async def healthcheck(self, request: LLMRequest) -> dict[str, object]:
        headers = {"Authorization": f"Bearer {self.api_key}", **self.extra_headers}
        try:
            async with httpx.AsyncClient(timeout=min(self.timeout, 2.5)) as client:
                response = await client.get(self.models_url, headers=headers)
                response.raise_for_status()
            self._assert_model_available(response.json())
            return {"mode": "credential_model_check"}
        except (httpx.TimeoutException, httpx.RequestError):
            await LLMProvider.healthcheck(self, request)
            return {"mode": "generation_ping"}

    def _assert_model_available(self, data: dict[str, Any]) -> None:
        raw_models = data.get("data")
        if not isinstance(raw_models, list):
            return
        model_ids = {
            item.get("id") if isinstance(item, dict) else item
            for item in raw_models
            if isinstance(item, dict | str)
        }
        if model_ids and self.model not in model_ids:
            raise ProviderHealthError(
                "configured model is not available for this provider",
                category="model_unavailable",
                status_code=200,
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

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await self._post_with_retry(
                client, urljoin(self.base_url, "messages"), headers, payload
            )

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

    async def healthcheck(self, request: LLMRequest) -> dict[str, object]:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
        }
        try:
            async with httpx.AsyncClient(timeout=min(self.timeout, 2.5)) as client:
                response = await client.get(urljoin(self.base_url, "models"), headers=headers)
                response.raise_for_status()
            self._assert_model_available(response.json())
            return {"mode": "credential_model_check"}
        except (httpx.TimeoutException, httpx.RequestError):
            await LLMProvider.healthcheck(self, request)
            return {"mode": "generation_ping"}


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


def _model_for_provider(
    provider_name: str,
    config_default: str,
    model_overrides: dict[str, str],
) -> str:
    configured_model = model_overrides.get(provider_name, config_default)
    return STALE_MODEL_ALIASES.get((provider_name, configured_model), configured_model)


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
                "model": _model_for_provider(provider_name, config.default_model, model_overrides),
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
        model = _model_for_provider(provider_name, config.default_model, model_overrides)
        provider_cls = (
            AnthropicProvider if provider_name == "anthropic" else OpenAICompatibleProvider
        )
        timeout = active_settings.llm_provider_timeout_seconds
        if provider_name == "manus":
            providers.append(
                ManusProvider(
                    api_key, agent_profile=model, base_url=config.base_url, timeout=timeout
                )
            )
        elif provider_name == "openrouter":
            providers.append(
                OpenAICompatibleProvider(
                    config.name,
                    config.base_url,
                    api_key,
                    model,
                    timeout=timeout,
                    extra_headers={
                        "HTTP-Referer": active_settings.public_base_url,
                        "X-Title": active_settings.app_name,
                    },
                )
            )
        else:
            providers.append(
                provider_cls(config.name, config.base_url, api_key, model, timeout=timeout)
            )

    providers.append(LocalDeterministicProvider())
    return LLMRouter(
        providers,
        total_deadline_seconds=active_settings.llm_total_deadline_seconds,
    )


class LLMRouter:
    """Provider router with deterministic fallback.

    Faellt bei Fehlern durch die Provider-Kette; ein Gesamt-Zeitbudget
    (total_deadline_seconds) verhindert minutenlange Wartezeiten, wenn mehrere
    Remote-Provider nacheinander haengen. Der lokale deterministische Fallback
    laeuft immer, auch nach Ablauf des Budgets.
    """

    def __init__(
        self,
        providers: list[LLMProvider] | None = None,
        total_deadline_seconds: float | None = None,
    ) -> None:
        self.providers = providers or [LocalDeterministicProvider()]
        self.total_deadline_seconds = total_deadline_seconds

    @staticmethod
    def supported_provider_targets() -> list[str]:
        return [*DEFAULT_PROVIDER_ORDER, *PROVIDER_ALIASES, "local"]

    async def complete(self, request: LLMRequest) -> LLMResponse:
        started = perf_counter()
        last_error: Exception | None = None
        for provider in self.providers:
            is_local = isinstance(provider, LocalDeterministicProvider)
            remaining: float | None = None
            if self.total_deadline_seconds is not None and not is_local:
                remaining = self.total_deadline_seconds - (perf_counter() - started)
                if remaining <= 0:
                    logger.warning(
                        "llm deadline of %.1fs exhausted, skipping provider '%s'",
                        self.total_deadline_seconds,
                        provider.name,
                    )
                    continue
            try:
                if remaining is not None:
                    return await asyncio.wait_for(provider.complete(request), timeout=remaining)
                return await provider.complete(request)
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "llm provider '%s' failed (%s: %s), trying next provider",
                    provider.name,
                    type(exc).__name__,
                    exc,
                )
                continue
        if last_error:
            raise last_error
        raise RuntimeError("No LLM providers configured")

    async def stream(self, request: LLMRequest) -> AsyncIterator[dict[str, Any]]:
        """Streamt Antwort-Deltas mit derselben Fallback-Kette wie complete().

        Events: {"type": "delta", "text": ...} pro Fragment, abschliessend
        {"type": "done", "provider": ..., "model": ..., "text": ..., "degraded": ...}.
        Bricht ein Provider MITTEN im Stream ab, folgt {"type": "error"} —
        der Client faellt dann auf den nicht-streamenden Endpoint zurueck.
        Provider ohne stream()-Support liefern die komplette Antwort als ein Delta.
        """
        started = perf_counter()
        for provider in self.providers:
            is_local = isinstance(provider, LocalDeterministicProvider)
            if self.total_deadline_seconds is not None and not is_local:
                if self.total_deadline_seconds - (perf_counter() - started) <= 0:
                    logger.warning(
                        "llm deadline of %.1fs exhausted, skipping provider '%s' (stream)",
                        self.total_deadline_seconds,
                        provider.name,
                    )
                    continue
            stream_fn = getattr(provider, "stream", None)
            if stream_fn is None:
                try:
                    response = await provider.complete(request)
                except Exception as exc:
                    logger.warning(
                        "llm provider '%s' failed in stream mode (%s: %s), trying next",
                        provider.name,
                        type(exc).__name__,
                        exc,
                    )
                    continue
                yield {"type": "delta", "text": response.text}
                yield {
                    "type": "done",
                    "provider": response.provider,
                    "model": response.model,
                    "text": response.text,
                    "degraded": response.degraded,
                }
                return
            parts: list[str] = []
            try:
                async for delta in stream_fn(request):
                    parts.append(delta)
                    yield {"type": "delta", "text": delta}
            except Exception as exc:
                logger.warning(
                    "llm provider '%s' stream failed (%s: %s)",
                    provider.name,
                    type(exc).__name__,
                    exc,
                )
                if parts:
                    yield {"type": "error", "provider": provider.name}
                    return
                continue
            if parts:
                yield {
                    "type": "done",
                    "provider": provider.name,
                    "model": provider.model,
                    "text": "".join(parts),
                    "degraded": is_local,
                }
                return
        yield {"type": "error", "provider": "none"}


PING_PROMPT = "Reply with the single word: pong"


def _provider_error_diagnostics(exc: Exception) -> dict[str, object]:
    """Return safe provider diagnostics without headers, keys, or response bodies."""
    if isinstance(exc, ProviderHealthError):
        return {
            "error": type(exc).__name__,
            "status_code": exc.status_code,
            "category": exc.category,
        }
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code
        if status_code in {401, 403}:
            category = "auth_failed"
        elif status_code == 402:
            category = "payment_required"
        elif status_code == 404:
            category = "not_found"
        elif status_code in {400, 422}:
            category = "invalid_request"
        elif status_code == 429:
            category = "rate_limited"
        elif 500 <= status_code <= 599:
            category = "provider_unavailable"
        else:
            category = "http_error"
        return {
            "error": type(exc).__name__,
            "status_code": status_code,
            "category": category,
        }
    if isinstance(exc, TimeoutError | asyncio.TimeoutError):
        return {
            "error": type(exc).__name__,
            "status_code": None,
            "category": "timeout",
        }
    if isinstance(exc, httpx.RequestError):
        return {
            "error": type(exc).__name__,
            "status_code": None,
            "category": "network_error",
        }
    return {
        "error": type(exc).__name__,
        "status_code": None,
        "category": "provider_error",
    }


async def ping_providers(
    settings: Settings | None = None, timeout_seconds: float = 8.0
) -> dict[str, dict[str, object]]:
    """Testet jeden konfigurierten Provider mit einem Mini-Prompt (parallel).

    Liefert je Provider {"ok": bool, "latency_ms": int, "error": str | None}.
    Nur auf Anfrage aufrufen (kostet je einen minimalen API-Call).
    """
    active_settings = settings or get_settings()
    router = build_default_router(active_settings)
    request = LLMRequest(prompt=PING_PROMPT, system_prompt="", max_tokens=8, temperature=0.0)
    remote_providers = [
        provider
        for provider in router.providers
        if not isinstance(provider, LocalDeterministicProvider)
    ]

    async def _ping(provider: LLMProvider) -> tuple[str, dict[str, object]]:
        started = perf_counter()
        try:
            details = await asyncio.wait_for(provider.healthcheck(request), timeout=timeout_seconds)
            return provider.name, {
                "ok": True,
                "latency_ms": int((perf_counter() - started) * 1000),
                "error": None,
                **details,
            }
        except Exception as exc:
            diagnostics = _provider_error_diagnostics(exc)
            return provider.name, {
                "ok": False,
                "latency_ms": int((perf_counter() - started) * 1000),
                **diagnostics,
            }

    results = await asyncio.gather(*(_ping(provider) for provider in remote_providers))
    return dict(results)
