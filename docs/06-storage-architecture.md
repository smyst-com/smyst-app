# 06 Storage Architecture

## Ziel

IDrive e2 ist der zentrale Speicher fuer Dateien, Medien, Dokumente, Uploads, Backups und sonstige Daten. Cloudflare Workers erzeugen signed URLs und setzen Quotas.

## Production-Regel

- Kein separater Production-Server fuer Uploads.
- Kein relationaler Production-Metadatenspeicher.
- Kein unlimitierter Upload.
- Keine permanenten Credentials im Client.

## Object-Key-Schema

```text
users/{userId}/uploads/audio/{fileId}.{ext}
users/{userId}/uploads/images/{fileId}.{ext}
users/{userId}/uploads/videos/{fileId}.{ext}
users/{userId}/uploads/documents/{fileId}.{ext}
users/{userId}/profile/images/{fileId}.{ext}
users/{userId}/backups/{YYYY-MM}/{fileId}.{ext}
users/{userId}/twins/{twinId}/data/{fileId}.{ext}
```

Keine E-Mail-Adressen, Klarnamen oder sensiblen Rohdaten im Key.

## Upload-Flow

1. Client fragt `POST /storage/upload-url`.
2. Worker prueft Session, Dateityp, Dateigroesse, User-Quota und Global-Quota.
3. Worker reserviert Quota in Cloudflare KV und schreibt einen Upload-Intent.
4. Worker erstellt eine kurzlebige signed PUT URL fuer IDrive e2.
5. Client laedt direkt zu IDrive e2 hoch.
6. Client meldet `POST /storage/upload-complete`.
7. Worker prueft das Objekt per signed `HEAD`.
8. Worker setzt das kleine KV-Metadatenobjekt auf `uploaded` und aktualisiert aktive Speicherzaehler.

## Download-Flow

1. Client fragt `GET /storage/download?key=...`.
2. Worker prueft Session und User-Prefix.
3. Worker erstellt eine kurzlebige signed GET URL.
4. Client wird zu IDrive e2 weitergeleitet.

## Free-Only Quotas

Startwerte muessen bewusst niedrig sein:

- kleine maximale Dateigroesse,
- Kategorie-Dateigroessenlimits,
- monatliches User-Limit,
- globales Monatslimit,
- aktives User-Speicherlimit,
- aktives globales Speicherlimit.

## Kategorien

| Kategorie | Zweck |
|---|---|
| `audio` | Sprachaufnahmen, Audio-Memories |
| `image` | Bilder und Memory-Fotos |
| `video` | Videos |
| `document` | PDFs, Text, Markdown, Office-Dokumente |
| `profile_image` | Profilbilder/Avatare |
| `backup` | User-scoped Backups und Exporte |
| `twin_data` | KI-Zwilling-Daten als JSON/Text/Markdown, `twinId` Pflicht |

## Backups

Backups liegen als Objekte in IDrive e2. Backup- und Restore-Runbooks duerfen keine separat betriebene Datenbank als Production-Pflicht annehmen.

## Datenablage

Siehe `docs/FREE_ONLY_DATA_MAP.md` fuer die verbindliche Zuordnung aller Datentypen.
