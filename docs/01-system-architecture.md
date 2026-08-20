# 01 System Architecture

Stand: 2026-08-20. Beschreibt den Live-Stand.

## Ziel

smyst.com ist eine Plattform fuer digitale KI-Zwillinge. Nutzer laden Wissen, Gedanken, Erfahrungen, Dokumente, Bilder, Audio und Video hoch. Daraus entsteht ein KI-Zwilling, der spaeter in Gesprächen persoenlich, kontextbewusst und sicher antwortet.

## Systemgrenzen

In Scope:

- Nutzerkonten, Auth, Profile.
- Twin-Erstellung und Twin-Verwaltung.
- Uploads, Parsing, Embeddings und Memory-Aufbau.
- Chat mit Streaming-Antworten.
- Suche ueber Profile, Twins, Inhalte und Erinnerungen.
- Admin, Moderation, Audit und Monitoring.

Globale Zielanforderung:

- smyst.com muss langfristig Web, PWA, iPhone, Android und zukuenftige Plattformen mit demselben API-Kern bedienen.
- Die Architektur haelt das Milliarden-Nutzer-Ziel als Langfristvision fest. Die aktuelle Betriebsstufe - ein Backend-Container plus Objektspeicher - ist ein kleiner Produktivbetrieb und keine Milliarden-Nutzer-Infrastruktur.
- Chat-Interaktionen sind der kritischste Echtzeitpfad und werden getrennt von langsamer Verarbeitung optimiert.
- AI-Provider, Storage, Compute und Retrieval bleiben austauschbar. Neue kostenpflichtige Anbieter brauchen eine Freigabe und einen Eintrag in `docs/FREE_ONLY_INFRASTRUCTURE.md`.

Out of Scope fuer das Fundament:

- Landing Page.
- Design System.
- PWA-Optimierung.
- Native App-Neubau.
- Monetarisierung im ersten technischen Gate.

## Komponenten

```text
Client Layer
  Web/PWA on GitHub Pages (smyst.com, app., cdn.)
  Existing Capacitor shells for iOS/Android

Edge Layer
  Spaceship DNS
  GitHub Pages TLS and static caching

API Layer
  Zeabur - smyst-backend (FastAPI) on api.smyst.com
  Auth, storage signing, chat, search, TTS/ASR, admin

Domain Services
  Backend modules under backend/app/api, /ai, /services, /workers

AI Services
  OpenRouter for the live twin chat
  Groq free tier first for pipeline, QA and evals
  Deterministic crisis guard in front of every model call

Data Layer
  IDrive e2 object storage - users, chats, feedback, pipeline artefacts,
  uploads and backups as JSON/objects
  No PostgreSQL and no Redis in production

Operations
  GitHub Actions for CI, cron pipelines, quality loop and deploys
  GitHub Pages deploy for the frontend
  Zeabur auto-deploy for the backend
```

## Domain Boundaries

- `/auth`: Identity, sessions, OAuth, passwordless login, MFA later.
- `/twins`: Twin profiles, visibility, persona config, lifecycle.
- `/uploads`: Upload records, file state, processing status.
- `/storage`: Signed URLs, object keys, retention and lifecycle.
- `/ai`: Parsing, embeddings, retrieval, model routing, evaluations.
- `/chat`: Sessions, messages, streaming, memory citations.
- `/search`: Hybrid search, filters, public discovery.
- `/admin`: Users, flags, audits, moderation, system status.
- `/security`: policies, threat models, abuse controls, privacy controls.
- `/monitoring`: logs, metrics, traces, health checks, dashboards.

## Laufzeit-Flows

### Upload Flow

```text
Client  -> Backend: POST /storage/upload-url
Backend -> checks session, role, visibility, mime, size and quota
Backend -> IDrive e2: create signed upload URL
Client  -> IDrive e2: upload file directly
Client  -> Backend: POST /storage/upload-complete
Backend -> IDrive e2: verify object via HEAD, persist status object
```

### Chat Flow

```text
Client  -> Backend: POST /api/chat/...
Backend -> IDrive e2: load twin context and chat archive
Backend -> crisis guard, moderation, retrieval
Backend -> LLM provider chain (OpenRouter, fallback order per settings)
Backend -> Client: answer with sources
Backend -> IDrive e2: append chat archive and feedback objects
```

Faellt die gesamte Provider-Kette aus, antwortet ein deterministischer
Not-Fallback (`mode=local`). Das ist ein Stoerungssignal, kein Normalbetrieb.

## Startarchitektur vs. Zielarchitektur

Aktuell:

- GitHub Pages fuer Web/PWA.
- Zeabur fuer API, Auth, Chat, TTS/ASR und Upload-Signing.
- IDrive e2 fuer Objekt-Speicher und Datenhaltung, mit harter Kostenbremse.
- GitHub Free fuer Repository, Dokumentation und CI/CD.
- OpenRouter und Groq fuer LLM-Inferenz.

Ziel:

- Getrennte API-, Worker-, Datenbank- und AI-Kapazitaeten.
- Multi-Region Routing.
- Separierte Storage-Tiers.
- Regionale Datenschutz-Zonen.
- Dedizierte Vektor- und Retrieval-Infrastruktur.
- Globale Low-Latency-Chat-Pfade mit Streaming und Fallback-Modellen.
- Provider-unabhaengige AI-Orchestrierung fuer Gemini, Claude, Grok, DeepSeek, Kimi, Manus, Mistral und weitere Modelle.
- Regionale Read/Write-Strategien fuer Datenschutz und Performance.
- Automatische Degradation: reduzierte Antworttiefe ist besser als Ausfall, sofern Sicherheit und Datenschutz erhalten bleiben.

## Architekturentscheidungen

- Der Backend-Container auf Zeabur ist der Systemkern; GitHub Pages liefert nur Statisches aus.
- Langsame Aufgaben verlassen sofort den Request-Pfad und laufen als GitHub-Actions-Cronjobs.
- Es gibt keine Production-Abhaengigkeit auf PostgreSQL, pgvector, Redis oder einen eigenen VPS. Persistenz laeuft ausschliesslich ueber IDrive-e2-Objekte.
- Alle AI-Antworten muessen auf Berechtigungen, Moderation und Quellenlogik Ruecksicht nehmen.
- Der Chat-Pfad wird so kurz wie moeglich gehalten: Auth, Permission, Retrieval, Routing, Streaming.
- Kein langsamer Upload-, Parsing-, Embedding- oder Twin-Build-Schritt darf den Chat-Pfad blockieren.
