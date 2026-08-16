"""Geteilter HTTP-Client mit Verbindungspool — einer je Event-Loop.

Bis 16.08.2026 legte jeder ausgehende Aufruf einen eigenen
`httpx.AsyncClient` an (`async with httpx.AsyncClient(...)`). Damit zahlte
JEDE Anfrage DNS, TCP-Aufbau und TLS-Handschlag neu — auf dem heissesten Pfad,
dem LLM-Aufruf pro Chat-Nachricht, gleich mehrere Rundreisen, bevor ueberhaupt
etwas gesendet wurde. Ein wiederverwendeter Client haelt die Verbindungen offen
(Keep-Alive), sodass Folgeanfragen an denselben Host den Aufbau ueberspringen.

WARUM EINER JE LOOP UND NICHT EINER FUER DEN PROZESS:
Ein httpx-Client bindet seine offenen Verbindungen an die Event-Loop, auf der
sie entstanden sind. Im Server gibt es nur eine Loop — in der Testsuite dagegen
je Test eine eigene. Ein prozessweiter Client wurde dort auf Loop A geoeffnet
und auf Loop B geschlossen, was beim Aufraeumen der Sockets zuverlaessig
scheiterte. Die Zuordnung ueber die laufende Loop macht das unmoeglich: eine
Verbindung wird nie von einer fremden Loop aus benutzt oder geschlossen.

Die Zeitlimits bleiben pro Aufruf erhalten: httpx erlaubt `timeout=` je
Request, der Wert am Client ist nur die Vorgabe. Aufrufer geben ihr Limit also
weiterhin selbst an und aendern ihr Verhalten nicht.
"""

from __future__ import annotations

import asyncio
from weakref import WeakKeyDictionary

import httpx

# Grosszuegig genug fuer parallele Provider-Aufrufe, klein genug, dass ein
# Container mit 2 Kernen keine Dateideskriptoren hortet.
_LIMITS = httpx.Limits(
    max_connections=50,
    max_keepalive_connections=20,
    keepalive_expiry=90.0,
)

# Schwache Schluessel: verschwindet die Loop, faellt der Eintrag von selbst weg.
_clients: WeakKeyDictionary[asyncio.AbstractEventLoop, httpx.AsyncClient] = WeakKeyDictionary()
_loopless_client: httpx.AsyncClient | None = None


def _new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(limits=_LIMITS, follow_redirects=False)


def shared_client() -> httpx.AsyncClient:
    """Liefert den Client der laufenden Event-Loop; legt ihn bei Bedarf an."""
    global _loopless_client
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # Aufruf ausserhalb einer Loop (z. B. in synchronem Testaufbau).
        if _loopless_client is None or _loopless_client.is_closed:
            _loopless_client = _new_client()
        return _loopless_client

    client = _clients.get(loop)
    if client is None or client.is_closed:
        client = _new_client()
        _clients[loop] = client
    return client


async def aclose_shared_client() -> None:
    """Schliesst den Client der laufenden Loop; danach ist er wieder anlegbar.

    Beim Herunterfahren des Servers aufgerufen, damit offene
    Keep-Alive-Verbindungen nicht als Warnung im Log landen.
    """
    global _loopless_client
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None:
        client = _clients.pop(loop, None)
        if client is not None and not client.is_closed:
            await client.aclose()

    if _loopless_client is not None and not _loopless_client.is_closed:
        await _loopless_client.aclose()
    _loopless_client = None
