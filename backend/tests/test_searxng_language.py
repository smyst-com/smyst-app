from __future__ import annotations

import pytest

from app.ai.web_research import QueryCategory, SearxngSearchProvider, build_web_search_provider
from app.core.config import Settings


class _Response:
    status_code = 403
    text = ""

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        raise ValueError("no json")


def _client(calls: list[dict[str, object]]):
    class FakeClient:
        async def get(self, url: str, *, params: dict[str, object], timeout: float | None = None):
            calls.append(dict(params))
            return _Response()

    return FakeClient


@pytest.mark.asyncio
async def test_search_language_is_sent(monkeypatch) -> None:
    # Der fruehere Festwert "all" lieferte Unsinn: am 16.08.2026 gemessen kamen auf
    # "heute wichtigsten Nachrichten Deutschland news" Microsoft-Support-Seiten und
    # Ferienhaeuser zurueck; mit "de" sofort tagesschau.de, n-tv.de, t-online.de.
    calls: list[dict[str, object]] = []
    monkeypatch.setattr("app.ai.web_research.shared_client", _client(calls))

    await SearxngSearchProvider("http://searxng:8080", language="de").search(
        "Nachrichten Deutschland", category=QueryCategory.NEWS
    )

    assert all(call["language"] == "de" for call in calls)
    assert all(call["language"] != "all" for call in calls)


@pytest.mark.asyncio
async def test_blank_language_falls_back(monkeypatch) -> None:
    calls: list[dict[str, object]] = []
    monkeypatch.setattr("app.ai.web_research.shared_client", _client(calls))

    await SearxngSearchProvider("http://searxng:8080", language="   ").search(
        "Nachrichten", category=QueryCategory.NEWS
    )

    assert all(call["language"] == "de" for call in calls)


def test_settings_reach_the_provider() -> None:
    provider = build_web_search_provider(
        Settings(
            WEB_RESEARCH_ENABLED=True,
            WEB_SEARCH_PROVIDER="searxng",
            SEARXNG_BASE_URL="http://searxng:8080",
            SEARXNG_LANGUAGE="en",
            SEARXNG_ENGINES="google,duckduckgo",
        )
    )

    assert isinstance(provider, SearxngSearchProvider)
    assert provider.language == "en"
    assert provider.engines == "google,duckduckgo"
