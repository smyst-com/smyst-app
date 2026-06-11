BEGIN;

CREATE TABLE IF NOT EXISTS deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_id uuid,
  scope text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS privacy_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested',
  storage_bucket text,
  storage_key text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS csp_violation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  document_uri text,
  violated_directive text,
  effective_directive text,
  blocked_uri text,
  raw_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  status text NOT NULL,
  storage_key text,
  checksum_sha256 text,
  size_bytes bigint,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL,
  route text NOT NULL,
  limit_name text NOT NULL,
  decision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_user_status ON deletion_requests(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_privacy_export_requests_user_status ON privacy_export_requests(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_csp_violation_reports_created ON csp_violation_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_events_type_status ON backup_events(event_type, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_route_created ON rate_limit_events(route, created_at DESC);

COMMIT;

