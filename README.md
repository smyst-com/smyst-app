# smyst.com

smyst.com ist eine guenstige PWA-first Plattform fuer digitale AI Twins.

## Skalierungsziel

Das langfristige Ziel ist ein globales AI-System fuer Web, PWA, iPhone, Android und zukuenftige Plattformen, das Gemini, Claude, Grok, DeepSeek, Kimi, Manus und Mistral in Geschwindigkeit, Stabilitaet, Sicherheit, Intelligenz, Skalierbarkeit, Zuverlaessigkeit, Datenschutz, Verfuegbarkeit und Benutzerfreundlichkeit uebertrifft.

Chats sollen sofort starten, Antworten nahezu verzogerungsfrei erscheinen und jede Interaktion durchgehend fluessig wirken. Die Nutzererfahrung soll nahtlos, natuerlich und hochwertig sein, ohne Wartezeiten, Ausfaelle oder Unterbrechungen. Die langfristige Architektur muss auf Milliarden Nutzer pro Tag und weltweite parallele Nutzung ausgerichtet werden. Die guenstige Startarchitektur ist der erste Schritt, nicht die finale Milliarden-Infrastruktur.

## Zielarchitektur

- Spaceship: Domain `smyst.com`, DNS und Subdomains.
- GitHub Free: Quellcode, Versionierung, Releases und GitHub Actions.
- IDrive e2: 99 % aller Speicheraufgaben fuer Dateien, Medien, App-/PWA-Dateien, statische Website-Dateien, Uploads, Backups, Logs, Exporte, AI-Datenartefakte, App-Builds, Suchindex-Backups, RAG-Dokumente, Embedding-Dateien und Archive.
- Salad.com: nur bei Bedarf fuer echte Rechenarbeit wie API, KI, Verarbeitung, Suche, Indexierung, Cronjobs oder temporaere Rechenleistung.
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
- Modell-Dateien, Trainingsdaten, Medien-Archiv, App-Builds, APK/AAB/IPA-Dateien, Update-Pakete, Rollback-Dateien, Thumbnails, Video-Vorschauen, Untertitel, Uebersetzungen, statische JSON-Daten, Profil-Datensaetze, Kategorien, Sitemap/SEO-Dateien, Hilfedateien, rechtliche Dokumente, Testberichte, Screenshots, QA-Videos, Datenbank-Backups, Suchindex-Backups, RAG-Dokumente, Embedding-Dateien, Import-/Export-Pakete, Design-Assets, Feature-Config-Dateien, Wartungsseiten, Offline-Dateien, Cache-Dateien, oeffentliche CDN-Dateien und private signierte Dateien

IDrive e2 ist nicht der richtige Ort fuer Login, aktive Datenbank-Abfragen, Zahlungen, Echtzeit-Chat, Live-Admin-Dashboards, AI-Inferenz, aktive Suche/Indexierung oder serverseitige API-Logik.

GitHub Free bleibt nur fuer Code, Versionierung, Releases und GitHub Actions. Spaceship verwaltet Domain und DNS. Salad.com bleibt nur fuer echte Rechenarbeit wie API, KI, Verarbeitung, Suche, Indexierung und Cronjobs.

## Startregel

Die guenstigste Start-Version ist:

1. Domain bei Spaceship.
2. DNS und Subdomains bei Spaceship.
3. Code auf GitHub.
4. Statische Web-/PWA-Dateien in IDrive e2.
5. Medien und Uploads in IDrive e2.
6. Kleine API nur bauen, wenn Login oder dynamische Funktionen noetig werden.
7. Salad erst aktivieren, wenn echte Rechenleistung gebraucht wird.

Neue Deployments, DNS-Aenderungen, Speicherpfade und API-Pfade muessen ueber
Spaceship, IDrive e2, Salad und GitHub geplant werden. Alte Edge-/CDN-Ressourcen
gelten als Abschaltbestand und duerfen nicht als Zielarchitektur erweitert werden.
