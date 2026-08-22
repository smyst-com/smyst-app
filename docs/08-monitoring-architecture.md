# 08 Monitoring Architecture

> **Status: ueberholtes Zielbild.** Dieses Dokument beschreibt eine geplante
> Architektur aus der Free-only-Phase (Cloudflare Pages/Workers/KV, Salad), die
> so nie gebaut wurde. Es ist KEINE Beschreibung des Live-Systems.
> Verbindlich sind `docs/ARCHITECTURE.md`, `docs/INFRA_SETUP.md`,
> `docs/07-deployment-architecture.md` und `docs/FREE_ONLY_DATA_MAP.md`.
> Eingeordnet am 2026-08-20.

## Ziel

Smyst muss frueh messbar sein: Verfuegbarkeit, Latenz, Fehler, Security-Ereignisse, Storage-Nutzung und Nutzerfluesse.

## Production-Regel

Monitoring darf in der Free-Only-Phase keinen externen SaaS-Dienst voraussetzen.

Erlaubt:

- Cloudflare Dashboards und Worker-Logs im Free-Rahmen.
- GitHub Actions Logs.
- Lokale Build- und Smoke-Test-Ausgaben.
- Leichte Audit-/Statusobjekte in IDrive e2 oder IDrive e2.

Nicht als Pflicht erlaubt:

- Analytics-SaaS.
- bezahltes Monitoring.
- eigene Server-Metriksysteme.
- datenbankbasierte Health Checks.

## Wichtige Messpunkte

- Pages build success.
- Worker deploy success.
- Auth callback success.
- Upload signed URL latency.
- Upload quota rejection count.
- Storage object size.
- Translation cache hit/miss.
- Client-side performance budget.

## Health Checks

Free-Only Health Checks pruefen:

- statische Pages-Dateien,
- `manifest.webmanifest`,
- `robots.txt`,
- `sitemap.xml`,
- `llms.txt`,
- Worker-Endpunkte fuer Auth und Storage.

## Skalierungsnotiz

Globale Milliarden-Nutzer-SLOs bleiben Zielwerte, aber kostenlose Kontingente koennen diese Last nicht garantieren. Monitoring muss diese Grenze transparent machen.

