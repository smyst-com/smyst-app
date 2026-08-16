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


@pytest.mark.asyncio
async def test_configured_engines_are_sent(monkeypatch) -> None:
    # Standardsatz von SearXNG liefert von einer Rechenzentrums-IP nichts: am 16.08.2026
    # aus dem Zeabur-Container gemessen lieferten google/duckduckgo/brave/mojeek/startpage
    # je 0 Treffer, bing 10. Deshalb muss die Auswahl mitgeschickt werden.
    calls: list[dict[str, object]] = []

    class FakeClient:
        async def get(self, url: str, *, params: dict[str, object], timeout: float | None = None):
            calls.append(dict(params))
            return _Response()

    monkeypatch.setattr("app.ai.web_research.shared_client", FakeClient)
    provider = SearxngSearchProvider("http://searxng.zeabur.internal:8080", engines="bing,wikipedia")

    await provider.search("wetter berlin", category=QueryCategory.WEATHER)

    assert all(call["engines"] == "bing,wikipedia" for call in calls)


@pytest.mark.asyncio
async def test_empty_engines_lets_searxng_decide(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    class FakeClient:
        async def get(self, url: str, *, params: dict[str, object], timeout: float | None = None):
            calls.append(dict(params))
            return _Response()

    monkeypatch.setattr("app.ai.web_research.shared_client", FakeClient)
    provider = SearxngSearchProvider("http://searxng.zeabur.internal:8080", engines="  ")

    await provider.search("wetter berlin", category=QueryCategory.WEATHER)

    assert all("engines" not in call for call in calls)


def test_settings_reach_the_provider() -> None:
    provider = build_web_search_provider(
        Settings(
            WEB_RESEARCH_ENABLED=True,
            WEB_SEARCH_PROVIDER="searxng",
            SEARXNG_BASE_URL="http://searxng.zeabur.internal:8080",
            SEARXNG_ENGINES="bing",
        )
    )

    assert isinstance(provider, SearxngSearchProvider)
    assert provider.engines == "bing"
