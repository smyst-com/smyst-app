#!/usr/bin/env python3
"""SECURITY-Autopilot: nicht-destruktive Black-Box-Probe gegen Produktion.

Prueft rund um die Uhr, dass die Sicherheitsmechanismen der Haertungs-Runden
(28./29.09.2026) UNVERAENDERT wirken — gegen smyst.com und api.smyst.com.

Bewusst NICHT getestet (destruktiv/ressourcenverbrennend):
- Login-Drossel-Dauerfeuer (sperrt eigene Runner-IP)
- Upload-Stress, Chat-Flut, Admin-Login-Versuche.

Ergebnis: .security/live_probe.json mit je Check {name, ok, detail}.
"""

from __future__ import annotations

import json
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / ".security" / "live_probe.json"
WEB = "https://smyst.com"
API = "https://api.smyst.com"
UA = {"User-Agent": "smyst-security-probe/1.0 (+authorized)"}


def _request(url: str, method: str = "GET", body: bytes | None = None, headers: dict | None = None, timeout: float = 30):
    request = urllib.request.Request(url, data=body, method=method, headers={**UA, **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers or {}), error.read() if error.fp else b""
    except Exception as error:  # noqa: BLE001 — Netzwerkfehler sind ein Pruefergebnis
        return 0, {}, str(error).encode()


def _check(results: list, name: str, ok: bool, detail: str) -> None:
    results.append({"name": name, "ok": bool(ok), "detail": detail[:220]})
    print(("OK  " if ok else "FAIL") + f" {name}: {detail[:120]}")


def main() -> int:
    results: list[dict] = []

    # --- Erreichbarkeit ---
    status, _, _ = _request(f"{WEB}/")
    _check(results, "website_up", status == 200, f"smyst.com -> {status}")
    status, _, _ = _request(f"{API}/api/v1/health/live")
    _check(results, "api_up", status == 200, f"health/live -> {status}")

    # --- Authorization-Guards (alles 401 erwartet) ---
    for path in (
        "/api/v1/admin/overview",
        "/api/v1/admin/users",
        "/api/v1/security/audit/recent",
        "/api/v1/health/deep",
        "/api/v1/health/production",
        "/api/v1/storage/capabilities",
        "/api/v1/web-research/run",
    ):
        method = "POST" if "web-research" in path else "GET"
        body = b'{"question":"probe"}' if method == "POST" else None
        status, _, _ = _request(API + path, method=method, body=body, headers={"Content-Type": "application/json"})
        expected = 401 if method == "POST" or True else 401
        _check(results, f"guard_{path.rsplit('/', 1)[-1]}", status == 401, f"anon {method} -> {status}")

    # --- Gefaelschte Admin-Tokens abgewiesen ---
    status, _, _ = _request(
        f"{API}/api/v1/admin/overview",
        headers={"Authorization": "Bearer v1.eyJyb2xlcyI6WyJhZG1pbiJdfQ.forged"},
    )
    _check(results, "forged_token_rejected", status == 401, f"-> {status}")

    # --- API-Angriffsflaeche ---
    status, _, body = _request(f"{API}/api/v1/openapi.json")
    _check(results, "openapi_hidden", status == 404, f"-> {status}")

    status, _, body = _request(f"{API}/api/v1/ai/providers")
    try:
        fields = sorted(json.loads(body)["providers"][0].keys())
    except Exception:
        fields = []
    _check(results, "providers_redacted", fields == ["configured", "provider", "supported"], f"Felder: {fields}")

    status, _, _ = _request(f"{API}/api/v1/ai/providers?ping=true")
    _check(results, "providers_ping_gated", status == 403, f"anon ping -> {status}")

    status, _, _ = _request(
        f"{API}/api/v1/ads/impression",
        method="POST",
        body=b'{"slug":"../../etc/passwd"}',
        headers={"Content-Type": "application/json"},
    )
    _check(results, "ads_slug_validated", status == 400, f"boeser Slug -> {status}")

    # --- Security-Header ---
    _, headers, _ = _request(f"{API}/api/v1/health/live")
    _check(results, "hsts_present", any(k.lower() == "strict-transport-security" for k in headers), "HSTS auf api.smyst.com")
    _check(results, "csp_present", any(k.lower() == "content-security-policy" for k in headers), "CSP auf api.smyst.com")
    _check(results, "nosniff_present", any(k.lower() == "x-content-type-options" for k in headers), "nosniff")

    # --- Frontend-Schutz ---
    status, _, body = _request(f"{WEB}/anti-frame.js")
    _check(results, "anti_frame_script", status == 200 and b"window.top" in body, f"-> {status}")

    # --- TTS (Pflicht-Smoke) ---
    status, _, body = _request(f"{API}/api/v1/tts/voices", timeout=60)
    try:
        ready = json.loads(body).get("ready") is True
        voices = len(json.loads(body).get("voices", []))
    except Exception:
        ready, voices = False, 0
    _check(results, "tts_ready", status == 200 and ready and voices > 0, f"ready={ready} voices={voices}")

    # --- Session-Revocation lebt (Kanarienvogel ohne Konto) ---
    status, _, body = _request(
        f"{API}/api/v1/auth/logout-all", method="POST", body=b"{}", headers={"Content-Type": "application/json", "X-Smyst-CSRF": "1"}
    )
    try:
        mode = json.loads(body).get("mode")
    except Exception:
        mode = None
    _check(results, "session_revocation_live", status == 200 and mode in {"no-session", "revoked-server-side"}, f"mode={mode}")

    # --- Gast-Chat: echte Antwort (2 Versuche, Kaltstart-fenster) ---
    chat_ok, chat_detail = False, "keine Antwort"
    for attempt in (1, 2, 3):
        status, _, body = _request(
            f"{API}/api/v1/chat/messages",
            method="POST",
            body=json.dumps({"chatId": f"security-probe-{int(time.time())}", "message": "Kurzer Satz ueber Neugier, bitte.", "language": "de"}).encode(),
            headers={"Content-Type": "application/json"},
            timeout=150,
        )
        try:
            data = json.loads(body)
            content = str((data.get("message") or {}).get("content") or "")
            degraded = "nicht auf mein Wissen" in content or "Ich kann gerade" in content
            chat_ok = status == 200 and bool(content) and not degraded
            chat_detail = f"Versuch {attempt}: mode={data.get('mode')} Antwort={content[:60]!r}"
        except Exception as error:
            chat_detail = f"Versuch {attempt}: parse-fehler {type(error).__name__}"
        if chat_ok:
            break
        time.sleep(60)
    _check(results, "guest_chat_real_answer", chat_ok, chat_detail)

    # --- Canary-Honeypot: Anzahl Treffer (0 = gut) ---
    status, _, body = _request(f"{API}/api/v1/security/canary/status")
    canary_count = -1
    try:
        canary_count = int(json.loads(body).get("count", -1))
    except Exception:
        pass
    _check(results, "canary_clean", status == 200 and canary_count == 0, f"status={status} count={canary_count}")

    failed = [r for r in results if not r["ok"]]
    report = {
        "probedAtUtc": datetime.now(timezone.utc).isoformat(),
        "targets": {"web": WEB, "api": API},
        "checksTotal": len(results),
        "checksFailed": len(failed),
        "results": results,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
    print(f"\nLIVE-PROBE: {len(results) - len(failed)}/{len(results)} Checks OK")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
