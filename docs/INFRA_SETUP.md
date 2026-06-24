# Smyst Infrastructure Setup

## Verbindliches Konzept

Die Infrastruktur fuer `smyst.com` folgt diesem Aufbau:

- Spaceship: Domain, DNS und Subdomains.
- GitHub Free: Code, Releases und Actions.
- IDrive e2: 99 % aller Speicheraufgaben, Hauptspeicher und statisches Hosting.
- Salad.com: nur bei Bedarf fuer echte Rechenarbeit wie API, KI, Verarbeitung, Suche, Indexierung und Cronjobs.
- PWA zuerst, native Apps spaeter.

## Subdomains

```text
smyst.com        -> Website/PWA
app.smyst.com    -> Web-App
api.smyst.com    -> API nur bei Bedarf, bevorzugt Salad oder kleiner API-Dienst
cdn.smyst.com    -> IDrive e2 Assets und oeffentliche Dateien
backup.smyst.com -> private IDrive e2 Backups
```

## IDrive e2 Buckets

Empfohlene Buckets:

```text
smyst.com
app.smyst.com
cdn.smyst.com
backup.smyst.com
smyst-memories
```

Aktueller Stand:

- Die Buckets `smyst.com`, `app.smyst.com`, `cdn.smyst.com`, `backup.smyst.com` und `smyst-memories` sind in der Region Los Angeles (`us-west-2`) angelegt.
- Die PWA-Dateien sind nach `smyst.com` und `app.smyst.com` hochgeladen.
- Die CDN-Dateien sind nach `cdn.smyst.com` hochgeladen.
- `smyst.com` zeigt den IDrive-Endpunkt `smyst.com.s3.us-west-2.idrivee2.com`.
- Der bestehende Bucket `smyst.com` ist aktuell privat; die IDrive-Konsole deaktiviert den Umschalter auf `Oeffentlich`.

Oeffentlich:

- `smyst.com`
- `app.smyst.com`
- `cdn.smyst.com`

Privat:

- `backup.smyst.com`
- `smyst-memories`

## IDrive e2 Speicherumfang

IDrive e2 ist der Primaerspeicher fuer:

- Bilder, Videos, Audio, PDFs und Profilbilder.
- Nutzer-Uploads, temporaere Uploads und grosse Mediendateien.
- App-/PWA-Dateien, statische Website-Dateien, Downloads und Release-Dateien.
- Backups, Exporte, Admin-Exporte, Versionen und verschluesselte Sicherungen.
- Logs, Fehlerberichte und Audit-Logs.
- KI-Profilwissen, Prompt-Dateien, Chat-Archive und Wissensdaten.
- Modell-Dateien, Trainingsdaten, Medien-Archiv, App-Builds, APK/AAB/IPA-Dateien, Update-Pakete, Rollback-Dateien, Thumbnails, Video-Vorschauen, Untertitel, Uebersetzungen, statische JSON-Daten, Profil-Datensaetze, Kategorien, Sitemap/SEO-Dateien, Hilfedateien, rechtliche Dokumente, Testberichte, Screenshots, QA-Videos, Datenbank-Backups, Suchindex-Backups, RAG-Dokumente, Embedding-Dateien, Import-/Export-Pakete, Design-Assets, Feature-Config-Dateien, Wartungsseiten, Offline-Dateien, Cache-Dateien, oeffentliche CDN-Dateien und private signierte Dateien.

GitHub Free ist nur fuer Code, Versionierung, Releases und Actions. Spaceship ist nur fuer Domain/DNS. Salad.com ist nur fuer echte Rechenarbeit wie API, KI, Verarbeitung, Suche, Indexierung und Cronjobs.

## Spaceship DNS

Spaceship soll die DNS-Zone verwalten.

Empfohlene Records:

```text
@      ALIAS  <IDrive e2 website/custom-domain target>
app    CNAME  <IDrive e2 website/custom-domain target>
cdn    CNAME  <IDrive e2 public/custom-domain target>
api    CNAME  <Salad/API target, nur wenn API aktiv ist>
backup CNAME  <IDrive e2 target, nur wenn wirklich benoetigt>
```

DNS darf erst auf IDrive e2 umgestellt werden, wenn die oeffentlichen Buckets wirklich per Browser erreichbar sind. Bis dahin bleibt die bisherige Auslieferung als Uebergang aktiv, damit `smyst.com` nicht ausfaellt.

## GitHub Actions

GitHub Actions baut die PWA und synchronisiert das Build-Artefakt nach IDrive e2.

Minimaler Ablauf:

```text
1. npm build
2. dist/ pruefen
3. dist/ nach IDrive e2 Website-Bucket synchronisieren
4. optional: cdn assets nach cdn.smyst.com synchronisieren
```

## Salad

Salad bleibt ohne laufende Container, bis echte Rechenarbeit benoetigt wird.

Erlaubte Nutzung:

- Batch-Jobs
- AI-Jobs
- Medienverarbeitung
- Suche und Indexierung
- temporaere API

Nicht erlaubt als Startzustand:

- dauerhaft laufende Container ohne Nutzen
- monatliche Grundgebuehr
- sensible Daten dauerhaft in Salad speichern

## Cloudflare Legacy

Cloudflare Pages/Workers/KV koennen als Uebergang existieren. Ziel ist aber, dass die Startversion mit Spaceship DNS und IDrive e2 als Hauptsystem arbeitet.
