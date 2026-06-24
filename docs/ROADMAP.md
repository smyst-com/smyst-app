# Smyst Roadmap

## Langfristiges Skalierungsziel

Smyst soll langfristig ein globales AI-System fuer Web, PWA, iPhone, Android und zukuenftige Plattformen werden. Ziel ist, Gemini, Claude, Grok, DeepSeek, Kimi, Manus und Mistral bei Geschwindigkeit, Stabilitaet, Sicherheit, Intelligenz, Skalierbarkeit, Zuverlaessigkeit, Datenschutz, Verfuegbarkeit und Benutzerfreundlichkeit zu uebertreffen.

Chats muessen sofort starten, Antworten nahezu verzogerungsfrei erscheinen und Interaktionen durchgehend fluessig bleiben. Die Architektur wird deshalb auf Milliarden Nutzer pro Tag, weltweite parallele Nutzung, niedrige Latenz, hohe Ausfallsicherheit und klare Trennung von Speicher und Rechenarbeit ausgerichtet. Die Startversion bleibt guenstig und einfach; die Milliarden-Skalierung ist das Zielbild fuer spaetere Ausbauphasen.

## Phase 1: Günstigste Start-Version

Ziel: PWA live machen, mit IDrive e2 als Hauptspeicher und Spaceship als DNS-Verwaltung.

- Domain `smyst.com` bei Spaceship halten.
- DNS/Subdomains in Spaceship verwalten.
- Code in GitHub halten.
- PWA bauen und statische Dateien nach IDrive e2 synchronisieren.
- IDrive e2 als 99%-Speicher fuer Bilder, Videos, Audio, PDFs, Profilbilder, Nutzer-Uploads, App-/PWA-Dateien, statische Website-Dateien, Downloads, Backups, Exporte, Logs, KI-Profilwissen, Prompt-Dateien, Chat-Archive, Wissensdaten, Modell-Dateien, Trainingsdaten, Versionen, Release-Dateien, Medien-Archiv, Admin-Exporte, Fehlerberichte, Audit-Logs, temporaere Uploads, verschluesselte Sicherungen, App-Builds, APK/AAB/IPA-Dateien, Update-Pakete, Rollback-Dateien, Thumbnails, Video-Vorschauen, Untertitel, Uebersetzungen, statische JSON-Daten, Profil-Datensaetze, Kategorien, Sitemap/SEO-Dateien, Hilfedateien, rechtliche Dokumente, Testberichte, Screenshots, QA-Videos, Datenbank-Backups, Suchindex-Backups, RAG-Dokumente, Embedding-Dateien, Import-/Export-Pakete, Design-Assets, Feature-Config-Dateien, Wartungsseiten, Offline-Dateien, Cache-Dateien, oeffentliche CDN-Dateien und private signierte Dateien verwenden.
- API nur bauen, wenn Login oder dynamische Funktionen wirklich noetig sind.
- Salad erst aktivieren, wenn Rechenleistung fuer API, KI, Verarbeitung, Suche, Indexierung oder Cronjobs gebraucht wird.

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
