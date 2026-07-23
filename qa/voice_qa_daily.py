#!/usr/bin/env python3
"""Taeglicher Voice-QA-Job fuer smyst.com.

Prueft die Sprachwelle (Worker/Piper-TTS + Worker-ASR auf dem Salad-Backend) automatisch:
- Erreichbarkeit und ready-Status von GET /api/tts/voices
- Erreichbarkeit und Sprachliste von GET /api/asr/status
- Vollstaendigkeit der 15 Pflichtsprachen
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

REQUIRED_LANGUAGES = {
    "en", "zh", "es", "ar", "fr", "de", "pt", "ru", "tr", "ja", "ko", "it", "hi", "id", "bn",
}

SMOKE_TESTS = [
    {"name": "Englisch", "payload": {"text": "The republic is a form of government for the people.", "lang": "en", "gender": "female"}, "expect_voice_prefixes": ("en-", "worker-en")},
    {"name": "Chinesisch", "payload": {"text": "你好，这是一个简短的语音测试。", "lang": "zh"}, "expect_voice_prefixes": ("worker-zh",)},
    {"name": "Spanisch", "payload": {"text": "Hola, esta es una prueba breve de voz natural.", "lang": "es"}, "expect_voice_prefixes": ("worker-es",)},
    {"name": "Arabisch", "payload": {"text": "مرحبا، هذا اختبار صوتي قصير لمنصة smyst.com.", "lang": "ar"}, "expect_voice_prefixes": ("worker-ar",)},
    {"name": "Franzoesisch", "payload": {"text": "Bonjour, ceci est un court test vocal naturel.", "lang": "fr"}, "expect_voice_prefixes": ("worker-fr",)},
    {"name": "Deutsch", "payload": {"text": "Die Republik ist eine Staatsform des Volkes.", "lang": "de", "gender": "male"}, "expect_voice_prefixes": ("de-", "worker-de")},
    {"name": "Portugiesisch", "payload": {"text": "Ola, este e um breve teste de voz natural.", "lang": "pt"}, "expect_voice_prefixes": ("worker-pt",)},
    {"name": "Russisch", "payload": {"text": "Здравствуйте, это короткий тест голосового режима.", "lang": "ru"}, "expect_voice_prefixes": ("worker-ru",)},
    {"name": "Tuerkisch", "payload": {"text": "Cumhuriyet, milletin egemenligine dayanan bir yonetim seklidir.", "lang": "tr", "gender": "male"}, "expect_voice_prefixes": ("tr-", "worker-tr")},
    {"name": "Japanisch", "payload": {"text": "こんにちは、これは短い音声テストです。", "lang": "ja"}, "expect_voice_prefixes": ("worker-ja",)},
    {"name": "Koreanisch", "payload": {"text": "안녕하세요, 이것은 짧은 음성 테스트입니다.", "lang": "ko"}, "expect_voice_prefixes": ("worker-ko",)},
    {"name": "Italienisch", "payload": {"text": "Ciao, questo e un breve test vocale naturale.", "lang": "it"}, "expect_voice_prefixes": ("worker-it",)},
    {"name": "Hindi", "payload": {"text": "नमस्ते, यह एक छोटा आवाज परीक्षण है।", "lang": "hi"}, "expect_voice_prefixes": ("worker-hi",)},
    {"name": "Indonesisch", "payload": {"text": "Halo, ini adalah tes suara singkat yang alami.", "lang": "id"}, "expect_voice_prefixes": ("worker-id",)},
    {"name": "Bengalisch", "payload": {"text": "নমস্কার, এটি একটি ছোট ভয়েস পরীক্ষা।", "lang": "bn"}, "expect_voice_prefixes": ("worker-bn",)},
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
        # Header-Schluessel normalisieren: ueber HTTP/2 (Cloudflare/Salad) kommen
        # alle Header kleingeschrieben an, ueber HTTP/1.1 in Originalschreibweise.
        normalized_headers = {key.lower(): value for key, value in response.headers.items()}
        return response.status, audio, normalized_headers, elapsed


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
        worker_configured = bool(voices_info.get("workerConfigured"))
        missing = sorted(EXPECTED_VOICES - available)
        unexpected = sorted(available - EXPECTED_VOICES)
        findings.append({
            "check": "Stimmenliste",
            "status": "OK" if ready and (worker_configured or not missing) else "FEHLER",
            "detail": f"{len(available)} Stimmen, ready={ready}, worker={worker_configured}, fehlend={missing or '-'}, unerwartet={unexpected or '-'}",
        })
        if not ready or (missing and not worker_configured):
            ok = False
    except Exception as exc:  # noqa: BLE001
        findings.append({"check": "Stimmenliste", "status": "FEHLER", "detail": str(exc)})
        ok = False

    # 1b. ASR-Contract pruefen
    try:
        asr_info = http_get_json(args.base_url + "/api/asr/status")
        languages = set(asr_info.get("languages", []))
        missing_langs = sorted(REQUIRED_LANGUAGES - languages)
        ready = bool(asr_info.get("ready"))
        transient = asr_info.get("storage") == "transient"
        findings.append({
            "check": "ASR-Status",
            "status": "OK" if ready and transient and not missing_langs else "FEHLER",
            "detail": f"ready={ready}, transient={transient}, fehlende Sprachen={missing_langs or '-'}",
        })
        if not ready or not transient or missing_langs:
            ok = False
    except Exception as exc:  # noqa: BLE001
        findings.append({"check": "ASR-Status", "status": "FEHLER", "detail": str(exc)})
        ok = False

    # 2. Synthese-Smoke-Tests
    for test in SMOKE_TESTS:
        try:
            status, audio, headers, elapsed = http_post_tts(args.base_url + "/api/tts", test["payload"])
            voice_used = headers.get("x-voice-id", "?")
            is_wav = audio[:4] == b"RIFF"
            problems = []
            if status != 200:
                problems.append(f"HTTP {status}")
            if not is_wav:
                problems.append("kein WAV")
            if len(audio) < 1000:
                problems.append(f"Audio zu klein ({len(audio)} B)")
            if not any(voice_used.startswith(prefix) for prefix in test["expect_voice_prefixes"]):
                problems.append(f"falsche Stimme: {voice_used} (erwartet {test['expect_voice_prefixes']})")
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
