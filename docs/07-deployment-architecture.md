# 07 Deployment Architecture

## Ziel

Start mit GitHub Free fuer Repository/CI, Cloudflare Free fuer DNS/TLS/CDN/Pages/Workers/KV und IDrive e2 fuer Object Storage. Kostenpflichtige Zusatzdienste sind nicht erlaubt.

Die Betriebsarchitektur beschreibt eine Free-only-MVP-Plattform. Milliarden Nutzer pro Tag sind mit dieser Vorgabe nicht erreichbar und bleiben eine Langfristvision, nicht die Leistungszusage der Free-only-Phase.

## Umgebungen

- `local`: Entwicklerrechner.
- `preview`: Cloudflare Pages Preview Deployments.
- `production`: Cloudflare Pages + Cloudflare Workers Free.

## Services in Production

- Cloudflare Pages: Web/PWA.
- Cloudflare Workers: API, Auth, Upload-Signing, einfache Metadatenlogik.
- Cloudflare Workers KV: Sessions, kleine Metadaten, einfache Indexe.
- IDrive e2: Dateien, Medien, Dokumente, Backups.

Nicht erlaubt in Production:

- VPS/Server.
- Docker Compose.
- PostgreSQL, pgvector, Redis.
- FastAPI als Server-Backend.
- Caddy/Traefik als eigener Reverse Proxy.
- Prometheus/Grafana/Loki als gehostete oder eigene Zusatzdienste.

## GitHub Actions

Pipelines:

- PR: install, lint, typecheck, tests, build.
- Main/manual release: deploy Cloudflare Pages and Workers.
- Nightly jobs nur wenn sie innerhalb kostenloser GitHub-Actions-Limits bleiben.

Secrets:

- Cloudflare token.
- IDrive e2 credentials.
- GitHub OAuth credentials, falls GitHub OAuth genutzt wird.
- Keine AI-provider-, DeepL-, Google-Translate-, VPS- oder Datenbank-Secrets.

## Release-Prozess

1. PR erstellen.
2. CI besteht.
3. Review.
4. Merge nach `main`.
5. GitHub Actions baut Artefakte.
6. Deployment auf Cloudflare Pages/Workers.
7. Health Checks pruefen.
8. Smoke Test.
9. Cloudflare Free Observability pruefen, soweit verfuegbar.

## Rollback

- Vor riskanten Releases KV-/Konfigurationszustand dokumentieren.
- Cloudflare Deployments versionieren.
- Vorherige Pages/Worker-Version behalten.
- Feature Flags fuer riskante Funktionen.

## Free-only Regeln

- Keine Secrets im Repository.
- `.env.production` nicht committen.
- Keine Workflows, die kostenpflichtige Dienste voraussetzen.
- Workers Request-, KV- und Pages-Limits beachten.
- Uploads stoppen, bevor IDrive e2 kostenpflichtig wird.
- Keine externen Uebersetzungs-, AI-, Analytics- oder Monitoring-APIs.

## Skalierungspfad

Stufe 1:

- Cloudflare Pages Free, Workers Free, KV Free, IDrive e2 mit harter Kostenbremse.

Stufe 2:

- Mehr statische Inhalte, manuelle Uebersetzungen, bessere Worker-Kapselung.
- Strenge Quotas und Degradation, bevor Free-Limits erreicht werden.

Stufe 3:

- Nur nach neuer Entscheidung: kostenpflichtige Infrastruktur waere fuer echte Skalierung noetig, ist in dieser Vorgabe aber nicht erlaubt.

Stufe 4:

- Nicht Teil der aktuellen Free-only-Vorgabe.
- Echte Multi-Region-, Datenbank-, Vektor- und AI-Infrastruktur erfordert eine neue Freigabe, weil sie nicht kostenlos realistisch ist.

Stufe 5:

- Globale Edge-Router.
- Regionale API-Cluster.
- Regionale Datenschutz-Partitionen.
- Multi-Provider-AI-Routing.
- Getrennte Realtime-, Upload-, Retrieval- und Admin-Kapazitaeten.
- Disaster-Recovery-Regionen mit getesteten Restore-Prozessen.
- SLO-basierte Autoskalierung und Lasttests gegen realistische Chat-, Upload- und Search-Muster.
