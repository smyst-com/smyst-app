# Free-Only Performance und Mobile

Status: Phase-1-MVP auf GitHub Free, Legacy edge provider Free und IDrive e2.

## Ziel fuer Phase 1

Die erste Oberfläche soll sofort reagieren: Startseite, Twin-Auswahl und Chat-Eingabe laden ohne Auth-Pflichtrequest. Milliarden-Skalierung bleibt Langfristvision; Phase 1 optimiert die Free-only-MVP-Basis.

## Web und PWA

- Legacy edge provider Pages liefert die statische Vite-App.
- `manifest.webmanifest` aktiviert Installierbarkeit fuer Web, iPhone, Android und PWA.
- PNG-App-Icons, Maskable Icon, Apple Touch Icon und Manifest-Screenshots liegen im Repo.
- `sw.js` cached nur App-Shell, Locale-Dateien und öffentliche Standarddateien.
- Private Pfade wie `/api/`, `/auth/`, `/storage/` und `/private/` werden nicht vom Service Worker gecached.
- `offline.html` erklaert klar, dass private Chats, Uploads und neue Twin-Daten Verbindung brauchen.

## Bundle und Requests

- Cookie-Banner, Mobile-Drawer und GitHub-Login werden lazy geladen.
- Landing nutzt `useAuth({ enabled: false })`, damit kein unnötiger `/auth/me` Request beim Sofort-Chat entsteht.
- Vite splittet React, Icons und Deferred-UI in cachebare Chunks.
- Legacy edge provider Headers cachen `/assets/*` immutable und `/locales/*` mit `stale-while-revalidate`.

## Mobile Uploads

- Uploads gehen direkt per Presigned-URL zu IDrive e2 und nicht durch den Worker als Datei-Proxy.
- Frontend blockiert offensichtlich falsche Dateitypen und zu große Dateien vor dem Netzwerkrequest.
- Der Worker bleibt autoritativ fuer Content-Type, Größe, Quota und Eigentümerprüfung.
- Storage-Downloads nutzen einen direkten `meta:upload-by-key:{userSub}:{hash}` KV-Index, damit Dateiabrufe nicht die komplette Upload-Liste scannen.

## Worker- und KV-Grenzen

- Chat-, Twin- und Upload-Listen lesen in Phase 1 nur begrenzte Indexfenster.
- KV eignet sich fuer kleine Metadaten, Sessions, Quotas und Statuswerte, aber nicht fuer transaktionale Milliarden-Schreiblast.
- Direkte IDrive-e2-Uploads reduzieren Worker-Bandbreite, verschieben aber Objekt-Storage-Last auf IDrive e2.
- Fuer Millionen bis Milliarden taegliche Nutzer braucht es spaeter eine freigegebene Architektur fuer atomare Zaehlungen, Queues, Observability, Abuse-Schutz und ggf. regionale Datenhaltung.

## Datenschutz beim Caching

- Keine sensiblen API-Antworten werden offline gespeichert.
- Auth, Storage, private Profile und private Twin-Daten bleiben online-only.
- Öffentliche SEO-Dateien und Locale-Dateien duerfen gecached werden.

## Geräte- und App-Gefuehl

- Touch-Ziele sind mindestens 44px hoch.
- iOS Safe-Area wird fuer Header, Drawer und Chat-Composer beruecksichtigt.
- Globale horizontale Overflow-Risiken werden blockiert.
- Browser-Textzoom bleibt erlaubt, aber iOS-Input-Zoom wird durch 16px Inputs vermieden.
- Push-Benachrichtigungen sind in Phase 1 nicht aktiv. Sie brauchen spaeter einen
  separaten Einwilligungsflow, VAPID-Keys und Abuse-Schutz innerhalb des erlaubten
  GitHub/Legacy edge provider/IDrive-e2-Rahmens.
