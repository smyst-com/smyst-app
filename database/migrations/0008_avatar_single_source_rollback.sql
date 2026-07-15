-- Rollback zu Migration 0008: Avatar Single Source of Truth
--
-- Entfernt die beiden additiven Avatar-Spalten wieder.
-- ACHTUNG: Dies loescht gespeicherte Avatar-URLs (users.avatar_url,
-- twins.avatar_url_override). Nur ausfuehren, wenn ein Rollback der
-- Avatar-Funktion beabsichtigt ist. Bild-Objekte in IDrive e2 bleiben
-- unberuehrt; nur die Referenzen in der Datenbank werden entfernt.

BEGIN;

ALTER TABLE twins
  DROP COLUMN IF EXISTS avatar_url_override;

ALTER TABLE users
  DROP COLUMN IF EXISTS avatar_url;

COMMIT;
