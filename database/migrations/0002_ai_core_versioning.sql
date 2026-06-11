BEGIN;

CREATE TABLE IF NOT EXISTS twin_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id uuid NOT NULL REFERENCES twins(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  persona_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  memory_fact_ids uuid[] NOT NULL DEFAULT '{}',
  build_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (twin_id, version_number)
);

CREATE TABLE IF NOT EXISTS ai_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id uuid REFERENCES twins(id) ON DELETE SET NULL,
  evaluation_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS llm_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  route_purpose text NOT NULL,
  status text NOT NULL,
  latency_ms integer,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  degraded boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_twin_versions_twin_created ON twin_versions(twin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_evaluations_twin_type ON ai_evaluations(twin_id, evaluation_type);
CREATE INDEX IF NOT EXISTS idx_llm_provider_events_provider_created ON llm_provider_events(provider, created_at DESC);

COMMIT;

