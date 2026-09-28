#!/usr/bin/env python3
"""Security-Freeze-Guard (Release-Schutz, 28.09.2026).

Sichert die zentralen Mechanismen der Security-Haertungs-Runde (PR #869)
gegen versehentliches Entfernen durch spaetere Commits ab — analog zu den
bestehenden Design-/Funktions-Guards. Laeuft in der Foundation-CI bei jedem
PR und Push auf main.

Preventing quiet removal of: CSRF-Middleware, Pfad-Rate-Limits,
Mount-Normalisierung, HSTS-Produktionssetzung, OpenAPI-prod-Verbergung,
Security-Endpunkt-Guards, Slug-/Bild-URL-/Redirect-/Origin-Filter,
safeHref, anti-frame, Secret-Gating in eval.yml, Action-SHA-Pinning,
Security-Regressionstests.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CHECKS: list[tuple[str, Path, str]] = [
    ("CSRF-Middleware registriert", ROOT / "backend/app/main.py", "CookieCsrfMiddleware"),
    ("OpenAPI in Produktion deaktiviert", ROOT / "backend/app/main.py", 'openapi_url=None'),
    ("CSRF-Middleware-Klasse", ROOT / "backend/app/security/middleware.py", "class CookieCsrfMiddleware"),
    ("Pfad-Rate-Limits aktiv", ROOT / "backend/app/security/middleware.py", "PATH_RATE_LIMITS"),
    ("Triple-Mount-Normalisierung", ROOT / "backend/app/security/middleware.py", "def normalize_request_path"),
    ("HSTS in Produktion", ROOT / "backend/app/security/middleware.py", 'app_env == "production"'),
    ("Security-Endpunkte admin-geguardde", ROOT / "backend/app/api/v1/routes/security.py", "_require_admin"),
    ("CSP-Report-Deckel", ROOT / "backend/app/api/v1/routes/security.py", "CSP_REPORT_MAX_CHARS"),
    ("Ads-Slug-Validierung", ROOT / "backend/app/api/v1/routes/ads.py", "SLUG_PATTERN"),
    ("Provider-Privilegien-Gate", ROOT / "backend/app/api/v1/routes/ai.py", "_is_privileged"),
    ("Deep-Health-Admin-Guard", ROOT / "backend/app/api/v1/routes/health.py", "_require_admin"),
    ("Billing-Origin-Allowlist", ROOT / "backend/app/api/v1/routes/billing.py", "_safe_checkout_origin"),
    ("SSRF-Redirect-Validierung", ROOT / "backend/app/api/v1/routes/social_links.py", "_redirect_target_allowed"),
    ("Twin-Bild-URL-Filter", ROOT / "backend/app/api/v1/routes/user_mvp.py", "_clean_image_url"),
    ("Storage-Capabilities-Guard", ROOT / "backend/app/api/v1/routes/storage.py", "auth_required"),
    ("WebResearch-Session-Guard", ROOT / "backend/app/api/v1/routes/web_research.py", "_require_session"),
    ("Security-Regressionstests vorhanden", ROOT / "backend/tests/test_security_hardening.py", "test_cookie_post_without_csrf_header_is_blocked"),
    ("Frontend-safeHref", ROOT / "src/lib/safeUrl.ts", "export function safeHref"),
    ("safeHref in App.tsx genutzt", ROOT / "src/App.tsx", "safeHref("),
    ("safeHref in SocialLinksCard genutzt", ROOT / "src/components/SocialLinksCard.tsx", "safeHref("),
    ("Anti-Frame-Skript vorhanden", ROOT / "public/anti-frame.js", "window.top"),
    ("Anti-Frame eingebunden", ROOT / "index.html", "anti-frame.js"),
    ("eval.yml: Keys nicht an PRs", ROOT / ".github/workflows/eval.yml", "github.event_name != 'pull_request'"),
]

UNPINNED_USES = re.compile(r"uses:\s*[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+@(?!([0-9a-f]{40}))[\w.-]+")


def main() -> int:
    failures: list[str] = []

    for name, path, marker in CHECKS:
        if not path.exists():
            failures.append(f"FEHLT: {name} — Datei {path.relative_to(ROOT)} existiert nicht")
            continue
        if marker not in path.read_text(encoding="utf-8", errors="ignore"):
            failures.append(f"ENTFERNT: {name} — Marker '{marker}' fehlt in {path.relative_to(ROOT)}")

    # Alle Workflows: keine unversionierten Action-Referenzen (SHA-Pinning)
    unpinned: list[str] = []
    for yml in sorted((ROOT / ".github/workflows").glob("*.yml")):
        for lineno, line in enumerate(yml.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if UNPINNED_USES.search(line):
                unpinned.append(f"{yml.name}:{lineno}")
    if unpinned:
        failures.append("UNPINNED: Actions ohne SHA-Pinning: " + ", ".join(unpinned[:10]))

    if failures:
        print("security freeze guard FAILED:")
        for failure in failures:
            print(" -", failure)
        return 1
    print("security freeze guard passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
