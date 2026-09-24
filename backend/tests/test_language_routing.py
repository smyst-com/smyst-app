"""Tests fuer das sprachbewusste Modell-Routing und den Language-Autopilot.

Fix 24.09.2026: Deutsch/Englisch bleibt smyst_llm zuerst (Funktions-Freeze),
andere Sprachen fuehren die Cloud-Kette an — smyst_llm bleibt Not-Fallback.
"""

from __future__ import annotations

import pytest

from app.ai.llm_router import LLMRouter, LocalDeterministicProvider
from app.ai.models import LLMRequest, LLMResponse
from app.workers.language_autopilot import (
    plan_combinations,
    verify_reply_language,
)


class _FakeProvider:
    def __init__(self, name: str, text: str = "ok") -> None:
        self.name = name
        self.model = f"{name}-model"
        self.text = text
        self.calls = 0

    async def complete(self, request: LLMRequest) -> LLMResponse:
        self.calls += 1
        return LLMResponse(
            text=self.text,
            provider=self.name,
            model=self.model,
            input_tokens=1,
            output_tokens=1,
            latency_ms=1,
            degraded=False,
        )


def _request(language: str | None) -> LLMRequest:
    metadata = {"language": language} if language else {}
    return LLMRequest(prompt="p", system_prompt="s", metadata=metadata)


class TestLanguageRouting:
    @pytest.mark.asyncio
    async def test_deutsch_bleibt_smyst_llm_zuerst(self):
        own = _FakeProvider("smyst_llm")
        cloud = _FakeProvider("openrouter")
        router = LLMRouter([own, cloud, LocalDeterministicProvider()])
        response = await router.complete(_request("de"))
        assert response.provider == "smyst_llm"
        assert own.calls == 1
        assert cloud.calls == 0

    @pytest.mark.asyncio
    async def test_tuerkisch_nimmt_cloud_zuerst(self):
        own = _FakeProvider("smyst_llm")
        cloud = _FakeProvider("openrouter")
        router = LLMRouter([own, cloud, LocalDeterministicProvider()])
        response = await router.complete(_request("tr"))
        assert response.provider == "openrouter"
        assert cloud.calls == 1
        assert own.calls == 0

    @pytest.mark.asyncio
    async def test_ohne_sprache_unveraendert(self):
        own = _FakeProvider("smyst_llm")
        router = LLMRouter([own, LocalDeterministicProvider()])
        response = await router.complete(_request(None))
        assert response.provider == "smyst_llm"

    @pytest.mark.asyncio
    async def test_eigenes_modell_bleib_not_fallback(self):
        own = _FakeProvider("smyst_llm", text="Merhaba, ben yardim edebilirim")
        router = LLMRouter([own, LocalDeterministicProvider()])

        class _Failing(_FakeProvider):
            async def complete(self, request: LLMRequest) -> LLMResponse:
                self.calls += 1
                raise RuntimeError("cloud down")

        router.providers = [_Failing("openrouter"), own, LocalDeterministicProvider()]
        response = await router.complete(_request("tr"))
        assert response.provider == "smyst_llm"


class TestVerifyReply:
    def test_refusal_erkannt(self):
        findings = verify_reply_language(
            "Nein, ich kann kein Türkisch sprechen oder verstehen.", "tr"
        )
        assert any(f.startswith("verweigerung") for f in findings)

    def test_falsche_sprache_erkannt(self):
        findings = verify_reply_language("Gerne erzähle ich dir alles darüber.", "tr")
        assert any(f.startswith("falsche_sprache") for f in findings)

    def test_korrekte_tuerkische_antwort_bestanden(self):
        findings = verify_reply_language(
            "Cumhuriyeti kurmak en zor kararımdı, milletim için çok çalıştım.", "tr"
        )
        assert findings == []

    def test_zu_kurz(self):
        assert verify_reply_language("ok", "tr") == ["antwort_zu_kurz"]


class TestPlan:
    def test_p0_zuerst_und_rotation(self):
        entries = register_languages()
        plan = plan_combinations(
            ["einstein", "atatuerk"], entries, [], limit=6
        )
        languages_in_plan = [language for _profile, language, _function in plan]
        assert set(languages_in_plan) <= {"de", "tr", "en", "ku", "ckb"}

    def test_gemeinsame_matrix_aeltere_zuerst(self):
        entries = register_languages()
        matrix = [
            {
                "profile": "einstein",
                "language": "de",
                "function": "text",
                "testedAt": "2026-09-01T00:00:00+00:00",
                "result": "ok",
            },
            {
                "profile": "einstein",
                "language": "tr",
                "function": "text",
                "testedAt": "2026-09-23T00:00:00+00:00",
                "result": "ok",
            },
        ]
        plan = plan_combinations(["einstein"], ["de", "tr"], matrix, limit=1)
        assert plan[0][1] == "de"  # aeltester Test zuerst (Rotation)

    def test_filter_profil_sprache_funktion(self):
        plan = plan_combinations(
            ["einstein", "atatuerk"],
            register_languages(),
            [],
            limit=10,
            only_profile="atatuerk",
            only_language="tr",
            only_function="text",
        )
        assert plan == [("atatuerk", "tr", "text")]


def register_languages() -> list[str]:
    from app.ai.language_register import registered_language_codes

    return registered_language_codes()
