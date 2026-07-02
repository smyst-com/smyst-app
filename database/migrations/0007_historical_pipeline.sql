-- 0007_historical_pipeline.sql
-- smyst.com Autopilot-Pipeline fuer historische Profile.
-- Siehe Autopilot_Profile_Pipeline_Spec.md. Rollback: 0007_historical_pipeline_rollback.sql
-- Status wird in PostgreSQL gefuehrt (Source of Truth), Blobs liegen in IDrivee2.com.
-- Konsistent zum Bestandsschema: text-Status mit CHECK statt SQL-ENUM (vgl. users.status).

BEGIN;

CREATE TABLE IF NOT EXISTS historical_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wikidata_qid text NOT NULL UNIQUE,
  name text NOT NULL,
  name_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  birth_date date,
  death_date date NOT NULL,
  country text,
  language text,
  category text NOT NULL,
  sitelink_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN (
    'candidate','researched','verified','generated',
    'reviewed','published','rejected','unpublished'
  )),
  status_reason text,
  risk_score numeric(4,2) CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 10)),
  risk_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_count integer NOT NULL DEFAULT 0,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_status text CHECK (image_status IS NULL OR image_status IN ('commons_ok','generated','none')),
  image_key text,
  prompt_key text,
  seo_key text,
  qa_report jsonb,
  qa_passed boolean NOT NULL DEFAULT false,
  twin_id uuid REFERENCES twins(id),
  reviewed_by uuid REFERENCES users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Rueckzug und Ablehnung niemals ohne Grund (Audit-Pflicht).
  CHECK (status NOT IN ('rejected','unpublished') OR status_reason IS NOT NULL),
  -- Kein Livegang ohne menschliche Freigabe und bestandene QA.
  CHECK (status <> 'published' OR (reviewed_by IS NOT NULL AND qa_passed))
);

CREATE INDEX IF NOT EXISTS idx_historical_candidates_status
  ON historical_candidates (status);
CREATE INDEX IF NOT EXISTS idx_historical_candidates_death_date
  ON historical_candidates (death_date);
CREATE INDEX IF NOT EXISTS idx_historical_candidates_published_at
  ON historical_candidates (published_at) WHERE status = 'published';

-- Blacklist kommerziell verwalteter Nachlaesse (Publicity Rights / Marken).
CREATE TABLE IF NOT EXISTS estate_blacklist (
  wikidata_qid text PRIMARY KEY,
  name text NOT NULL,
  reason text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('block','manual_review')),
  added_at timestamptz NOT NULL DEFAULT now()
);

-- Startbestand; vollstaendige Befuellung (~50 Nachlaesse) ist Folgeaufgabe.
INSERT INTO estate_blacklist (wikidata_qid, name, reason, severity) VALUES
  ('Q937',    'Albert Einstein', 'Hebrew University/Greenlight (Marke/Merchandising); Publicity Right lt. HUJ v. GM 2012 abgelaufen — menschliche Freigabe statt Auto-Block', 'manual_review'),
  ('Q4616',   'Marilyn Monroe',  'Nachlass kommerziell verwaltet (Authentic Brands Group)', 'block'),
  ('Q303',    'Elvis Presley',   'Nachlass kommerziell verwaltet (Elvis Presley Enterprises / ABG)', 'block'),
  ('Q83359',  'James Dean',      'Nachlass kommerziell verwaltet (CMG Worldwide); Sterbejahr 1955 liegt im Zielbereich', 'block'),
  ('Q213812', 'Babe Ruth',       'Nachlass kommerziell verwaltet (CMG Worldwide)', 'manual_review'),
  ('Q5588',   'Frida Kahlo',     'Markenrechte durch Frida Kahlo Corporation beansprucht und umstritten', 'manual_review'),
  ('Q7245',   'Mark Twain',      'Vermarktung durch CMG Worldwide gelistet; Werke gemeinfrei, Name pruefen', 'manual_review')
ON CONFLICT (wikidata_qid) DO NOTHING;

-- Konfigurierbare Limits ohne Deployment aenderbar.
CREATE TABLE IF NOT EXISTS pipeline_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pipeline_config (key, value) VALUES
  ('pipeline.enabled',       'false'::jsonb),
  ('daily_publish_limit',    '5'::jsonb),
  ('daily_candidate_limit',  '50'::jsonb),
  ('min_sources',            '3'::jsonb),
  ('max_death_year',         '1955'::jsonb),
  ('min_sitelinks',          '15'::jsonb),
  ('qa_failure_rate_brake',  '0.10'::jsonb),
  ('review_backlog_days_brake', '3'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
