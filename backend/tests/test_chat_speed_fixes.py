"""Chat-Geschwindigkeits-Fixes (28.09., Auftrag Inhaber "blitzschnell").

Zwei Ursachen der 46-48 s Chat-Antwortzeiten mit degenerierter Local-Meldung:
1. OpenRouter-Fallback forderte das kostenpflichtige openai/gpt-4o an und
   scheiterte am leeren Guthaben mit 402 Payment Required.
2. smyst_llm frass im Chat das komplette 20-s-Gesamtbudget, sodass fuer den
   Fallback keine Zeit mehr blieb.
"""

from types import SimpleNamespace

from app.ai.llm_router import AntiLoopProvider, OpenAICompatibleProvider
from app.ai.provider_catalog import PROVIDER_CONFIGS, STALE_MODEL_ALIASES


def test_openrouter_default_is_free_model() -> None:
    # Ohne Guthaben antworten nur :free-Modelle — der Default muss eines sein.
    default = PROVIDER_CONFIGS["openrouter"].default_model
    assert default.endswith(":free")


def test_stale_openrouter_gpt4o_maps_to_free_model() -> None:
    # Ein per Env hereingereichter alter Default wird auf das freie Modell
    # umgeleitet, statt erneut in die 402 zu laufen.
    assert STALE_MODEL_ALIASES[("openrouter", "openai/gpt-4o")].endswith(":free")


def test_chat_router_caps_smyst_llm_timeout(monkeypatch) -> None:
    from app.api.v1.routes import chat as chat_route

    inner = OpenAICompatibleProvider(
        "smyst_llm", "http://127.0.0.1:8080/v1", "smyst", "smyst-1.0", timeout=90.0
    )
    wrapped = AntiLoopProvider(inner)
    other = OpenAICompatibleProvider(
        "openrouter", "https://openrouter.ai/api/v1", "k", "m", timeout=20.0
    )
    fake_router = SimpleNamespace(
        providers=[wrapped, other], total_deadline_seconds=45.0
    )
    monkeypatch.setattr(
        chat_route, "build_default_router", lambda: fake_router
    )
    monkeypatch.setattr(
        chat_route,
        "get_settings",
        lambda: SimpleNamespace(llm_chat_total_deadline_seconds=20.0),
    )

    result = chat_route._chat_router()

    # Chat-Budget greift weiter ...
    assert result.total_deadline_seconds == 20.0
    # ... aber smyst_llm bekommt nur noch 12 s, damit der Fallback im
    # restlichen Budget eine echte Antwort liefern kann.
    assert inner.timeout == 12.0
    # AntiLoop-Huelle bleibt unveraendert, andere Provider unberuehrt.
    assert getattr(wrapped, "timeout", None) is None
    assert other.timeout == 20.0
