# 09 Folder Structure

> **Status: ueberholtes Zielbild.** Dieses Dokument beschreibt eine geplante
> Architektur aus der Free-only-Phase (Cloudflare Pages/Workers/KV, Salad), die
> so nie gebaut wurde. Es ist KEINE Beschreibung des Live-Systems.
> Verbindlich sind `docs/ARCHITECTURE.md`, `docs/INFRA_SETUP.md`,
> `docs/07-deployment-architecture.md` und `docs/FREE_ONLY_DATA_MAP.md`.
> Eingeordnet am 2026-08-20.

Status: Free-Only-Struktur fuer Phase 1.

## Aktive Production-Pfade

```text
/.github/workflows
/src
/public
/workers
/docs
/scripts
/config
/ios
/android
```

## Verantwortlichkeiten

### /src

Vite/React/TypeScript-App fuer Web, PWA und Capacitor WebView. UI, Chat-MVP, Twin-Auswahl, Auth-Client, Upload-Client, i18n und mobile Interaktion leben hier.

### /public

Statische Production-Dateien fuer GitHub Pages: Manifest, Service Worker, Offline-Seite, SEO-Dateien, lokale Uebersetzungen, Icons und statische Landingpages.

### /workers

Cloudflare-Worker-Code fuer API, Auth, Storage/IDrive-e2-Signing, statische Translation, Chat-MVP, Security Headers, CORS, Rate Limits und Validierung.

### /.github/workflows

GitHub-Free-CI und Cloudflare-Deployment. Workflows duerfen keine bezahlten Dienste und keine alte Server-Infrastruktur voraussetzen.

### /docs

Verbindliche Architektur, Free-Only-Runbooks, Datenschutz, Security, Performance, SEO, Native-App-Notizen und Langfristvision.

### /scripts

Lokale Checks, Foundation-Validatoren, Preflight- und Smoke-Test-Hilfen. Production-Skripte muessen Cloudflare/GitHub/IDrive-e2-kompatibel bleiben.

### /config

Nicht geheime Konfiguration und Beispielwerte. Secrets gehoeren in Cloudflare/GitHub Secrets, nicht ins Repository.

### /ios und /android

Capacitor-Native-Shells. Sie duerfen keine bezahlten externen SDKs oder Pflichtdienste voraussetzen.

## Legacy-Referenzpfade

Diese Ordner duerfen im Repository bleiben, sind aber keine Production-Pflicht:

```text
/backend
/database
/vector
/docker
/ai
/monitoring
```

Sie dienen als lokale Experimente, Domain-Modelle oder historische Implementierungsreferenzen. Kein Deployment-Runbook und kein CI-Gate darf sie als Voraussetzung fuer Production behandeln.

## Neue Features

Neue Production-Features werden zuerst in `src`, `public`, `workers`, `docs`, `scripts` oder `config` eingeordnet. Wenn ein Feature einen Server, eine Datenbank, eine Queue, einen Cache oder externe AI/Translation/Analytics braucht, ist es nicht Teil von Phase 1.
