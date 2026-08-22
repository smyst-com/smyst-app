"""Der geteilte HTTP-Client muss wiederverwendet und sauber ersetzt werden.

Ohne Wiederverwendung zahlt jede ausgehende Anfrage DNS, TCP und TLS neu —
genau das war vor dem 16.08.2026 auf dem Chat-Pfad der Fall.
"""

from __future__ import annotations

import asyncio

import pytest

from app.core.http_client import _LIMITS, aclose_shared_client, shared_client


@pytest.fixture(autouse=True)
async def _fresh_client():
    await aclose_shared_client()
    yield
    await aclose_shared_client()


async def test_returns_the_same_client_across_calls() -> None:
    assert shared_client() is shared_client()


async def test_keepalive_is_enabled() -> None:
    """Ohne offene Verbindungen im Pool waere der gemeinsame Client sinnlos.

    Geprueft wird die eigene Festlegung, nicht httpx-Interna: der Client legt
    seine Limits nicht oeffentlich offen, und ein Test auf `_limits` waere beim
    naechsten httpx-Update kaputt.
    """
    assert _LIMITS.max_keepalive_connections and _LIMITS.max_keepalive_connections > 0
    assert _LIMITS.keepalive_expiry and _LIMITS.keepalive_expiry > 0


async def test_recreates_client_after_close() -> None:
    """Tests und Neustarts fahren die App mehrfach hoch; ein geschlossener
    Client duerfte sonst bei jeder weiteren Anfrage werfen."""
    first = shared_client()
    await aclose_shared_client()
    assert first.is_closed

    second = shared_client()
    assert second is not first
    assert not second.is_closed


async def test_closing_twice_is_harmless() -> None:
    shared_client()
    await aclose_shared_client()
    await aclose_shared_client()


async def test_each_event_loop_gets_its_own_client() -> None:
    """Verbindungen duerfen niemals ueber Loop-Grenzen wandern.

    Genau daran scheiterte die erste Fassung: ein prozessweiter Client wurde in
    der Testsuite auf einer Loop geoeffnet und auf einer anderen geschlossen.
    """
    outer = shared_client()

    def in_own_loop() -> int:
        return asyncio.run(_client_id())

    other_id = await asyncio.to_thread(in_own_loop)
    assert other_id != id(outer)


async def _client_id() -> int:
    client = shared_client()
    identifier = id(client)
    await aclose_shared_client()
    return identifier
