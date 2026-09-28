# Security-Audit & Haertung smyst.com — 28.09.2026 (PR #869)

Master-Auftrag Inhaber: smyst.com vollstaendig absichern (pruefen → beheben →
testen → deployen → live pruefen).Dieser Bericht dokumentiert Fund, Fix, Test
und Live-Nachweis je Massnahme.

## Umfang der Pruefung

- Statische Audits: alle 34 Backend-Routen, Frontend (src, public, dist),
  59 GitHub-Workflows, Docker, Scripts
- Secret-Scan: gitleaks 8.24.3 ueber 227 Commits + Arbeitskopie
- Dependency-Scans: npm audit (prod) = 0, pip-audit (uv.lock Export) = 0
- Live-Checks: TLS/Redirects, Header, CORS-Reflexion, Admin-Endpunkte (12x 401),
  Token-Forging-Versuche (401), OpenAPI-Exposition
- Pro Aktivitaet: vollautonom; Deploy via PR #869 (Merge 2459269)

## Gefunden → Behoben → Getestet

| # | Bereich | Schwere | Fund | Fix (Datei) | Test |
|---|---|---|---|---|---|
| 1 | API | P0 | /security/* (Consent/Loeschung/Audit) komplett ohne Auth, beliebige user_id aus Body | Admin-Guard (security.py) | test_security_hardening.py (4 Tests) |
| 2 | Ads | P0 | /ads/impression: beliebige Slugs → Payout-Inflation | Slug-Regex + Normalisierung (ads.py) | 2 Tests |
| 3 | API | P1 | Cookie-Session SameSite=None ohne zentralen CSRF-Schutz (auch admin_language) | CookieCsrfMiddleware (middleware.py), FE-Header an 5 Stellen | 4 Tests + Suite |
| 4 | SSRF | P1 | social_links: Redirects umgingen IP-Validierung | manueller Hop-Validator (social_links.py) | 1 Test |
| 5 | XSS | P1 | Twin-Bild-URLs/-Keys ohne Schema-Filter (javascript: speicherbar) | _clean_image_url/_key + avatar._clean | 2 Tests |
| 6 | Info-Disclosure | P1 | /ai/providers leakt Env-Namen/Basis-URLs, Ping anonym ausloesbar | Redaction + Admin/OIDC-Gate (ai.py) | 3 Tests |
| 7 | Info-Disclosure | P1 | /health/deep+/production, /storage/capabilities anonym | Auth-Guards | 3 Tests |
| 8 | Kosten-DoS | P1 | /web-research/run + Suggestions anonym (Provider-Quota) | Session-Pflicht | 2 Tests |
| 9 | Resource-DoS | P1 | ASR/TTS/Visits/Login ohne Pfad-Limits, 3x-Rate-Budget durch Triple-Mount | PATH_RATE_LIMITS + Pfad-Normalisierung (middleware.py) | 2 Tests |
| 10 | Audit-Poisoning | P1 | CSP-Report unbegrenzt speicherbar | 8KB-Deckel (security.py) | Suite |
| 11 | Open Redirect | P2 | Stripe success_url via Origin-Header fremd steuerbar | Origin-Allowlist (billing.py) | 1 Test |
| 12 | Header | P2 | HSTS fehlte hinter Zeabur-Proxy (scheme=http) | app_env-Bedingung (middleware.py) | Live-Nachweis |
| 13 | Info-Disclosure | P2 | /api/v1/openapi.json in Produktion 200 | openapi_url=None in prod (main.py) | 1 Test |
| 14 | XSS (FE) | P2 | nutzer-/LLM-kontrollierte hrefs ungefiltert (SocialLinks, Quell-Chips) | safeHref-Util (src/lib/safeUrl.ts + 4 Stellen) | tsc/build |
| 15 | Clickjacking | P2 | GH Pages kann keine frame-ancestors-Header | /anti-frame.js + Einbindung index.html | Live-Nachweis |
| 16 | Supply Chain | P1 | 119/119 Actions unpinned (Tag-Hijack = RCE mit Secrets) | alle auf Commit-SHAs gepinnt | CI gruen |
| 17 | Supply Chain | P1 | eval.yml: 9 Provider-Keys an pull_request-Code | if-Gate auf nicht-PR | CI gruen |
| 18 | Supply Chain | P1 | 3 Smoke-Workflows ohne Auth auf Ping (nach Fix 6) | GitHub-OIDC-Bearer (3 Workflows) | Workflow-Lauf |
| 19 | Login | P2 | /auth/email/login nur 120/min global | 10/min Pfad-Limit | 1 Test |

## Verifizierung (Nachweise)

- pytest: **731 passed, 3 skipped** (26 neue Security-Regressionstests:
  backend/tests/test_security_hardening.py)
- npm run build gruen (tsc + vite + Sitemap), 3 Guards gruen
- Freeze-Marker alle vorhanden: playRemoteSpeech/stopRemoteSpeech/
  unlockAudioPlayback, tts_router/public_twins_router, resolve_chat_language,
  _ordered_providers, admin_language_router, language-autopilot.yml,
  select_shard_documents, qa_attempts, refresh_published_summary,
  AUTOPILOT_DAILY_TARGET
- gitleaks: 18 Treffer = Test-Fixtures (8-Zeichen-Testpasswoerter), 0 echte
  Secrets in 227 Commits; keine Rotation noetig
- Live (nach Deploy): siehe Abschlussbericht im Chat + Memory_Bank

## Nicht geaendert (bewusst, Freeze/Verhaeltnismaessigkeit)

- llm_router.py, tts.py, start-llm.sh, Dockerfile (Freezes unberuehrt)
- Startseiten-Design: nur unsichtbare Attribut-/Script-Aenderungen
- Session-Tokens bleiben stateless 30d (Rest-Risiko, siehe unten)

## Verbleibende Risiken (ehrlich)

1. **Session-Revocation**: Tokens sind stateless (HMAC), logout loescht nur
   Cookie/Bearer-Speicher; ein gestohlener Token bleibt bis Ablauf gueltig.
   Behebung = serverseitige Session-Store (groeserer Umbau; bewusst nicht in
   dieser Runde). Mitigation: 30d-Ablauf, keine Sensitivdaten im Token-Payload.
2. **localStorage-Token**: Durch Safari-ThirdParty-Cookie-Block erzwungen;
   XSS waere noetig (kein Sink gefunden, CSP script-src 'self'), aber
   Design-Schuld.
3. **Zeabur-Dashboard**: GraphQL-API verlangt jetzt Browser-Session-Verifiktion
   (ERROR_SESSION_FORBIDDEN) — Redeploy nur per UI-Klick moeglich (dokumentiert).
4. **autopilot-approve-all.yml**: Storage-Secrets + dispatch bleibt eine
   bewusste Admin-Fallback-Leine; Schutz nur Confirm-String. Empfehlung:
   GitHub-Environment mit Reviewern einrichten (nur Inhaber, UI-Aktion).
5. **Pages-Header**: GitHub Pages setzt keine Security-Header; Meta-CSP +
   Framebuster sind die maximal moegliche Mitigation auf dieser Infra.
