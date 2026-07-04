#!/usr/bin/env python3
"""Taeglicher Voice-QA-Job fuer smyst.com.

Prueft die Sprachwelle (Piper-TTS auf dem Salad-Backend) automatisch:
- Erreichbarkeit und ready-Status von GET /api/tts/voices
- Vollstaendigkeit der erwarteten Stimmen (de, en, tr)
- Synthese-Smoke-Tests pro Sprache (Latenz, WAV-Header, Groesse, X-Voice-Id)
- Alias-Aufloesung (de-male, tr-male, ...)
- Tuerkische Begriffe (Aussprache-Stichprobe: Synthese darf nicht fehlschlagen)

Der Job aendert NICHTS. Er erzeugt nur einen Markdown-Bericht.
Live-Aenderungen brauchen weiterhin die schriftliche Freigabe von Adam King.

Aufruf:
  python3 voice_qa_daily.py [--base-url https://...salad.cloud] [--out bericht.md]
"""
from __future__ import annotations

import argparse
import datetime
import json
import sys
import time
import urllib.request

DEFAULT_BASE_URL = "https://cherry-asparagus-a32jleuk8dgn22zu.salad.cloud"

EXPECTED_VOICES = {
    "de-thorsten", "de-karlsson", "de-pavoque", "de-kerstin", "de-ramona", "de-eva",
    "en-ryan", "en-joe", "en-lessac", "en-hfc-male", "en-amy", "en-hfc-female",
    "tr-dfki",
    "de-male", "de-female", "en-male", "en-female", "tr-male", "tr-female",
}

SMOKE_TESTS = [
    {"name": "Deutsch maennlich", "payload": {"text": "Die Republik ist eine Staatsform des Volkes.", "lang": "de", "gender": "male"}, "expect_voice_prefix": "de-"},
    {"name": "Englisch weiblich", "payload": {"text": "The republic is a form of government for the people.", "lang": "en", "gender": "female"}, "expect_voice_prefix": "en-"},
    {"name": "Tuerkisch Alias", "payload": {"text": "Cumhuriyet, milletin egemenligine dayanan bir yonetim seklidir.", "lang": "tr", "gender": "male"}, "expect_voice_prefix": "tr-"},
    {"name": "Atatuerk voiceId", "payload": {"text": "Egemenlik kayitsiz sartsiz milletindir. Yurtta sulh, cihanda sulh.", "voiceId": "tr-dfki", "lang": "tr", "gender": "male"}, "expect_voice_prefix": "tr-"},
    {"name": "Tuerkische Begriffe", "payload": {"text": "Ankara, Istanbul, Cumhuriyet, Egemenlik, Buyuk Millet Meclisi, Anadolu.", "voiceId": "tr-dfki", "lang": "tr"}, "expect_voice_prefix": "tr-"},
]

MAX_LATENCY_SECONDS = 8.0


def http_get_json(url: str, timeout: float = 15.0) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "smyst.com-voice-qa"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def http_post_tts(url: str, payload: dict, timeout: float = 30.0) -> tuple[int, bytes, dict, float]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "smyst.com-voice-qa"},
        method="POST",
    )
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        audio = response.read()
        elapsed = time.monotonic() - started
        return response.status, audio, dict(response.headers), elapsed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    findings: list[dict] = []
    ok = True

    # 1. Stimmenliste pruefen
    try:
        voices_info = http_get_json(args.base_url + "/api/tts/voices")
        available = set(voices_info.get("voices", []))
        ready = bool(voices_info.get("ready"))
        missing = sorted(EXPECTED_VOICES - available)
        unexpected = sorted(available - EXPECTED_VOICES)
        findings.append({
            "check": "Stimmenliste",
            "status": "OK" if ready and not missing else "FEHLER",
            "detail": f"{len(available)} Stimmen, ready={ready}, fehlend={missing or '-'}, unerwartet={unexpected or '-'}",
        })
        if not ready or missing:
            ok = False
    except Exception as exc:  # noqa: BLE001
        findings.append({"check": "Stimmenliste", "status": "FEHLER", "detail": str(exc)})
        ok = False

    # 2. Synthese-Smoke-Tests
    for test in SMOKE_TESTS:
        try:
            status, audio, headers, elapsed = http_post_tts(args.base_url + "/api/tts", test["payload"])
            voice_used = headers.get("X-Voice-Id", "?")
            is_wav = audio[:4] == b"RIFF"
            problems = []
            if status != 200:
                problems.append(f"HTTP {status}")
            if not is_wav:
                problems.append("kein WAV")
            if len(audio) < 1000:
                problems.append(f"Audio zu klein ({len(audio)} B)")
            if not voice_used.startswith(test["expect_voice_prefix"]):
                problems.append(f"falsche Stimme: {voice_used} (erwartet {test['expect_voice_prefix']}*)")
            if elapsed > MAX_LATENCY_SECONDS:
                problems.append(f"zu langsam: {elapsed:.1f}s")
            findings.append({
                "check": f"Synthese: {test['name']}",
                "status": "OK" if not problems else "FEHLER",
                "detail": f"{voice_used}, {len(audio) // 1024} KB, {elapsed:.1f}s" + (f" | {'; '.join(problems)}" if problems else ""),
            })
            if problems:
                ok = False
        except Exception as exc:  # noqa: BLE001
            findings.append({"check": f"Synthese: {test['name']}", "status": "FEHLER", "detail": str(exc)})
            ok = False

    # 3. Bericht schreiben
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        f"# smyst.com Voice-QA-Bericht — {now}",
        "",
        f"Backend: {args.base_url}",
        f"Gesamtergebnis: {'ALLE CHECKS GRUEN' if ok else 'FEHLER GEFUNDEN'}",
        "",
        "| Check | Status | Detail |",
        "| --- | --- | --- |",
    ]
    for item in findings:
        lines.append(f"| {item['check']} | {item['status']} | {item['detail']} |")
    lines += [
        "",
        "Hinweis: Dieser Job aendert nichts. Verbesserungen nur per PR und",
        "nach schriftlicher Freigabe von Adam King (Funktions-Freeze Sprachsystem).",
        "",
    ]
    report = "\n".join(lines)
    out_path = args.out or f"voice_qa_bericht_{datetime.date.today().isoformat()}.md"
    with open(out_path, "w", encoding="utf-8") as handle:
        handle.write(report)
    print(report)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
