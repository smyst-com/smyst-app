-- Migration 0008: Avatar Single Source of Truth
--
-- Fuegt das zentrale Avatar-Feld (users.avatar_url) und den optionalen
-- Twin-spezifischen Override (twins.avatar_url_override) hinzu.
--
-- Aufloesungsregel (in der Anwendung, siehe backend/app/ai/avatar.py):
--     resolved = twin.avatar_url_override ?? owner.avatar_url ?? placeholder
--
-- Additiv und idempotent (IF NOT EXISTS). Bestehende Zeilen und Daten bleiben
-- unveraendert; beide Spalten sind NULL-bar, sodass kein Backfill noetig ist.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE twins
  ADD COLUMN IF NOT EXISTS avatar_url_override text;

COMMIT;
