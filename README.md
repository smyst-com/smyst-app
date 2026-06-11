# smyst.com

smyst.com ist eine Free-Only-MVP-Plattform fuer digitale KI-Zwillinge.

## Production-Regel

Production verwendet ausschliesslich:

- GitHub.com Free fuer Code, Pull Requests, Dokumentation und GitHub Actions.
- Cloudflare.com Free fuer DNS, TLS, CDN, Pages, Workers, KV, Caching und Edge-Auslieferung.
- IDrive e2 als zentralen S3-kompatiblen Speicher fuer Dateien, Medien, Dokumente, Uploads, Backups und Twin-Daten, nur mit harten Quotas und Kostenbremse.

Keine Production-Funktion darf einen kostenpflichtigen Zusatzdienst voraussetzen.

## Phase 1

Phase 1 ist ein Free-Only-MVP. Die Milliarden-Nutzer-Skalierung ist die Langfristvision und kein Leistungsversprechen der kostenlosen Infrastruktur.

## Aktiver Stack

- Frontend: Vite, React, TypeScript, PWA, Capacitor.
- Hosting: Cloudflare Pages Free.
- API: Cloudflare Workers Free.
- Kleine Daten: Cloudflare KV Free.
- Dateien und Backups: IDrive e2.
- Mehrsprachigkeit: statische Dateien im Repository.
- Chat: regelbasierter oder simulierter Twin-MVP ohne externe AI-Pflicht.

## Wichtige Dokumente

- `docs/ARCHITECTURE.md`
- `docs/FREE_ONLY_INFRASTRUCTURE.md`
- `docs/FREE_ONLY_DATA_MAP.md`
- `docs/FREE_ONLY_SECURITY_PRIVACY.md`
- `docs/FREE_ONLY_PERFORMANCE_MOBILE.md`
- `docs/FREE_ONLY_NATIVE_APPS.md`
- `docs/LEGACY_LOCAL_REFERENCES.md`
- `SETUP.md`

## Production-Datenablage

- GitHub: Code und Dokumentation.
- Cloudflare Pages: statisches Web/PWA-Artefakt.
- Cloudflare Workers: API, Auth, Upload-Signing, Chat-MVP und Security.
- Cloudflare KV: Sessions, Rollen, Quotas, Upload-Status und kleine Metadaten.
- IDrive e2: Bilder, Videos, Audio, Dokumente, Profilbilder, Backups und Twin-Kontextdaten.

## Lokale Referenzen

Einige Ordner enthalten historische oder experimentelle Arbeit. Sie duerfen lokal nuetzlich bleiben, sind aber keine Production-Pflicht.

Production-Workflows muessen immer gegen die Free-Only-Regel validiert werden.
