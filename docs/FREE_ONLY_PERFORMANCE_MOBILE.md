# Free-Only Performance und Mobile

Status: Phase-1-MVP auf GitHub Free, Cloudflare Free und IDrive e2.

## Ziel fuer Phase 1

Die erste Oberfläche soll sofort reagieren: Startseite, Twin-Auswahl und Chat-Eingabe laden ohne Auth-Pflichtrequest. Milliarden-Skalierung bleibt Langfristvision; Phase 1 optimiert die Free-only-MVP-Basis.

## Web und PWA

- Cloudflare Pages liefert die statische Vite-App.
- `manifest.webmanifest` aktiviert Installierbarkeit fuer Web, iPhone, Android und PWA.
- `sw.js` cached nur App-Shell, Locale-Dateien und öffentliche Standarddateien.
- Private Pfade wie `/api/`, `/auth/`, `/storage/` und `/private/` werden nicht vom Service Worker gecached.
- `offline.html` erklaert klar, dass private Chats, Uploads und neue Twin-Daten Verbindung brauchen.

## Bundle und Requests

- Cookie-Banner, Mobile-Drawer und GitHub-Login werden lazy geladen.
- Landing nutzt `useAuth({ enabled: false })`, damit kein unnötiger `/auth/me` Request beim Sofort-Chat entsteht.
- Vite splittet React, Icons und Deferred-UI in cachebare Chunks.
- Cloudflare Headers cachen `/assets/*` immutable und `/locales/*` mit `stale-while-revalidate`.

## Mobile Uploads

- Uploads gehen direkt per Presigned-URL zu IDrive e2 und nicht durch den Worker als Datei-Proxy.
- Frontend blockiert offensichtlich falsche Dateitypen und zu große Dateien vor dem Netzwerkrequest.
- Der Worker bleibt autoritativ fuer Content-Type, Größe, Quota und Eigentümerprüfung.

## Datenschutz beim Caching

- Keine sensiblen API-Antworten werden offline gespeichert.
- Auth, Storage, private Profile und private Twin-Daten bleiben online-only.
- Öffentliche SEO-Dateien und Locale-Dateien duerfen gecached werden.
