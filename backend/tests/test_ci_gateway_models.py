"""Das Gateway darf ein Modell annehmen — aber nur aus der Allowlist.

Der Modell-Vergleich braucht dasselbe Fragenset gegen verschiedene Modelle.
Ueber den Repo-Key ging das nicht (OpenRouter: 403), der Server-Key funktioniert.

Die groesste Gefahr beim Umbau war nicht Sicherheit, sondern Rueckwaerts-
kompatibilitaet: Die Autopilot-Pipeline schickt seit jeher ein model-Feld mit,
das ignoriert wurde. Wuerde ein unbekanntes Modell jetzt einen Fehler ausloesen,
stuende der Autopilot.
"""

from __future__ import annotations

from app.api.v1.routes.ci_gateway import _pinned_provider
from app.core.config import Settings


def _settings(allowed: str = "", key: str | None = "sk-test") -> Settings:
    return Settings(
        CI_GATEWAY_ALLOWED_MODELS=allowed,
        OPENROUTER_API_KEY=key,
    )


def test_unknown_model_is_ignored_not_rejected() -> None:
    """Der Autopilot sendet model='smyst-gateway' — das muss weiter durchlaufen."""
    assert _pinned_provider("smyst-gateway", _settings(allowed="openai/gpt-4o-mini")) is None


def test_model_field_without_allowlist_behaves_exactly_as_before() -> None:
    assert _pinned_provider("openai/gpt-4o", _settings(allowed="")) is None


def test_missing_model_field_is_fine() -> None:
    settings = _settings(allowed="openai/gpt-4o")
    assert _pinned_provider(None, settings) is None
    assert _pinned_provider("", settings) is None
    assert _pinned_provider(123, settings) is None


def test_allowed_model_gets_its_own_provider() -> None:
    provider = _pinned_provider("openai/gpt-4o-mini", _settings(allowed="openai/gpt-4o,openai/gpt-4o-mini"))

    assert provider is not None
    assert provider.model == "openai/gpt-4o-mini"
    assert "openrouter" in provider.base_url


def test_allowed_model_without_key_fails_loudly() -> None:
    """Stumm auf das Standardmodell zurueckfallen waere schlimmer: der
    Vergleich haette dann zweimal dasselbe Modell gemessen."""
    result = _pinned_provider("openai/gpt-4o-mini", _settings(allowed="openai/gpt-4o-mini", key=None))

    assert result is not None
    assert getattr(result, "status_code", None) == 503


def test_allowlist_tolerates_spaces() -> None:
    provider = _pinned_provider(
        "openai/gpt-4o-mini", _settings(allowed=" openai/gpt-4o , openai/gpt-4o-mini ")
    )
    assert provider is not None


def test_pinned_provider_sets_the_attribution_headers() -> None:
    """OpenRouter antwortet ohne HTTP-Referer/X-Title mit 403.

    Das sah zweimal nach einem ungueltigen Schluessel aus (17.08.2026) und
    kostete einen Umweg ueber das Gateway, der gar nicht noetig gewesen waere.
    Wer den Provider von Hand zusammensetzt, vergisst die Header — dieser Test
    haelt fest, dass es nicht wieder passiert.
    """
    provider = _pinned_provider("openai/gpt-4o-mini", _settings(allowed="openai/gpt-4o-mini"))

    assert provider is not None
    assert provider.extra_headers.get("HTTP-Referer")
    assert provider.extra_headers.get("X-Title")
