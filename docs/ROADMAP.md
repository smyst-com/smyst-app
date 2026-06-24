# Smyst Roadmap

## Phase 1: Günstigste Start-Version

Ziel: PWA live machen, mit IDrive e2 als Hauptspeicher und Spaceship als DNS-Verwaltung.

- Domain `smyst.com` bei Spaceship halten.
- DNS/Subdomains in Spaceship verwalten.
- Code in GitHub halten.
- PWA bauen und statische Dateien nach IDrive e2 synchronisieren.
- IDrive e2 als 99%-Speicher fuer Bilder, Videos, Audio, PDFs, Profilbilder, Nutzer-Uploads, App-/PWA-Dateien, statische Website-Dateien, Downloads, Backups, Exporte, Logs, KI-Profilwissen, Prompt-Dateien, Chat-Archive, Wissensdaten, Modell-Dateien, Trainingsdaten, Versionen, Release-Dateien, Medien-Archiv, Admin-Exporte, Fehlerberichte, Audit-Logs, temporaere Uploads und verschluesselte Sicherungen verwenden.
- API nur bauen, wenn Login oder dynamische Funktionen wirklich noetig sind.
- Salad erst aktivieren, wenn Rechenleistung gebraucht wird.

Erfolg:

- `smyst.com` laedt die PWA.
- `app.smyst.com` kann die Web-App ausliefern.
- `cdn.smyst.com` kann oeffentliche IDrive-e2-Assets ausliefern.
- `backup.smyst.com` bleibt privat.
- Keine laufenden Salad-Kosten.

## Phase 2: Login und private Dateien

Ziel: Nutzer koennen sich anmelden und private Dateien sicher nutzen.

- Login-System mit kleinem API-Dienst oder Worker.
- Private Uploads in IDrive e2.
- Signierte URLs fuer private Dateien.
- Harte Upload- und Speicherlimits.
- Export- und Loeschfunktionen.

## Phase 3: Twin MVP

Ziel: Nutzer koennen einen einfachen AI Twin erstellen.

- Profil bearbeiten.
- Twin erstellen.
- Memories hochladen.
- Basis-Chat.
- Chat-Archive und Exports in IDrive e2.

## Phase 4: Salad bei Bedarf

Ziel: Nur echte Rechenarbeit auslagern.

- Bild-/Videoverarbeitung.
- AI-Jobs.
- Batch-Verarbeitung.
- Cronjobs.
- temporaere API-Server.

Regel:

- Kein dauerhaft laufender Container ohne Nutzen.
- Keine monatliche Grundgebuehr als Pflicht.
- Keine dauerhafte Speicherung sensibler Daten in Salad.

## Phase 5: Apps

Ziel: PWA zuerst stabilisieren, dann App-Wrapper.

- iOS Wrapper.
- Android Wrapper.
- Huawei Wrapper.
- spaeter native Funktionen nur wenn noetig.
