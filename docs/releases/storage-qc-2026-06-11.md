# Upload, Media And Storage QC - 2026-06-11

## Scope

Geprueft wurden Uploads, Medien, Avatare, Profile, Anhaenge, Dokumente, Backups,
IDrive-e2-Objektschluessel, Legacy edge provider-KV-Metadaten, Quotas, Download/Deletion und
der Frontend-Upload-Hook. Production bleibt beschraenkt auf GitHub.com,
Legacy edge provider und IDrivee2.com.

## Aktiver Upload-Pfad

1. Browser ruft `POST /storage/upload-url`.
2. Storage-Worker prueft Session, Rollen/Rechte, Kategorie, MIME-Type, Dateigroesse
   und Free-only-Quotas.
3. Worker schreibt einen kleinen KV-Upload-Intent.
4. Worker erstellt eine kurzlebige IDrive-e2 signed PUT URL.
5. Browser laedt die Datei direkt zu IDrive e2 hoch.
6. Browser ruft `POST /storage/upload-complete`.
7. Worker prueft das Objekt per signed `HEAD`.
8. Worker markiert den KV-Record als `uploaded` und aktualisiert aktive
   Speicherzaehler.

## Gepruefte Kategorien

- Bilder: `image`
- Videos: `video`
- Audio: `audio`
- Dokumente: `document`
- Avatare/Profilbilder: `profile_image`
- Profile/Twin-Daten: `twin_data`
- Anhaenge: ueber die jeweilige Kategorie plus Twin-/Chat-Referenz
- Backups: `backup`

## Gefundene Probleme

- `GET /storage/file/{key}` pruefte den User-Prefix, aber bisher nicht zwingend den
  passenden KV-Upload-Record und Status `uploaded`.
- Dokumente, Backups und Twin-Daten konnten als signed GET ohne explizite
  Attachment-Disposition ausgeliefert werden.
- Die Upload-URL-Antwort sagte nicht explizit, dass Phase 1 kein Chunk Upload und
  keine bytegenaue Wiederaufnahme unterstuetzt.
- Der Frontend-Upload-Hook konnte Uploads nicht kontrolliert abbrechen.
- Ein kurzzeitiger Direct-PUT-Netzwerkfehler wurde im Browser nicht erneut versucht.
- `docs/06-storage-architecture.md` dokumentierte noch einen alten Download-Pfad
  `GET /storage/download?key=...`.

## Behobene Probleme

- `workers/storage-idrive.ts` verlangt beim Download jetzt einen KV-Upload-Record
  mit Status `uploaded`.
- `workers/storage-idrive.ts` setzt fuer Dokumente, Backups und `twin_data` beim
  signed GET `response-content-disposition=attachment`.
- `workers/storage-idrive.ts` liefert in der Upload-URL-Antwort jetzt `maxBytes`,
  `category`, `supportsChunkUpload: false` und `supportsResume: false`.
- `src/lib/useMemoryUpload.ts` kann laufende XHR-Uploads abbrechen.
- `src/lib/useMemoryUpload.ts` versucht einen fehlgeschlagenen Direct-PUT einmal
  erneut, sofern der Upload nicht bewusst abgebrochen wurde.
- `docs/06-storage-architecture.md`, `docs/FREE_ONLY_DATA_MAP.md`,
  `workers/README.md` und `scripts/validate-foundation.py` wurden aktualisiert.

## Sicherheitsstand

- IDrive-e2-Secrets bleiben nur im Worker.
- Browser erhaelt nur kurzlebige signed URLs.
- Private Dateiantworten bleiben usergebunden und nicht cachebar als App-Shell.
- Upload-Completion verifiziert Objektgroesse und Content-Type per signed `HEAD`.
- Content-Type wird beim PUT signiert und muss exakt gesetzt werden.
- User-Keys enthalten keine E-Mails/Klarnamen, sondern gesaeuberte User-IDs.
- Loeschungen laufen serverseitig ueber den Worker.
- Abgelaufene Upload-Intents werden bereinigt und geben reservierte Quota frei.

## Performance Und Skalierung

- Direct-to-IDrive-e2 vermeidet Worker-Bandbreite und passt zum Free-only-MVP.
- Kleine KV-Metadaten und IDrive-e2-Objekte bleiben getrennt.
- Kategorie- und Global-Limits verhindern unkontrollierte Speicher- und Kostenlast.
- `GET /storage/file/{key}` nutzt jetzt den direkten
  `meta:upload-by-key:{userSub}:{sha256(key)}` KV-Index und faellt nur fuer alte
  Records ohne Index auf das begrenzte Upload-Fenster zurueck.

## Offen

- Kein echter Live-IDrive-e2 Upload/Download/Delete wurde in dieser lokalen Runde
  gegen den Bucket ausgefuehrt.
- Kein Multipart/Chunk Upload.
- Keine bytegenaue Upload-Wiederaufnahme.
- Keine automatische Media-Transkodierung oder Thumbnail-Pipeline.
- Keine Malware-/Virus-Pruefung, weil kein kostenloser erlaubter Scanner angebunden
  ist.
- Keine atomaren Quota-Counter bei extremer Parallelitaet; Salad/IDrive metadata ist fuer
  Milliarden gleichzeitige Schreibvorgaenge nicht ausreichend.

## Empfehlungen

- Vor Production-Deploy mit echter GitHub-Session testen:
  `upload-url`, IDrive PUT, `upload-complete`, `uploads`, `file`, `delete`.
- IDrive-e2-Bucket-CORS, Server-Side-Encryption und Lifecycle-Regeln manuell in der
  Release-Checkliste bestaetigen.
- Fuer groessere Videos spaeter IDrive-e2 Multipart Upload mit automatischem Abort
  unfertiger Parts bauen.
- Fuer hohe Parallelitaet spaeter einen staerkeren, genehmigten kostenlosen oder neu
  freigegebenen Konsistenzpfad pruefen. Innerhalb reiner Free-Kontingente ist
  Milliarden-Nutzer-Skalierung nicht realistisch.
