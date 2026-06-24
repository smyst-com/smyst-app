# smyst.com

smyst.com ist eine guenstige PWA-first Plattform fuer digitale AI Twins.

## Zielarchitektur

- Spaceship: Domain `smyst.com`, DNS und Subdomains.
- GitHub Free: Quellcode, Versionierung, Releases und GitHub Actions.
- IDrive e2: 99 % aller Speicheraufgaben fuer Dateien, Medien, App-/PWA-Dateien, statische Website-Dateien, Uploads, Backups, Logs, Exporte, AI-Datenartefakte und Archive.
- Salad.com: nur bei Bedarf fuer API/Worker/AI/Batch-Jobs oder temporaere Rechenleistung.
- PWA: Web-App ueber `smyst.com`, installierbar auf Desktop, Android und iOS.
- iOS/Android/Huawei Apps: spaeter als Wrapper oder native Apps, die Inhalte/API von `smyst.com` laden.

## Domainstruktur

- `smyst.com` -> Website/PWA.
- `app.smyst.com` -> Web-App.
- `api.smyst.com` -> nur wenn noetig ueber Salad oder einen kleinen API-Dienst.
- `cdn.smyst.com` -> IDrive e2 fuer Dateien und Assets.
- `backup.smyst.com` -> private Backups in IDrive e2.

## IDrive e2 99%-Speicherregel

IDrive e2 uebernimmt 99 % aller Speicheraufgaben. Alles, was Datei, Medienobjekt, Archiv, Export, Log oder AI-Datenartefakt ist, gehoert zuerst nach IDrive e2:

- Bilder, Videos, Audio, PDFs und Profilbilder
- Nutzer-Uploads, temporaere Uploads und grosse Mediendateien
- App-/PWA-Dateien, statische Website-Dateien, Downloads und Release-Dateien
- Backups, Exporte, Admin-Exporte, Versionen und verschluesselte Sicherungen
- Logs, Fehlerberichte und Audit-Logs
- KI-Profilwissen, Prompt-Dateien, Chat-Archive und Wissensdaten
- Modell-Dateien, Trainingsdaten und Medien-Archiv

IDrive e2 ist nicht der richtige Ort fuer Login, Datenbank, Zahlungen, Echtzeit-Chat, Suche, Live-Admin-Dashboards oder serverseitige API-Logik.

GitHub Free bleibt nur fuer Code, Versionierung, Releases und GitHub Actions. Spaceship verwaltet Domain und DNS. Salad.com bleibt nur fuer echte Rechenarbeit wie API, KI, Verarbeitung und Cronjobs.

## Startregel

Die guenstigste Start-Version ist:

1. Domain bei Spaceship.
2. DNS und Subdomains bei Spaceship.
3. Code auf GitHub.
4. Statische Web-/PWA-Dateien in IDrive e2.
5. Medien und Uploads in IDrive e2.
6. Kleine API nur bauen, wenn Login oder dynamische Funktionen noetig werden.
7. Salad erst aktivieren, wenn echte Rechenleistung gebraucht wird.

Cloudflare ist nicht die Ziel-Hauptarchitektur. Falls Cloudflare noch aktiv ist, gilt es nur als Uebergang/Legacy, bis Spaceship-DNS und IDrive-e2-Hosting fertig umgestellt sind.
