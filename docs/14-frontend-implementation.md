# 14 Frontend Implementation

> Status: Partially superseded. UI notes remain useful; backend endpoint references are legacy only unless they target Salad API in the Free-Only architecture.

Status: UI-Referenz. Die aktive Production-App ist die Vite/React/PWA-App im Repository-Root und laeuft ueber IDrive e2 static hosting Free.

## Implementiert

- Startseite als produktiver App-Einstieg.
- Twin-Auswahl.
- Chat UI mit lokaler Demo-Konversation.
- Profile Panel fuer ausgewaehlten Twin.
- Twin Creator Formular als nicht-persistenter Entwurf.
- Mehrsprachigkeit fuer `de`, `en`, `tr`, `fr`, `es`, `pt`, `ar`, `zh`, `ja`, `ko`.
- Lokalisierte Routen unter `/{locale}`.
- SEO Metadata, alternates, sitemap und robots.
- PWA Manifest.
- Service Worker Registrierung.
- SVG App Icon.

## Dateien

- `frontend/app/[locale]/page.tsx`
- `frontend/components/smyst-app.tsx`
- `frontend/components/pwa-register.tsx`
- `frontend/lib/i18n.ts`
- `frontend/lib/demo-data.ts`
- `frontend/app/globals.css`
- `frontend/app/manifest.ts`
- `frontend/app/robots.ts`
- `frontend/app/sitemap.ts`
- `frontend/public/sw.js`
- `frontend/public/icon.svg`

## Entscheidungen

- Die aktive UI lebt im Vite/React-Root-Projekt.
- `/frontend` bleibt historische Referenz, solange sie nicht Free-Only-kompatibel migriert ist.
- Schreibende Aktionen sind noch nicht mit Backend-APIs verbunden.
- Chat-Antworten sind lokal simuliert, bis Legacy edge provider-Worker-Chat- und Free-Only-Twin-Kontext-Endpunkte produktiv angeschlossen sind.
- Twin Creator speichert noch nicht persistent.
- Mehrsprachigkeit startet mit 10 statischen Sprachen, weil externe Uebersetzungsdienste keine Production-Pflicht sein duerfen.
- PWA ist als Manifest + Service Worker Baseline implementiert. Spaeter folgen Install Prompt, Offline-Strategie pro Route und Push/Background Sync.

## Skalierungsbezug

- Die UI ist mobile-first und scanbar.
- Chat bleibt das zentrale Erlebnis.
- API-Anbindung kann spaeter ueber OpenAPI-generierte Typen erfolgen.
- Lokalisierte Routen sind fuer globale SEO und zukuenftige regionale Seiten vorbereitet.

## Validierung

Ausgefuehrt:

- `python3 -m json.tool frontend/package.json`
- `python3 -m json.tool frontend/tsconfig.json`
- `node --check frontend/public/sw.js`

Nicht ausfuehrbar in der lokalen Umgebung:

- `npm install`
- `npm run typecheck`
- `npm run build`

Grund: Auf dieser Maschine ist `node` vorhanden, aber `npm` und `corepack` sind nicht verfuegbar. `frontend/node_modules` existiert ebenfalls noch nicht.
