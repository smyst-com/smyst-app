# smyst.com Sprachregister (Language Register)

**Version:** 1.0.0 · **Stand:** 24.09.2026 · **Quelle der Maschine:** `backend/app/ai/language_register.py`

## Weltumfang und Quelle

Ethnologue: Languages of the World, **29. Auflage 2026** — **7.170 lebende Sprachen**
(https://www.ethnologue.com/faq/how-many-languages/). Zum Vergleich zaehlt
Glottolog ~7.900 Eintraege (andere Klassifikationsmethodik); smyst.com
dokumentiert Ethnologue als Primaerquelle. Der Restumfang
(7.170 − 54 = **7.116 Sprachen**) ist registrierter **Zielumfang und ausdruecklich
ungetestet** — keine Behauptung von Unterstuetzung.

## Registerstruktur

Das Register ist die DEFINITION des Pruefumfangs (was getestet werden soll).
Testergebnisse pflegt der Language-Autopilot in der Testmatrix (Object Brain,
`language-autopilot/matrix/`). **Registriert heisst nicht funktionierend** —
eine Sprache gilt erst als unterstuetzt, wenn der Autopilot die Funktion
nachweislich bestanden hat.

Jeder Eintrag: Code (BCP-47-Basis), englischer + einheimischer Name, Schrift
(ISO 15924), Tier, Sprachfamilie, Schreibrichtung (RTL/LTR).

### P0 — Prioritaetssprachen (Auftrag Inhaber 24.09.2026)

| Code | Sprache | Schrift | Familie | Besonderheit |
|------|---------|---------|---------|--------------|
| de | Deutsch (German/Deutsch) | Latn | Indogermanisch > Germanisch | Live-Modell smyst-1.1 primaer |
| tr | Türkçe (Turkish) | Latn | Turkisch > Oghusisch | Auslöser des Live-Fehlers 24.09. |
| en | English | Latn | Indogermanisch > Germanisch | smyst-1.1 mit abgedeckt |
| ku | Kurdî/Kurmancî (Kurmandschi) | Latn | Iranisch > Nordwest | eigene Wortmarker (fiel vorher durch) |
| ckb | کوردیی سۆرانی (Sorani) | Arab (RTL) | Iranisch > Nordwest | Schriftstufe: ڵ/ڕ/ە/ۆ/ێ unterscheidet von Hocharabisch |

### P1 — Voice-/UI-Matrix (15 Sprachen)

zh, es, ar, fr, pt, ru, ja, ko, it, hi, id, bn (zuzügl. de/tr/en aus P0).
Diese Sprachen haben UI-, ASR- und TTS-Anbindung (`SUPPORTED_ASR_LANGS`,
`REQUIRED_VOICE_LANGUAGES`).

### P2 — Ausbaustufe nach Sprecherzahl (37 Sprachen)

nl, pl, uk, ro, el, hu, cs, sv, da, fi, he, fa, ur, pa, ta, te, mr, gu, vi,
th, sw, am, ha, yo, ig, zu, ps, az, kk, uz, ka, hy, my, km, ne, si, tl.
Text-Chat zuerst; ASR/TTS kommen erst mit Stimmen/Modellfaehigkeit.

### P3 — Rest des Ethnologue-Umfangs

7.116 weitere lebende Sprachen: Zielumfang, ungetestet, keine Behauptung.

## Prueffunktionen pro Sprache (getrennt erfasst)

1. **Text** verstehen und beantworten (Chat-Endpoint, Sprache gemessen)
2. **Diktieren** (ASR: `GET /api/asr/status` + Audioroundtrip wo Stimme existiert)
3. **Vorlesen** (TTS: Stimmenliste + Synthese-Smoke, WAV/Latenz)
4. **Durchgängiges Sprachgespräch** (Live-Modus: E2E + Geraetetest offen)
5. **Schrift, Sonderzeichen, Schreibrichtung** (Script-Erkennung, RTL-Profile)
6. **Verwendetes Modell + Testabdeckung** (mode/provider je Matrix-Eintrag)

Ergebniswerte: `ok` · `failed` · `blocked` (Infra fehlt, z. B. keine Stimme) ·
`not_applicable` · `pending`/ungeprueft.

## Nicht anwendbar / offen (ehrlich ausgewiesen)

- **Gebaerdensprachen** (DGS, ASL, TID u. a.): kein Audio-/Text-Pfad — eigene
  Verfahren (Video/Avatar) noetig, als offen markiert.
- **Sprachen ohne standardisierte Schrift**: Audio-Tests n/a, Text n/a.
- **TTS ausserhalb de/en/tr + 12 Worker-Sprachen**: keine Stimme → blocked,
  bis Stimmen freigegeben sind (GPU-Worker-Reaktivierung braucht Inhaber-
  Freigabe, Paid-Service).
- **Geraetetests (iOS/Android/PWA, echtes Mikrofon/Lautsprecher)**: im
  Headless-Browser nicht nachweisbar → ausstehend, nicht behauptet.

## Aenderungsschutz

Register, Erkennung (`app/ai/language_detection.py`) und Routing-Config
(`SMYST_LLM_LANGUAGES`) stehen unter dem PAUSCHALSCHUTZ der AGENTS.md:
Aenderungen nur mit schriftlicher Freigabe des Inhabers (Adam King).
Register-Aktualisierung (neue Ethnologue-Ausgabe, neue getestete Sprachen)
erfolgt ueber PR mit dokumentierter Quelle — Version hochzaehlen.
