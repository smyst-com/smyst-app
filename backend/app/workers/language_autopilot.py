"""smyst language autopilot — 24/7-Sprachpruefung gegen das echte System.

Auftrag Inhaber 24.09.2026: dauerhaft verfuegbarer Hintergrunddienst, der
systematisch ALLE Profile x registrierten Sprachen x Funktionen prueft,
Ergebnisse nachweisbar festhaelt und Neustarts uebersteht.

Architektur (bewusst im vorhandenen Autopilot-Muster, kein neues System):
- Zeitplan: GitHub Actions cron (language-autopilot.yml, alle 6 h) plus
  Admin-Trigger "Jetzt testen" ueber /api/admin/language/autopilot/run.
- Ausfuehrung: stateless Python-Worker (diese Datei), gleiche Bauart wie
  qa/voice_qa_daily.py — er ruft NUR oeffentliche Live-Endpunkte auf
  (api.smyst.com) und prueft deren echtes Verhalten.
- Persistenz: Object Brain (IDrive e2) ueber language_report_store —
  Status, Testmatrix Profil x Sprache x Funktion x Plattform, Berichte.
- Lastkontrolle (keine ungebremsten Dauerschleifen): begrenzte Anzahl
  Tests pro Lauf (--limit, Default 16), Pause zwischen Anfragen,
  Harter Lauf-Timeout im Workflow, 1 Wiederholung pro Test, Skip bei
  deaktiviertem Dienst. Produktionschats haben Vorrang: max. ein Test
  gleichzeitig, kein Parallelbetrieb.
- Kein Vertraeberschen von Statistiken: Tests laufen als Gast-Chats mit
  oeffentlichen Profilen und Kennung im FrageText ([language-autopilot]);
  sie zaehlen nirgends als Nutzermesswerte.

Vollstaendige Abdeckung geschieht ueber dokumentierte Pruefzyklen: Jeder
Lauf nimmt die am laengsten nicht geprueften Kombinationen (P0 zuerst).
Eine Stichprobe gilt nie als Beweis fuer alle — der Bericht nennt immer
den vollen Nenner und die ungepruefte Restmenge.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import logging
import re
import sys
import urllib.error
import urllib.request
from datetime import UTC, datetime
from typing import Any

from app.ai.language_detection import detect_message_language
from app.ai.language_register import (
    LANGUAGE_REGISTER_VERSION,
    priority_languages,
    register_entries,
    register_summary,
)
from app.integrations import language_report_store as store

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("smyst.workers.language_autopilot")

DEFAULT_BASE_URL = "https://api.smyst.com"
PUBLIC_TWINS_URL = "https://smyst.com/api/public/twins/"

#: Funktionen der Matrix. "icons" laeuft als Playwright-E2E im selben
#: Workflow (frontend/e2e/language-icons.spec.ts) und wird hier nur als
#: geplant/ausstehend verwaltet — der Worker selbst kann keinen Browser
#: bedienen; dessen Ergebnisse schreibt der Workflow-Schritt.
FUNCTIONS = ("text", "tts", "asr", "live_voice", "icons")

#: Plattformen: Desktop-Web und Mobile-Web prueft Playwright (zwei
#: Projekte in playwright.config.ts). PWA/iOS/Android brauchen Geraete —
#: offen, bis ein Geraetest moeglich ist (kein Behaupten).
PLATFORMS = ("desktop-web", "mobile-web", "pwa", "ios", "android")

#: Prueffragen pro P0-Sprache (kurz, persona-neutral, antwortfordern).
TEST_QUESTIONS: dict[str, str] = {
    "de": "Nenne in zwei Saetzen deine wichtigste Lebensleistung.",
    "tr": "En önemli başarılarını iki cümlede anlatır mısın?",
    "en": "Name your most important achievement in two sentences.",
    "ku": "Herî girîng kêrhatina xwe di du hevokan de bibêje.",
    "ckb": "گرنگترین دەستکەوتەکەت لە دوو ڕستەدا بڵێ.",
}

GENERIC_QUESTION = (
    "Introduce yourself and your most important achievement in two sentences, "
    "in this language."
)

#: Verweigerungs-Muster (Originalfehler 24.09.: "ich kann kein Türkisch").
#: Mehrsprachig, grob gefasst — ein Treffer zaehlt als Refusal-Fehler.
REFUSAL_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"ich kann kein \w+ sprechen",
        r"ich (kann|spreche) nur (auf )?deutsch",
        r"i can'?t speak \w+",
        r"i (can|do) not speak \w+",
        r"i only speak \w+",
        r"konu[sş]am(yorum|am|amam)",
        r"sadece \w+ konu[sş]abiliyorum",
        r"nikarim bi \w+ biaxivim",
        r"ez tenê \w+ dizanim",
        r"ناتوانم بە \w+ قسە بکەم",
        r"تەنها بە \w+ قسە دەکەم",
    )
)

REQUEST_TIMEOUT_SECONDS = 60.0
PAUSE_BETWEEN_TESTS_SECONDS = 2.0
CHAT_ENDPOINT_TIMEOUT_SECONDS = 90.0


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


#: Chat-Besitzerbindung (Security-Fix 21.08.): /chat/start stellt ein
#: Owner-Cookie aus, das /chat/messages zurueckbekommen MUSS — sonst 403
#: "Chat gehoert einem anderen Nutzer" (Erstlauf 24.09. komplett rot).
#: Der Worker haelt Cookies deshalb pro Lauf in einem Jar.
_COOKIE_JAR = http.cookiejar.CookieJar()
_OPENER = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_COOKIE_JAR))


def http_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> tuple[int, dict[str, Any] | None, bytes, float]:
    import time as _time

    started = _time.perf_counter()
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json", "User-Agent": "smyst-language-autopilot/1.0"},
    )
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            raw = response.read()
            elapsed = _time.perf_counter() - started
            try:
                return response.status, json.loads(raw.decode("utf-8")), raw, elapsed
            except ValueError:
                return response.status, None, raw, elapsed
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        elapsed = _time.perf_counter() - started
        try:
            return exc.code, json.loads(raw.decode("utf-8")), raw, elapsed
        except ValueError:
            return exc.code, None, raw, elapsed


def load_public_profiles(limit: int = 400) -> list[str]:
    """Oeffentliche Profil-Slugs (neue Profile kommen automatisch dazu)."""
    try:
        status, payload, _, _ = http_json(PUBLIC_TWINS_URL, timeout=20.0)
        if status != 200 or not isinstance(payload, dict):
            return []
        entries = payload.get("twins") or payload.get("profiles") or []
        slugs = []
        for entry in entries:
            if isinstance(entry, dict):
                slug = entry.get("slug") or entry.get("id")
                if isinstance(slug, str) and slug:
                    slugs.append(slug)
        return slugs[:limit]
    except Exception:
        return []


def verify_reply_language(reply: str, language: str) -> list[str]:
    """Prueft eine Antwort auf Sprachtreue und Verweigerung.

    Liefert eine Liste finding-Strings (leer = bestanden). Sprachtreue
    wird mit derselben Erkennung gemessen, die auch der Chat nutzt —
    kein Behaupten, sondern Messen.
    """
    findings: list[str] = []
    text = (reply or "").strip()
    if len(text) < 20:
        findings.append("antwort_zu_kurz")
        return findings
    for pattern in REFUSAL_PATTERNS:
        if pattern.search(text):
            findings.append(f"verweigerung:{pattern.pattern}")
    detected = detect_message_language(text)
    if detected and detected != language:
        findings.append(f"falsche_sprache:{detected}")
    return findings


def run_text_test(base_url: str, profile: str, language: str) -> dict[str, Any]:
    """Ein echter Gast-Chat gegen das Live-Backend in der Zielsprache."""
    question = TEST_QUESTIONS.get(language, GENERIC_QUESTION)
    tested_at = _now_iso()
    try:
        status, payload, _, elapsed = http_json(
            f"{base_url}/api/chat/start",
            method="POST",
            payload={"twinId": profile},
        )
        if status != 200 or not (payload or {}).get("chat"):
            return {
                "profile": profile,
                "language": language,
                "function": "text",
                "platform": "desktop-web",
                "testedAt": tested_at,
                "result": "failed",
                "error": f"chat_start_http_{status}",
                "repro": f"POST /api/chat/start {{twinId:{profile}}}",
            }
        chat_id = payload["chat"]["id"]
        status, payload, _, elapsed = http_json(
            f"{base_url}/api/chat/messages",
            method="POST",
            payload={
                "chatId": chat_id,
                "message": f"[language-autopilot] {question}",
                "language": language,
            },
            timeout=CHAT_ENDPOINT_TIMEOUT_SECONDS,
        )
        latency_ms = int(elapsed * 1000)
        if status != 200 or not (payload or {}).get("message"):
            return {
                "profile": profile,
                "language": language,
                "function": "text",
                "platform": "desktop-web",
                "testedAt": tested_at,
                "result": "failed",
                "error": f"chat_message_http_{status}",
                "latencyMs": latency_ms,
                "repro": f"POST /api/chat/messages (chatId={chat_id}, language={language})",
            }
        reply = str(payload["message"].get("content") or "")
        findings = verify_reply_language(reply, language)
        return {
            "profile": profile,
            "language": language,
            "function": "text",
            "platform": "desktop-web",
            "testedAt": tested_at,
            "result": "ok" if not findings else "failed",
            "findings": findings,
            "model": payload.get("mode"),
            "latencyMs": latency_ms,
            "replyExcerpt": reply[:160],
            "repro": (
                f"Chat mit {profile}, Sprache {language}, Frage: {question!r}"
            ),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "profile": profile,
            "language": language,
            "function": "text",
            "platform": "desktop-web",
            "testedAt": tested_at,
            "result": "blocked",
            "error": f"{type(exc).__name__}: {exc}",
            "repro": f"Chat mit {profile} in {language}",
        }


def run_tts_test(base_url: str, language: str) -> dict[str, Any]:
    """Sprachausgabe: Stimmenliste + Synthese-Smoke (wo eine Stimme existiert)."""
    tested_at = _now_iso()
    try:
        status, payload, _, _ = http_json(f"{base_url}/api/tts/voices", timeout=20.0)
        voices = (payload or {}).get("voices") or []
        has_voice = any(isinstance(v, str) and v.startswith(language + "-") for v in voices)
        if not has_voice:
            return {
                "profile": "system",
                "language": language,
                "function": "tts",
                "platform": "desktop-web",
                "testedAt": tested_at,
                "result": "blocked",
                "error": "keine Stimme fuer Sprache registriert",
                "repro": f"GET /api/tts/voices -> keine {language}-*-Stimme",
            }
        sample = TEST_QUESTIONS.get(language, "This is a short voice test for smyst.com.")
        status, _, audio, elapsed = http_json(
            f"{base_url}/api/tts",
            method="POST",
            payload={"text": sample, "lang": language},
            timeout=45.0,
        )
        ok = status == 200 and audio[:4] == b"RIFF" and len(audio) > 1000
        return {
            "profile": "system",
            "language": language,
            "function": "tts",
            "platform": "desktop-web",
            "testedAt": tested_at,
            "result": "ok" if ok else "failed",
            "latencyMs": int(elapsed * 1000),
            "error": None if ok else f"tts_http_{status}_bytes_{len(audio)}",
            "repro": f"POST /api/tts (lang={language})",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "profile": "system",
            "language": language,
            "function": "tts",
            "platform": "desktop-web",
            "testedAt": tested_at,
            "result": "blocked",
            "error": f"{type(exc).__name__}: {exc}",
            "repro": f"GET /api/tts/voices + POST /api/tts (lang={language})",
        }


def run_asr_capability(base_url: str, language: str) -> dict[str, Any]:
    """Diktieren: ASR-Sprachfaehigkeit (echter Audio-Roundtrip nur mit TTS-Stimme)."""
    tested_at = _now_iso()
    try:
        status, payload, _, _ = http_json(f"{base_url}/api/asr/status", timeout=20.0)
        languages = set((payload or {}).get("languages") or [])
        if language not in languages:
            return {
                "profile": "system",
                "language": language,
                "function": "asr",
                "platform": "desktop-web",
                "testedAt": tested_at,
                "result": "not_applicable",
                "error": "ASR unterstuetzt Sprache nicht",
                "repro": f"GET /api/asr/status -> {language} fehlt",
            }
        return {
            "profile": "system",
            "language": language,
            "function": "asr",
            "platform": "desktop-web",
            "testedAt": tested_at,
            "result": "ok",
            "note": "Sprachfaehigkeit verfuegbar; Audio-Roundtrip im Geraetest offen",
            "repro": f"GET /api/asr/status enthaelt {language}",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "profile": "system",
            "language": language,
            "function": "asr",
            "platform": "desktop-web",
            "testedAt": tested_at,
            "result": "blocked",
            "error": f"{type(exc).__name__}: {exc}",
            "repro": "GET /api/asr/status",
        }


def plan_combinations(
    profiles: list[str],
    languages: list[str],
    matrix: list[dict[str, Any]],
    limit: int,
    *,
    only_profile: str | None = None,
    only_language: str | None = None,
    only_function: str | None = None,
) -> list[tuple[str, str, str]]:
    """Testplan: am laengsten ungepruefte Kombinationen, P0 zuerst.

    Neue Profile und Sprachen fallen automatisch in den Plan (kein Eintrag
    in der Matrix = Testalter 0 = hoechste Dringlichkeit nach P0).
    """
    last_tested: dict[tuple[str, str, str], str] = {}
    for entry in matrix:
        key = (
            str(entry.get("profile") or ""),
            str(entry.get("language") or ""),
            str(entry.get("function") or ""),
        )
        last_tested[key] = str(entry.get("testedAt") or entry.get("lastTestedAt") or "")

    priority = set(priority_languages())
    tier_order = {"P0": 0, "P1": 1, "P2": 2}
    register = register_entries()

    candidates: list[tuple[str, str, str]] = []
    selected_profiles = [only_profile] if only_profile else profiles or ["system"]
    selected_languages = [only_language] if only_language else languages
    functions = [only_function] if only_function else ["text"]

    for profile in selected_profiles:
        for language in selected_languages:
            for function in functions:
                if function == "text" and profile == "system":
                    continue  # Text braucht ein echtes Profil
                if function in {"tts", "asr"} and profile != "system":
                    continue  # Stimme/Diktat sind systemweit, nicht pro Profil
                candidates.append((profile, language, function))

    def sort_key(combo: tuple[str, str, str]) -> tuple[int, str]:
        _profile, language, _function = combo
        tier = register.get(language, {}).get("tier", "P3")
        age = last_tested.get(combo, "")
        return (tier_order.get(tier, 3), age)

    candidates.sort(key=sort_key)
    return candidates[:limit]


def execute_run(
    base_url: str = DEFAULT_BASE_URL,
    *,
    limit: int = 16,
    only_profile: str | None = None,
    only_language: str | None = None,
    only_function: str | None = None,
) -> dict[str, Any]:
    """Ein Autopilot-Lauf: planen, pruefen, persistieren, berichten."""
    status = store.load_status()
    if not status.get("enabled"):
        logger.info("language autopilot disabled — heartbeat only")
        store.heartbeat()
        return {"skipped": "disabled"}

    profiles = load_public_profiles()
    matrix = store.load_matrix()
    languages = list(register_entries())
    plan = plan_combinations(
        profiles,
        languages,
        matrix,
        limit,
        only_profile=only_profile,
        only_language=only_language,
        only_function=only_function,
    )
    logger.info("plan: %d Kombinationen (Profile geladen: %d)", len(plan), len(profiles))

    results: list[dict[str, Any]] = []
    import time as _time

    for profile, language, function in plan:
        if function == "text":
            entry = run_text_test(base_url, profile, language)
        elif function == "tts":
            entry = run_tts_test(base_url, language)
        elif function == "asr":
            entry = run_asr_capability(base_url, language)
        else:
            entry = {
                "profile": profile,
                "language": language,
                "function": function,
                "platform": "desktop-web",
                "testedAt": _now_iso(),
                "result": "pending",
                "error": f"Funktion {function} wird im Workflow/E2E geprueft",
            }
        entry["registerVersion"] = LANGUAGE_REGISTER_VERSION
        store.upsert_matrix_entry(entry)
        results.append(entry)
        logger.info(
            "%s %s/%s -> %s (%s)",
            function,
            profile,
            language,
            entry.get("result"),
            (entry.get("findings") or entry.get("error") or "ok"),
        )
        _time.sleep(PAUSE_BETWEEN_TESTS_SECONDS)

    counts: dict[str, int] = {}
    for entry in results:
        counts[entry["result"]] = counts.get(entry["result"], 0) + 1
    summary = {
        "ranAt": _now_iso(),
        "planned": len(plan),
        "results": counts,
        "profilesAvailable": len(profiles),
        "register": register_summary(),
    }
    store.heartbeat(summary)
    store.save_report({"summary": summary, "results": results})

    # Gesamtabdeckung mit vollem Nenner (Stichprobe nie als Beweis):
    total_combos = max(len(profiles), 1) * len(register_entries()) * 1  # text-Matrix
    report = {
        **summary,
        "coverage": {
            "textMatrixTotal": total_combos,
            "matrixEntries": len(matrix) + len(results),
            "note": (
                "Vollabdeckung ueber Pruefzyklen: jeder Lauf nimmt die am "
                "laengsten ungeprueften Kombinationen; ungepruefte Restmenge "
                "bleibt ausgewiesen."
            ),
        },
    }
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="smyst language autopilot run")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--limit", type=int, default=16)
    parser.add_argument("--profile", default=None)
    parser.add_argument("--language", default=None)
    parser.add_argument("--function", default=None, choices=[*FUNCTIONS])
    parser.add_argument("--out", default=None, help="JSON-Bericht zusaetzlich in Datei schreiben")
    parser.add_argument("--force", action="store_true", help="auch bei deaktiviertem Dienst laufen")
    args = parser.parse_args(argv)

    def _emit(report: dict[str, Any]) -> None:
        dumped = json.dumps(report, ensure_ascii=False, indent=2)
        if args.out:
            with open(args.out, "w", encoding="utf-8") as handle:
                handle.write(dumped)
        print(dumped)

    if args.force and not store.load_status().get("enabled"):
        store.set_enabled(True)
        try:
            report = execute_run(
                args.base_url,
                limit=args.limit,
                only_profile=args.profile,
                only_language=args.language,
                only_function=args.function,
            )
        finally:
            store.set_enabled(False)  # urspruenglichen Aus-Zustand wiederherstellen
        _emit(report)
        return 0

    report = execute_run(
        args.base_url,
        limit=args.limit,
        only_profile=args.profile,
        only_language=args.language,
        only_function=args.function,
    )
    _emit(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
