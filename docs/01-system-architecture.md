# 01 System Architecture

## Ziel

Smyst ist eine Plattform fuer digitale KI-Zwillinge. Nutzer laden Wissen, Gedanken, Erfahrungen, Dokumente, Bilder, Audio und Video hoch. Daraus entsteht ein KI-Zwilling, der spaeter in Gesprächen persoenlich, kontextbewusst und sicher antwortet.

## Systemgrenzen

In Scope:

- Nutzerkonten, Auth, Profile.
- Twin-Erstellung und Twin-Verwaltung.
- Uploads, Parsing, Embeddings und Memory-Aufbau.
- Chat mit Streaming-Antworten.
- Suche ueber Profile, Twins, Inhalte und Erinnerungen.
- Admin, Moderation, Audit und Monitoring.

Globale Zielanforderung:

- Smyst muss langfristig Web, PWA, iPhone, Android und zukuenftige Plattformen mit demselben API-Kern bedienen.
- Die Architektur haelt das Milliarden-Nutzer-Ziel als Langfristvision fest. Die aktuelle Free-only-Betriebsstufe ist jedoch ein MVP und keine Milliarden-Nutzer-Infrastruktur.
- Chat-Interaktionen sind der kritischste Echtzeitpfad und werden getrennt von langsamer Verarbeitung optimiert.
- AI-Provider, Storage, Compute und Retrieval bleiben konzeptionell austauschbar. In der Free-only-Phase sind aber keine kostenpflichtigen Zusatzdienste erlaubt.

Out of Scope fuer das Fundament:

- Landing Page.
- Design System.
- PWA-Optimierung.
- Native App-Neubau.
- Monetarisierung im ersten technischen Gate.

## Komponenten

```text
Client Layer
  Web/PWA on Cloudflare Pages Free
  Existing Capacitor shells for iOS/Android

Edge Layer
  Cloudflare DNS, TLS, CDN, WAF baseline on Free plan
  Static asset caching
  Basic bot and rate protections

API Layer
  Cloudflare Workers Free
  Auth, storage, free-only chat/API, language routing and upload signing

Domain Services
  Worker modules for auth, storage, chat/API, translation/static language routing and metadata

AI Services
  Static/demo responses in Free-only phase
  No paid external AI provider

Data Layer
  Cloudflare Workers KV Free for small metadata and sessions
  IDrive e2 object storage with hard quota before paid usage

Operations
  GitHub Actions
  Cloudflare Pages/Workers deployment
  Cloudflare Free analytics/observability only where available
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
Client -> Cloudflare Worker: POST /storage/upload-url
Worker -> KV: store upload intent, quota counters and user upload index
Worker -> IDrive e2: create signed upload URL
Client -> IDrive e2: upload file directly
Client -> Cloudflare Worker: POST /storage/upload-complete
Worker -> KV: mark upload as uploaded
```

### Chat Flow

```text
Client -> Cloudflare Worker: POST /api/chat/start
Worker -> KV: store lightweight session state
Client -> Cloudflare Worker: POST /api/chat/messages
Worker -> KV: store small chat state
Worker -> Client: static/free-only response without external model API
```

## Startarchitektur vs. Zielarchitektur

Start:

- Cloudflare Pages Free fuer Web/PWA.
- Cloudflare Workers Free fuer API/Auth/Upload-Signing.
- Cloudflare KV Free fuer kleine Metadaten und Sessions.
- IDrive e2 fuer Objekt-Speicher, mit harter Kostenbremse.
- GitHub Free fuer Repository, Dokumentation und CI/CD.

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

- Cloudflare Workers sind in der Free-only-Phase der Systemkern.
- Langsame Aufgaben verlassen sofort den Request-Pfad.
- Es gibt keine Production-Abhaengigkeit auf PostgreSQL, pgvector, Redis, VPS oder FastAPI.
- Alle AI-Antworten muessen auf Berechtigungen, Moderation und Quellenlogik Ruecksicht nehmen.
- Der Chat-Pfad wird so kurz wie moeglich gehalten: Auth, Permission, Retrieval, Routing, Streaming.
- Kein langsamer Upload-, Parsing-, Embedding- oder Twin-Build-Schritt darf den Chat-Pfad blockieren.
