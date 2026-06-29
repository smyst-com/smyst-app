# IDrive e2 Storage Rule

## Verbindliche Regel

IDrive e2 uebernimmt fuer `smyst.com` 99 % aller Speicheraufgaben. Jeder neue Speicherfall wird zuerst gegen IDrive e2 geplant. Andere Dienste duerfen nur genutzt werden, wenn IDrive e2 technisch nicht passt oder echte Rechenarbeit erforderlich ist.

## Speichert IDrive e2

- Bilder
- Videos
- Audio
- PDFs
- Profilbilder
- Nutzer-Uploads
- App-/PWA-Dateien
- statische Website-Dateien
- Downloads
- Backups
- Exporte
- Logs
- KI-Profilwissen
- Prompt-Dateien
- Chat-Archive
- Wissensdaten
- Modell-Dateien
- Trainingsdaten
- Versionen
- Release-Dateien
- Medien-Archiv
- Admin-Exporte
- Fehlerberichte
- Audit-Logs
- temporaere Uploads
- verschluesselte Sicherungen
- App-Builds
- APK/AAB/IPA-Dateien
- Update-Pakete
- Rollback-Dateien
- Thumbnails
- Video-Vorschauen
- Untertitel
- Uebersetzungen
- statische JSON-Daten
- Profil-Datensaetze
- Kategorien
- Sitemap/SEO-Dateien
- Hilfedateien
- rechtliche Dokumente
- Testberichte
- Screenshots
- QA-Videos
- Datenbank-Backups
- Suchindex-Backups
- RAG-Dokumente
- Embedding-Dateien
- Import-/Export-Pakete
- Design-Assets
- Feature-Config-Dateien
- Wartungsseiten
- Offline-Dateien
- Cache-Dateien
- oeffentliche CDN-Dateien
- private signierte Dateien

## Macht IDrive e2 nicht

- Login-Logik
- Datenbank-Abfragen
- Zahlungen
- Echtzeit-Chat
- serverseitige API-Logik
- AI-Inferenz
- Video-/Bildverarbeitung
- aktive Suche und Indexierung
- Cronjobs

## Rollen der anderen Dienste

- GitHub Free: nur Code, Versionierung, Releases und GitHub Actions.
- Spaceship: Domain `smyst.com`, DNS und Subdomains.
- Salad.com: nur echte Rechenarbeit wie API, KI, Verarbeitung, Suche, Indexierung und Cronjobs.
- Legacy edge provider: nur Uebergang/Legacy, bis Spaceship DNS und IDrive e2 Static Hosting produktiv sind.

## Aktueller Blocker

Die Buckets und Dateien sind vorbereitet. Der bestehende Bucket `smyst.com` ist in der IDrive-Konsole aktuell privat, und der Umschalter auf `Oeffentlich` ist fuer diesen Bucket deaktiviert. Deshalb darf Spaceship DNS noch nicht auf IDrive e2 zeigen, bis IDrive Public Access freigibt oder die oeffentlichen Buckets bewusst neu als Public Buckets angelegt werden.
