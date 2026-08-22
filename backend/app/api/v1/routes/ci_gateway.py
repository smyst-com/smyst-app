"""CI-LLM-Gateway: leiht der Pipeline die Provider-Kette dieses Servers.

Hintergrund (12.08.2026): Die Autopilot-Pipeline in GitHub Actions hat eigene
Provider-Keys in den Repo-Secrets. Als die alle abliefen, fiel ihr Chat-Smoke-
Test auf den Not-Fallback zurueck und die QA verwarf praktisch jeden Kandidaten
— der Durchsatz brach von ~1500 auf unter 20 Profile/Tag ein. Der Live-Server
hatte die ganze Zeit einen funktionierenden Schluessel. Statt den Schluessel an
zwei Stellen zu pflegen, fragt die Pipeline jetzt hier an.

Zugang nur fuer Jobs aus dem eigenen Repository, nachgewiesen per GitHub-OIDC
(siehe app/ai/github_oidc.py) — kein geteiltes Geheimnis, das jemand von Hand
eintragen muesste.

Die Antwortform ist das OpenAI-Chat-Completions-Format, damit auf der
Pipeline-Seite der vorhandene OpenAICompatibleProvider unveraendert passt.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.ai.github_oidc import GithubOidcVerifier
from app.ai.models import LLMRequest
from app.core.config import Settings, get_settings

logger = logging.getLogger("smyst.api.ci_gateway")

router = APIRouter(prefix="/ci/llm", tags=["ci"])

#: Der Gateway-Provider darf in der Kette dieses Servers nicht selbst
#: auftauchen — sonst riefe der Server sich im Kreis selbst auf.
SELF_PROVIDER_NAME = "smyst_gateway"


@lru_cache(maxsize=4)
def _verifier(audience: str, repository: str) -> GithubOidcVerifier:
    return GithubOidcVerifier(audience=audience, repository=repository)


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"ok": False, "code": code, "message": message})


def _authorize(request: Request, settings: Settings) -> JSONResponse | dict[str, object]:
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer "):
        return _error(401, "auth_required", "Bearer-Token fehlt.")
    token = header.split(" ", 1)[1].strip()
    try:
        return _verifier(settings.ci_gateway_audience, settings.ci_gateway_repository).verify(token)
    except Exception as error:  # pragma: no cover - Fehlerpfade in Tests gemockt
        logger.warning("ci gateway rejected token: %s", type(error).__name__)
        return _error(403, "forbidden", "Token nicht gueltig fuer dieses Repository.")


def _messages_to_request(payload: dict[str, Any], settings: Settings) -> LLMRequest | JSONResponse:
    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        return _error(422, "invalid_request", "messages fehlt.")

    system_parts: list[str] = []
    user_parts: list[str] = []
    for message in messages:
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            continue
        if message.get("role") == "system":
            system_parts.append(content)
        else:
            user_parts.append(content)

    if not user_parts:
        return _error(422, "invalid_request", "Keine Nutzernachricht enthalten.")

    requested_tokens = payload.get("max_tokens")
    max_tokens = settings.ci_gateway_max_tokens
    if isinstance(requested_tokens, int) and 0 < requested_tokens < max_tokens:
        max_tokens = requested_tokens

    temperature = payload.get("temperature")
    return LLMRequest(
        prompt="\n\n".join(user_parts),
        system_prompt="\n\n".join(system_parts),
        max_tokens=max_tokens,
        temperature=float(temperature) if isinstance(temperature, (int, float)) else 0.2,
    )


def _pinned_provider(requested: Any, settings: Settings) -> Any | JSONResponse | None:
    """Provider fuer ein ausdruecklich angefordertes Modell — nur aus der Allowlist.

    Wozu: Der Modell-Vergleich (app/workers/compare_models.py) muss dasselbe
    Fragenset gegen VERSCHIEDENE Modelle stellen. Ueber den eigenen Repo-Key
    ging das nicht — OpenRouter weist ihn mit 403 ab (16.08.2026), waehrend der
    Schluessel dieses Servers funktioniert.

    WICHTIG fuer die Rueckwaertsvertraeglichkeit: Die Pipeline schickt seit
    jeher ein model-Feld ("smyst-gateway") mit, das bisher ignoriert wurde. Ein
    unbekanntes Modell darf deshalb NICHT zum Fehler fuehren — sonst braeche der
    Autopilot. Nur Namen aus der Allowlist werden beachtet, alles andere
    verhaelt sich exakt wie bisher.

    Die Allowlist ist die Kostenbremse: ohne sie koennte jeder Job aus dem Repo
    beliebige — auch sehr teure — Modelle auf den Schluessel des Servers buchen.
    """
    if not isinstance(requested, str) or not requested.strip():
        return None
    model = requested.strip()
    if model not in settings.ci_gateway_allowed_models:
        return None

    from app.ai.llm_router import build_openrouter_provider
    from app.ai.provider_catalog import PROVIDER_CONFIGS

    if not getattr(settings, PROVIDER_CONFIGS["openrouter"].api_key_attr, None):
        return _error(503, "model_unavailable", "Kein Schluessel fuer das angeforderte Modell.")
    logger.info("ci gateway pinned to requested model %s", model)
    # Ueber den gemeinsamen Helfer: er setzt die Attributions-Header, ohne die
    # OpenRouter mit 403 antwortet (siehe build_openrouter_provider).
    return build_openrouter_provider(settings, model)


@router.post("/chat/completions")
async def chat_completions(request: Request) -> JSONResponse:
    settings = get_settings()
    if not settings.ci_gateway_enabled:
        return _error(404, "not_found", "Gateway ist deaktiviert.")

    claims = _authorize(request, settings)
    if isinstance(claims, JSONResponse):
        return claims

    try:
        payload = await request.json()
    except Exception:
        return _error(422, "invalid_request", "Body ist kein JSON.")
    if not isinstance(payload, dict):
        return _error(422, "invalid_request", "Body ist kein JSON-Objekt.")

    llm_request = _messages_to_request(payload, settings)
    if isinstance(llm_request, JSONResponse):
        return llm_request

    from app.ai.llm_router import build_default_router

    pinned = _pinned_provider(payload.get("model"), settings)
    if isinstance(pinned, JSONResponse):
        return pinned

    if pinned is not None:
        response = await pinned.complete(llm_request)
    else:
        router_instance = build_default_router()
        router_instance.providers = [
            provider
            for provider in router_instance.providers
            if provider.name != SELF_PROVIDER_NAME
        ]
        response = await router_instance.complete(llm_request)

    if response.degraded:
        # Ehrlich durchreichen: die Pipeline soll einen Provider-Ausfall als
        # solchen erkennen und den Kandidaten unbewertet lassen, statt eine
        # Wartemeldung als Twin-Antwort zu bewerten.
        return _error(503, "provider_degraded", "Kein Chat-Provider verfuegbar.")

    logger.info(
        "ci gateway served %s via %s (%s)",
        claims.get("workflow_ref", "unbekannter workflow"),
        response.provider,
        response.model,
    )
    return JSONResponse(
        content={
            "id": f"smystci-{response.provider}",
            "object": "chat.completion",
            "model": response.model,
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": response.text},
                }
            ],
            "usage": {
                "prompt_tokens": response.input_tokens,
                "completion_tokens": response.output_tokens,
                "total_tokens": response.input_tokens + response.output_tokens,
            },
        }
    )
