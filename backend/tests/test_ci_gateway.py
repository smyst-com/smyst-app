"""Tests fuer das CI-LLM-Gateway (Endpoint + OIDC-Verdrahtung).

Der echte OIDC-Austausch mit GitHub laesst sich hier nicht nachstellen; die
Signaturpruefung ist deshalb gemockt. Geprueft wird, was das Gateway selbst
entscheidet: ohne gueltigen Ausweis kein Zugang, Not-Fallback wird als
Provider-Ausfall gemeldet statt als Antwort, und die Antwortform passt zum
OpenAI-Schema, das die Pipeline-Seite erwartet.
"""

from __future__ import annotations

import json
from time import time

import pytest
from fastapi.testclient import TestClient

from app.ai.github_oidc import ActionsIdTokenSource, _decode_unverified_claims
from app.ai.models import LLMResponse
from app.api.v1.routes import ci_gateway
from app.core.config import Settings
from app.main import app

client = TestClient(app, base_url="https://testserver")

ENDPOINT = "/api/ci/llm/chat/completions"
BODY = {"messages": [{"role": "system", "content": "Du bist X."}, {"role": "user", "content": "Hi"}]}


class FakeRouter:
    def __init__(self, response: LLMResponse) -> None:
        self.response = response
        self.providers: list[object] = []
        self.requests: list[object] = []

    async def complete(self, request):
        self.requests.append(request)
        return self.response


def _answer(text: str = "Antwort", *, degraded: bool = False) -> LLMResponse:
    return LLMResponse(
        text=text,
        provider="openrouter",
        model="openai/gpt-4o",
        input_tokens=3,
        output_tokens=2,
        latency_ms=12,
        degraded=degraded,
    )


@pytest.fixture
def accept_token(monkeypatch):
    """Signaturpruefung durch ein Testdouble ersetzen (Token gilt als gueltig)."""

    class Verifier:
        def verify(self, token: str) -> dict[str, object]:
            if token != "gueltig":
                raise ValueError("ungueltig")
            return {"repository": "smyst-com/smyst-app", "workflow_ref": "pipeline-run.yml@main"}

    monkeypatch.setattr(ci_gateway, "_verifier", lambda *_: Verifier())
    return Verifier()


def _use_router(monkeypatch, router: FakeRouter) -> None:
    from app.ai import llm_router

    monkeypatch.setattr(llm_router, "build_default_router", lambda *a, **k: router)


def test_ohne_token_401() -> None:
    response = client.post(ENDPOINT, json=BODY)
    assert response.status_code == 401
    assert response.json()["code"] == "auth_required"


def test_falsches_token_403(accept_token) -> None:
    response = client.post(ENDPOINT, json=BODY, headers={"Authorization": "Bearer fremd"})
    assert response.status_code == 403


def test_gueltiges_token_liefert_openai_form(accept_token, monkeypatch) -> None:
    router = FakeRouter(_answer("Meine Formel ist E=mc^2."))
    _use_router(monkeypatch, router)

    response = client.post(ENDPOINT, json=BODY, headers={"Authorization": "Bearer gueltig"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["choices"][0]["message"]["content"] == "Meine Formel ist E=mc^2."
    assert payload["usage"]["total_tokens"] == 5
    # System- und Nutzeranteil muessen getrennt beim Router ankommen, sonst
    # verliert der Smoke-Test die Persona aus der Capsule.
    assert router.requests[0].system_prompt == "Du bist X."
    assert router.requests[0].prompt == "Hi"


def test_degradierte_antwort_wird_als_ausfall_gemeldet(accept_token, monkeypatch) -> None:
    _use_router(monkeypatch, FakeRouter(_answer("Einen Moment bitte", degraded=True)))

    response = client.post(ENDPOINT, json=BODY, headers={"Authorization": "Bearer gueltig"})

    assert response.status_code == 503
    assert response.json()["code"] == "provider_degraded"


def test_gateway_ruft_sich_nicht_selbst_auf(accept_token, monkeypatch) -> None:
    class Provider:
        def __init__(self, name: str) -> None:
            self.name = name

    router = FakeRouter(_answer())
    router.providers = [Provider("smyst_gateway"), Provider("openrouter")]
    _use_router(monkeypatch, router)

    client.post(ENDPOINT, json=BODY, headers={"Authorization": "Bearer gueltig"})

    assert [provider.name for provider in router.providers] == ["openrouter"]


def test_leere_nachrichten_422(accept_token) -> None:
    response = client.post(
        ENDPOINT, json={"messages": []}, headers={"Authorization": "Bearer gueltig"}
    )
    assert response.status_code == 422


def test_deaktiviertes_gateway_404(accept_token, monkeypatch) -> None:
    settings = Settings(CI_GATEWAY_ENABLED=False)
    monkeypatch.setattr(ci_gateway, "get_settings", lambda: settings)

    response = client.post(ENDPOINT, json=BODY, headers={"Authorization": "Bearer gueltig"})
    assert response.status_code == 404


def test_token_wird_bis_kurz_vor_ablauf_wiederverwendet(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_fetch(audience: str) -> str:
        calls.append(audience)
        payload = json.dumps({"exp": time() + 900}).encode("utf-8")
        import base64

        body = base64.urlsafe_b64encode(payload).decode("utf-8").rstrip("=")
        return f"kopf.{body}.signatur"

    from app.ai import github_oidc

    monkeypatch.setattr(github_oidc, "fetch_actions_id_token", fake_fetch)

    source = ActionsIdTokenSource("smyst-ci-llm-gateway")
    import asyncio

    first = asyncio.run(source.token())
    second = asyncio.run(source.token())

    assert first == second
    assert calls == ["smyst-ci-llm-gateway"]  # nur EIN Abruf bei GitHub


def test_abgelaufenes_token_wird_erneuert(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_fetch(audience: str) -> str:
        calls.append(audience)
        import base64

        payload = json.dumps({"exp": time() + 10}).encode("utf-8")
        body = base64.urlsafe_b64encode(payload).decode("utf-8").rstrip("=")
        return f"kopf.{body}.signatur"

    from app.ai import github_oidc

    monkeypatch.setattr(github_oidc, "fetch_actions_id_token", fake_fetch)

    source = ActionsIdTokenSource("aud")
    import asyncio

    asyncio.run(source.token())
    asyncio.run(source.token())

    # exp liegt innerhalb der Sicherheitsmarge -> jedes Mal frisch holen.
    assert len(calls) == 2


def test_claims_lesen_ohne_signaturpruefung() -> None:
    import base64

    payload = base64.urlsafe_b64encode(json.dumps({"exp": 42}).encode()).decode().rstrip("=")
    assert _decode_unverified_claims(f"a.{payload}.c") == {"exp": 42}


def test_ohne_actions_umgebung_kein_gateway_provider(monkeypatch) -> None:
    from app.ai.llm_router import build_default_router

    monkeypatch.delenv("ACTIONS_ID_TOKEN_REQUEST_URL", raising=False)
    monkeypatch.delenv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", raising=False)
    settings = Settings(
        SMYST_GATEWAY_BASE_URL="https://api.smyst.test/api/ci/llm",
        LLM_PROVIDER_ORDER="smyst_gateway",
    )

    router = build_default_router(settings)

    assert [provider.name for provider in router.providers] == ["local"]


def test_mit_actions_umgebung_kommt_gateway_zuerst(monkeypatch) -> None:
    from app.ai.llm_router import build_default_router

    monkeypatch.setenv("ACTIONS_ID_TOKEN_REQUEST_URL", "https://runner.test/token")
    monkeypatch.setenv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "runner-token")
    settings = Settings(
        SMYST_GATEWAY_BASE_URL="https://api.smyst.test/api/ci/llm",
        OPENROUTER_API_KEY="sk-test",
        LLM_PROVIDER_ORDER="smyst_gateway,openrouter",
    )

    router = build_default_router(settings)

    assert [provider.name for provider in router.providers] == [
        "smyst_gateway",
        "openrouter",
        "local",
    ]
