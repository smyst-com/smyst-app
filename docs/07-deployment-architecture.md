# 07 Deployment Architecture

## Ziel

Zielarchitektur mit GitHub Free fuer Repository/Versionierung/Releases, Spaceship als Registrar/Domain-Sicherheitsanker, IDrive e2 fuer 99 % aller Speicheraufgaben und Salad fuer echte Rechenarbeit. Cloudflare ist aktuell aktiver Uebergang fuer DNS, Pages, TLS, Proxy und Workers, weil Cloudflare Pages Apex-Domains und Worker-Routes Cloudflare-Nameserver benoetigen.

Die Betriebsarchitektur beschreibt eine Free-only-MVP-Plattform. Milliarden Nutzer pro Tag sind mit dieser Vorgabe nicht erreichbar und bleiben eine Langfristvision, nicht die Leistungszusage der Free-only-Phase.

## Umgebungen

- `local`: Entwicklerrechner.
- `preview`: lokale Builds, GitHub-Artefakte und bei Bedarf temporaere Cloudflare Pages Preview Deployments.
- `production`: Aktuell Cloudflare DNS + Pages + Workers fuer Live-Betrieb; Ziel bleibt IDrive e2 fuer statische Dateien und Salad fuer dynamische API/Rechenarbeit, sobald diese Teile produktionsreif sind.

## Services in Production

- Spaceship: Registrar, Domain-Besitz, Nameserver-Verwaltung und Domain-Sicherheit.
- GitHub Free: Code, Versionierung, Releases, Issues und Dokumentation.
- IDrive e2: Dateien, Medien, App-/PWA-Dateien, statische Website-Dateien, KI-Daten, Wissensdaten, Backups, Archive, Exporte und private signierte Dateien.
- Salad: API, KI-Antwortgenerierung, Verarbeitung, Suche, Indexierung, Embeddings, RAG, Cronjobs und Batch-Jobs bei Bedarf.
- Cloudflare: aktueller Uebergang fuer DNS, Pages, Workers, TLS und Proxy.

Nicht erlaubt in Production:

- GitHub als Hauptspeicher fuer Medien, Modelle, App-Dateien oder Backups.
- IDrive e2 als Ersatz fuer Login-System, Live-Datenbank, Echtzeit-Chat, Zahlungen, Nutzer-Sessions, Berechtigungspruefung, API-Logik, KI-Antwortgenerierung, Suchberechnung oder Live-Admin-Dashboard.
- Salad als dauerhafte Hauptspeicherung sensibler Daten.
- API-Keys oder Secrets im Repository.

## GitHub Actions

Pipelines:

- PR: install, lint, typecheck, tests, build.
- Main/manual release: build artifacts, publish static files to IDrive e2 or temporary Cloudflare Pages, and publish dynamic compute to Salad or temporary Cloudflare Workers.
- Nightly jobs nur wenn sie innerhalb kostenloser GitHub-Actions-Limits bleiben.

Secrets:

- Cloudflare token nur solange Cloudflare-Uebergang aktiv ist.
- IDrive e2 credentials.
- Salad credentials, sobald Salad produktiv genutzt wird.
- GitHub OAuth credentials, falls GitHub OAuth genutzt wird.
- Keine AI-provider-, DeepL-, Google-Translate-, VPS- oder Datenbank-Secrets.

## Release-Prozess

1. PR erstellen.
2. CI besteht.
3. Review.
4. Merge nach `main`.
5. GitHub Actions baut Artefakte.
6. Statische Artefakte nach IDrive e2 oder uebergangsweise Cloudflare Pages veroeffentlichen.
7. Dynamische API/Rechenjobs ueber Salad oder uebergangsweise Cloudflare Workers veroeffentlichen.
8. Health Checks pruefen.
9. Smoke Test fuer `smyst.com`, `app.smyst.com`, `api.smyst.com`, `cdn.smyst.com`, `media.smyst.com`, `admin.smyst.com` und `assets.smyst.com`.

## Rollback

- Vor riskanten Releases KV-/Konfigurationszustand dokumentieren.
- IDrive-e2-Release-Dateien und Rollback-Artefakte versionieren.
- Vorherige statische Builds, Salad-Job-Versionen und uebergangsweise Cloudflare Pages/Worker-Versionen behalten.
- Feature Flags fuer riskante Funktionen.

## Free-only Regeln

- Keine Secrets im Repository.
- `.env.production` nicht committen.
- Keine Workflows, die kostenpflichtige Dienste voraussetzen.
- Uebergangsweise Cloudflare Workers-, KV- und Pages-Limits beachten, solange Cloudflare aktiv ist.
- Uploads stoppen, bevor IDrive e2 kostenpflichtig wird.
- Keine externen Uebersetzungs-, AI-, Analytics- oder Monitoring-APIs.

## Skalierungspfad

Stufe 1:

- PWA, oeffentliche Profile, statische Inhalte und IDrive-e2-Speicher. Cloudflare liefert aktuell live aus, bleibt aber Uebergang.

Stufe 2:

- Login, Nutzerprofile, Uploads, private Dateien und signierte URLs.

Stufe 3:

- KI-Chat, RAG, Profilwissen, Suchindex und Embeddings ueber vorbereitete Daten in IDrive e2 und Rechenarbeit ueber Salad.

Stufe 4:

- iOS-, Android- und Huawei-App anbinden.

Stufe 5:

- Globale Edge-Router.
- Regionale API-Cluster.
- Regionale Datenschutz-Partitionen.
- Multi-Provider-AI-Routing.
- Getrennte Realtime-, Upload-, Retrieval- und Admin-Kapazitaeten.
- Disaster-Recovery-Regionen mit getesteten Restore-Prozessen.
- SLO-basierte Autoskalierung und Lasttests gegen realistische Chat-, Upload- und Search-Muster.
