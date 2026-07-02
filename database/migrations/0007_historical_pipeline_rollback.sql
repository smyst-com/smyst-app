-- Rollback fuer 0007_historical_pipeline.sql
-- Additiv angelegte Objekte werden entfernt; Bestandstabellen bleiben unberuehrt.
-- Achtung: entfernt Pipeline-Metadaten, aber keine twins/Chat-/Nutzerdaten
-- (Master Prompt: keine Nutzerdaten, Medien, Chats oder Profile loeschen).

BEGIN;

DROP TABLE IF EXISTS pipeline_config;
DROP TABLE IF EXISTS estate_blacklist;
DROP TABLE IF EXISTS historical_candidates;

COMMIT;
