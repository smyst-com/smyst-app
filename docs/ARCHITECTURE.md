# smyst.com Active Architecture

Stand: 2026-08-20. Status: verbindliche Beschreibung des Live-Systems.

## Grundregel

Production verwendet ausschliesslich:

- GitHub Free fuer Code, Issues, Pull Requests, Dokumentation und Actions.
- GitHub Pages fuer die Auslieferung von Website und PWA.
- Zeabur fuer das Backend `smyst-backend` unter `api.smyst.com`.
- IDrive e2 als S3-kompatiblen Speicher - zugleich die Datenhaltung des
  Backends.
- OpenRouter (Live-Chat) und Groq (Pipeline, QA, Evals) fuer LLM-Inferenz.
- Spaceship fuer Domain und DNS.
- Resend fuer E-Mail, optional ueber `RESEND_API_KEY`.

Alle anderen Server-, Datenbank-, Cache-, Uebersetzungs-, Analytics- oder
Monitoring-Dienste sind keine Production-Abhaengigkeit. Die vollstaendige
Anbieterliste mit Kosten steht in `docs/FREE_ONLY_INFRASTRUCTURE.md`.

## Zielbild

```text
Web / PWA / Capacitor iOS / Capacitor Android
        |
        | HTTPS
        v
GitHub Pages
        |
        +--> statisches Vite/React-Frontend
        +--> Manifest, Service Worker, SEO-Dateien
        +--> prerenderte oeffentliche Profile /t/{slug}
        +--> statische JSON-API dist/api/public/twins/
        |
        | fetchService (src/lib/serviceEndpoints.ts)
        v
Zeabur - smyst-backend (FastAPI, api.smyst.com)
        |
        +--> Auth und Sessions (Google OAuth, signiertes HttpOnly-Cookie)
        +--> API fuer Profile, Twins, Chat, Suche und Admin
        +--> TTS (Piper im Container) und ASR (Whisper small im Container)
        +--> Upload-Signing und Storage-Gates
        +--> Security Headers, CORS, Rate Limits
        |
        +--> OpenRouter / Groq
        |    LLM-Inferenz mit Provider-Kette und Fallback
        |
        +--> IDrive e2
             Nutzer, Chats, Feedback, Profile, Pipeline-Artefakte,
             Dateien, Medien, Backups
```

## Datenablage

- GitHub: Quellcode, Dokumentation, statische Uebersetzungsdateien,
  CI/CD-Konfiguration.
- GitHub Pages: gebautes Frontend, PWA-Artefakte, prerenderte Profilseiten,
  statische SEO/AEO/GEO-Dateien.
- Zeabur: nur Laufzeit und Service-Variablen, keine dauerhafte Datenhaltung.
- IDrive e2: alles Dauerhafte - Nutzerdokumente, Chat-Archive, Feedback,
  Pipeline-Status, Uploads, Backups.

Es gibt keine relationale Datenbank und keinen Redis in Production. Details in
`docs/FREE_ONLY_DATA_MAP.md`.

## Upload Flow

```text
Client
  -> fragt das Backend nach einem Upload-Intent
Backend
  -> prueft Session, Rolle, Sichtbarkeit, Dateityp, Dateigroesse und Quota
  -> erstellt kurzlebige IDrive-e2-Signatur
Client
  -> laedt direkt zu IDrive e2 hoch
Backend
  -> bestaetigt Upload per HEAD/Metadatenpruefung
  -> schreibt Status und sichere Metadaten als JSON-Objekt nach IDrive e2
```

Clients erhalten niemals permanente Storage Keys.

## Auth

Aktiv:

- Google OAuth ueber `GET /auth/google/start` und
  `GET /auth/google/callback`, danach ein HttpOnly Secure SameSite
  Session-Cookie.
- `GET /auth/me` liefert den Session-Kontrakt fuer das Frontend.
- `POST /auth/logout` und `POST /auth/logout-all`.

Cross-Origin-Hinweis: `smyst.com` (GitHub Pages) und `api.smyst.com` (Zeabur)
sind verschiedene Origins. Jeder Frontend-Aufruf mit Session braucht
`credentials: 'include'` und muss ueber `fetchService` laufen.

## KI-Antworten

Der Chat laeuft ueber eine Provider-Kette mit Fallback
(`backend/app/ai/llm_router.py`, `provider_catalog.py`). Live-Chat nutzt
OpenRouter; Pipeline, QA und Evals starten bei Groq (Free-Tier). Faellt die
gesamte Kette aus, antwortet ein deterministischer Not-Fallback
(`mode=local`) - das ist ein sichtbares Stoerungssignal, kein Normalbetrieb.

Vor jedem Modellaufruf greift eine deterministische Krisen-Schutzschicht.

## Sprachsystem

Sprachausgabe und Diktat sind in AGENTS.md unter Funktions-Freeze gestellt.

- Piper-TTS mit 13 kuratierten Stimmen (DE/EN/TR) liegt im Backend-Image.
- Whisper `small` (int8) liegt ebenfalls im Image, fuer Server-Diktat ohne
  Kaltstart-Download.
- Weitere Sprachen brauchen einen externen Voice-Worker ueber
  `VOICE_WORKER_URL`/`VOICE_WORKER_TOKEN`. Diese Variablen fehlen aktuell auf
  Zeabur, daher fallen 12 von 15 Sprachen auf eine englische Ersatzstimme.
- Pflicht-Smoke nach jedem Backend-Deploy: `GET /api/tts/voices` muss 200 mit
  `ready:true` liefern.

## Performance

- statisches Frontend ueber GitHub Pages,
- kleine JS-Bundles und lazy geladene UI,
- lokale/statische Uebersetzungen,
- Service Worker fuer App-Shell und Offline-Fallback,
- prerenderte Profilseiten statt API-Roundtrip beim ersten Aufruf,
- klare Timeouts pro Provider in der LLM-Kette,
- harte Upload- und Storage-Limits.

## Sicherheit

Pflicht fuer alle Production-Pfade:

- sichere Headers und CSP,
- strenge CORS-Regeln (`CORS_ORIGINS`),
- CSRF-Schutz fuer Cookie-basierte Mutationen,
- Input-Validation und Rate Limits,
- Upload-Dateityp- und Groessenpruefung,
- private Sichtbarkeit als Standard,
- Prompt-Injection-Markierung in der Web-Recherche,
- keine Secrets im Repository.

## SEO, AEO, GEO und KI-Suche

`robots.txt`, `sitemap.xml`, `llms.txt`, OpenGraph, Twitter Cards,
Schema.org/JSON-LD, statische mehrsprachige Landingpages und SEO-freundliche
oeffentliche Twin-URLs. Private Profile und private Uploads duerfen nicht
indexierbar sein.

## Skalierungsrealitaet

Die Architektur haelt Modulgrenzen sauber, damit spaeter horizontal erweitert
werden kann. Ein einzelner Backend-Container plus Objektspeicher garantiert
aber keine Milliarden Nutzer pro Tag.

Langfristige globale Skalierung erfordert eigene Entscheidungen zu
Datenbanken, AI-Inferenz, Realtime, Observability, Multi-Region-Betrieb,
Kostenkontrolle und Compliance. Diese Entscheidungen sind nicht Teil des
aktuellen Aufbaus.
