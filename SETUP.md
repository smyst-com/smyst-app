# Smyst Setup

Diese Anleitung beschreibt die gewuenschte Startarchitektur fuer `smyst.com`.

## Grundregel

IDrive e2 speichert fast alles. Andere Dienste laufen nur dort, wo echte Logik oder Rechenarbeit noetig ist.

Erlaubte Start-Bausteine:

- Spaceship fuer Domain, DNS und Subdomains.
- GitHub Free fuer Code, Versionierung, Releases und GitHub Actions.
- IDrive e2 fuer 99 % aller Speicheraufgaben.
- Salad.com nur bei Bedarf fuer API/Worker/AI/Batch-Jobs.

## Setup-Reihenfolge

1. Domain `smyst.com` bei Spaceship halten.
2. Spaceship Advanced DNS fuer `smyst.com` aktivieren.
3. IDrive e2 Buckets anlegen:
   - `smyst.com` fuer die Website/PWA.
   - `app.smyst.com` fuer die Web-App, falls getrennt benoetigt.
   - `cdn.smyst.com` fuer oeffentliche Assets.
   - `backup.smyst.com` fuer private Backups.
   - `smyst-memories` fuer private Benutzer-Uploads.
4. IDrive e2 Static Website Hosting fuer die oeffentlichen Buckets aktivieren.
5. Spaceship DNS setzen:
   - `@` als ALIAS auf das IDrive-e2-Website-Ziel fuer `smyst.com`.
   - `app` als CNAME auf das IDrive-e2-Ziel fuer `app.smyst.com`.
   - `cdn` als CNAME auf das IDrive-e2-Ziel fuer `cdn.smyst.com`.
   - `backup` nur privat verwenden, nicht oeffentlich listen.
6. GitHub Actions baut die PWA und synchronisiert `dist/` nach IDrive e2.
7. Salad bleibt aus, bis Rechenleistung gebraucht wird.

## IDrive e2

Startregion:

```text
Region: Los Angeles
Region code: us-west-2
Endpoint: https://s3.us-west-2.idrivee2.com
```

Wichtige Regeln:

- Buckets standardmaessig privat.
- Oeffentliche Website-/Asset-Buckets nur gezielt oeffentlich machen.
- Private Dateien nur ueber signierte URLs ausgeben.
- API-Keys nur in GitHub Secrets oder Server-/Worker-Umgebung speichern.
- Backups verschluesseln.
- IDrive e2 speichert Bilder, Videos, Audio, PDFs, Profilbilder, Nutzer-Uploads, App-/PWA-Dateien, statische Website-Dateien, Downloads, Backups, Exporte, Logs, KI-Profilwissen, Prompt-Dateien, Chat-Archive, Wissensdaten, Modell-Dateien, Trainingsdaten, Versionen, Release-Dateien, Medien-Archiv, Admin-Exporte, Fehlerberichte, Audit-Logs, temporaere Uploads und verschluesselte Sicherungen.

## GitHub

GitHub speichert nur:

- Code
- Dokumentation
- Releases
- GitHub Actions

GitHub Actions soll:

- Build ausfuehren.
- `dist/` nach IDrive e2 synchronisieren.
- keine kostenpflichtigen GitHub-Funktionen voraussetzen.

## Salad

Salad wird nicht dauerhaft betrieben.

Nutzung nur bei Bedarf:

- Bild-/Videoverarbeitung
- AI-Funktionen
- API-Server bei Bedarf
- Cronjobs/Batch-Verarbeitung
- Generierung von App-Inhalten
- temporaere Rechenleistung

## Cloudflare

Cloudflare ist in dieser Zielarchitektur kein Hauptsystem. Bestehende Cloudflare Pages/Workers duerfen nur als Uebergang laufen, bis IDrive e2 Static Hosting und Spaceship DNS produktiv sind.
