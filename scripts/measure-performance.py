#!/usr/bin/env python3
"""Misst smyst.com aus Nutzersicht und schreibt JSON + Markdown-Zusammenfassung.

Gedacht fuer den Lauf in GitHub Actions: die Runner stehen in den USA und damit
naeher am Zielmarkt als eine Messung aus Europa. Lokal laeuft das Skript genauso,
liefert dann aber die Latenz des eigenen Anschlusses.

WARUM MEDIAN UND REFERENZ: Bei der Analyse am 14.08.2026 schwankte eine Messung
vom Entwicklerrechner zwischen 0,8 s und 32 s — Einzelwerte sind wertlos. Darum
mehrere Runden, Median statt Mittelwert (Ausreisser ziehen ihn nicht hoch) und
eine Referenzmessung gegen eine fremde Seite: ist die auch langsam, liegt es am
Messpunkt, nicht an smyst.

Aufruf:
    python3 scripts/measure-performance.py [--rounds N] [--chat-rounds N]
      [--json-out PFAD] [--markdown-out PFAD] [--skip-chat]
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Callable

FRONTEND = "https://smyst.com"
API = "https://smyst-api.zeabur.app"
REFERENCE = "https://example.com/"
TIMEOUT = 60
UA = "smyst-perf-check/1.0 (+https://smyst.com)"


@dataclass
class Samples:
    """Sammelt Messwerte einer Groesse und fasst sie robust zusammen."""

    label: str
    unit: str = "ms"
    values: list[float] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def add(self, value: float) -> None:
        self.values.append(value)

    def fail(self, message: str) -> None:
        self.errors.append(message)

    @property
    def median(self) -> float | None:
        return statistics.median(self.values) if self.values else None

    def summary(self) -> dict[str, object]:
        return {
            "label": self.label,
            "unit": self.unit,
            "median": round(self.median, 1) if self.median is not None else None,
            "min": round(min(self.values), 1) if self.values else None,
            "max": round(max(self.values), 1) if self.values else None,
            "samples": len(self.values),
            "errors": self.errors,
        }


def _request(url: str, *, data: bytes | None = None, headers: dict[str, str] | None = None):
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("User-Agent", UA)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    return req


def time_request(url: str, *, data: bytes | None = None, headers: dict[str, str] | None = None) -> tuple[float, int, bytes]:
    """Gibt (Millisekunden bis die Antwort vollstaendig gelesen ist, Status, Body)."""
    started = time.perf_counter()
    with urllib.request.urlopen(_request(url, data=data, headers=headers), timeout=TIMEOUT) as res:
        body = res.read()
        return (time.perf_counter() - started) * 1000, res.status, body


def measure_simple(samples: Samples, rounds: int, call: Callable[[], float]) -> None:
    for _ in range(rounds):
        try:
            samples.add(call())
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            samples.fail(f"{type(exc).__name__}: {exc}")


def measure_chat(rounds: int) -> dict[str, Samples]:
    """Misst den SSE-Chat: erstes Byte, erstes Text-Fragment, komplette Antwort.

    Der Abstand zwischen erstem Byte und erstem Fragment zeigt, wie lange die
    Vorarbeit (Twin-Kontext, Web-Recherche, Modell-Vorlauf) dauert; PR #392 hat
    dafuer gesorgt, dass das erste Byte nicht mehr darauf wartet.
    """
    first_byte = Samples("Chat: erstes Byte")
    first_delta = Samples("Chat: erstes Textfragment")
    complete = Samples("Chat: komplette Antwort")
    headers = {"Content-Type": "application/json", "X-Smyst-CSRF": "1"}

    for index in range(rounds):
        try:
            _, _, body = time_request(f"{API}/api/chat/start", data=b"{}", headers=headers)
            chat_id = json.loads(body)["chat"]["id"]
            payload = json.dumps(
                {"chatId": chat_id, "message": f"Hallo! Kurzer Messlauf {index + 1}."}
            ).encode()

            started = time.perf_counter()
            seen_first_byte = seen_first_delta = False
            with urllib.request.urlopen(
                _request(f"{API}/api/chat/messages/stream", data=payload, headers=headers),
                timeout=TIMEOUT,
            ) as res:
                buffer = b""
                while True:
                    chunk = res.read(1)
                    if not chunk:
                        break
                    if not seen_first_byte:
                        first_byte.add((time.perf_counter() - started) * 1000)
                        seen_first_byte = True
                    buffer += chunk
                    if not buffer.endswith(b"\n\n"):
                        continue
                    block, buffer = buffer.strip(), b""
                    # Der ": warmup"-Kommentar oeffnet den Stream, traegt aber
                    # keinen Text — er zaehlt als Byte, nicht als Fragment.
                    if not block.startswith(b"data:"):
                        continue
                    event = json.loads(block[5:])
                    if not seen_first_delta and isinstance(event.get("delta"), str):
                        first_delta.add((time.perf_counter() - started) * 1000)
                        seen_first_delta = True
                    if event.get("done"):
                        complete.add((time.perf_counter() - started) * 1000)
                        break
                    if event.get("error"):
                        first_delta.fail("Stream meldete einen Fehler")
                        break
        except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError) as exc:
            first_byte.fail(f"{type(exc).__name__}: {exc}")

    return {"first_byte": first_byte, "first_delta": first_delta, "complete": complete}


def vantage_point() -> dict[str, str]:
    """Woher wurde gemessen? Ohne diese Angabe sind die Zahlen nicht deutbar."""
    try:
        _, _, body = time_request("http://ip-api.com/json/?fields=status,country,regionName,city,org")
        data = json.loads(body)
        if data.get("status") == "success":
            return {
                "city": data.get("city", "?"),
                "region": data.get("regionName", "?"),
                "country": data.get("country", "?"),
                "network": data.get("org", "?"),
            }
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        pass
    return {"city": "?", "region": "?", "country": "?", "network": "?"}


def build_markdown(report: dict[str, object]) -> str:
    where = report["vantage_point"]
    lines = [
        "## smyst.com — Geschwindigkeitsmessung",
        "",
        f"**Gemessen von:** {where['city']}, {where['region']}, {where['country']} "
        f"({where['network']})",
        "",
        "Median aus mehreren Runden. Die Referenzzeile misst eine fremde Seite: "
        "ist die ebenfalls langsam, liegt es am Messpunkt und nicht an smyst.",
        "",
        "| Messung | Median | schnellste | langsamste | Runden |",
        "|---|---:|---:|---:|---:|",
    ]
    for entry in report["measurements"]:
        median = f"{entry['median']:.0f} {entry['unit']}" if entry["median"] is not None else "—"
        fastest = f"{entry['min']:.0f}" if entry["min"] is not None else "—"
        slowest = f"{entry['max']:.0f}" if entry["max"] is not None else "—"
        lines.append(
            f"| {entry['label']} | {median} | {fastest} | {slowest} | {entry['samples']} |"
        )

    problems = [
        f"- **{entry['label']}**: {err}"
        for entry in report["measurements"]
        for err in entry["errors"]
    ]
    if problems:
        lines += ["", "### Fehler waehrend der Messung", "", *problems]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rounds", type=int, default=5, help="Runden je HTTP-Messung")
    parser.add_argument(
        "--chat-rounds",
        type=int,
        default=3,
        help="Runden fuer den Chat. Jede Runde kostet einen echten LLM-Aufruf — sparsam halten.",
    )
    parser.add_argument("--skip-chat", action="store_true", help="Chat-Messung auslassen")
    parser.add_argument("--json-out", help="Pfad fuer den JSON-Bericht")
    parser.add_argument("--markdown-out", help="Pfad fuer die Markdown-Zusammenfassung")
    args = parser.parse_args()

    checks: list[Samples] = []

    startseite = Samples("Startseite (HTML, CDN)")
    measure_simple(startseite, args.rounds, lambda: time_request(f"{FRONTEND}/")[0])
    checks.append(startseite)

    katalog = Samples("Profil-Katalog (statisch, CDN)")
    measure_simple(katalog, args.rounds, lambda: time_request(f"{FRONTEND}/api/public/twins/")[0])
    checks.append(katalog)

    gesundheit = Samples("Backend erreichbar (/api/health/live)")
    measure_simple(gesundheit, args.rounds, lambda: time_request(f"{API}/api/health/live")[0])
    checks.append(gesundheit)

    anmeldung = Samples("Anmeldepruefung (/auth/me)")
    measure_simple(anmeldung, args.rounds, lambda: time_request(f"{API}/auth/me")[0])
    checks.append(anmeldung)

    referenz = Samples("Referenz: example.com")
    measure_simple(referenz, args.rounds, lambda: time_request(REFERENCE)[0])
    checks.append(referenz)

    if not args.skip_chat:
        chat = measure_chat(args.chat_rounds)
        checks.extend([chat["first_byte"], chat["first_delta"], chat["complete"]])

    report = {
        "measured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "vantage_point": vantage_point(),
        "measurements": [check.summary() for check in checks],
    }

    markdown = build_markdown(report)
    print(markdown)

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
    if args.markdown_out:
        with open(args.markdown_out, "w", encoding="utf-8") as handle:
            handle.write(markdown)

    # Ein fehlgeschlagener Einzelabruf ist Rauschen; erst wenn eine Messung gar
    # keinen Wert lieferte, ist der Lauf unbrauchbar.
    if any(check.median is None for check in checks):
        print("FEHLER: mindestens eine Messung lieferte keinen einzigen Wert.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
