BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE,
  display_name text,
  status text NOT NULL DEFAULT 'pending',
  locale text NOT NULL DEFAULT 'de',
  timezone text NOT NULL DEFAULT 'Europe/Berlin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email citext,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash text NOT NULL UNIQUE,
  user_agent_hash text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS twins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  visibility text NOT NULL DEFAULT 'private',
  default_language text NOT NULL DEFAULT 'de',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS twin_profiles (
  twin_id uuid PRIMARY KEY REFERENCES twins(id) ON DELETE CASCADE,
  bio text,
  persona_summary text,
  communication_style jsonb NOT NULL DEFAULT '{}'::jsonb,
  values_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  safety_boundaries jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric(5,4),
  last_built_at timestamptz
);

CREATE TABLE IF NOT EXISTS twin_collaborators (
  twin_id uuid NOT NULL REFERENCES twins(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (twin_id, user_id)
);

CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  twin_id uuid REFERENCES twins(id) ON DELETE SET NULL,
  consent_type text NOT NULL,
  purpose text NOT NULL,
  version text NOT NULL,
  status text NOT NULL,
  source text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  twin_id uuid REFERENCES twins(id) ON DELETE SET NULL,
  storage_bucket text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  original_filename text,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  checksum_sha256 text,
  status text NOT NULL DEFAULT 'requested',
  privacy text NOT NULL DEFAULT 'private',
  sensitivity text NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz,
  processed_at timestamptz,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  storage_bucket text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  twin_id uuid REFERENCES twins(id) ON DELETE SET NULL,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 100,
  attempts integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS memory_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id uuid NOT NULL REFERENCES twins(id) ON DELETE CASCADE,
  upload_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  title text,
  language text NOT NULL DEFAULT 'de',
  sensitivity text NOT NULL DEFAULT 'private',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS memory_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES memory_sources(id) ON DELETE CASCADE,
  twin_id uuid NOT NULL REFERENCES twins(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  token_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS memory_vectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id uuid NOT NULL REFERENCES memory_chunks(id) ON DELETE CASCADE,
  twin_id uuid NOT NULL REFERENCES twins(id) ON DELETE CASCADE,
  embedding_model text NOT NULL,
  embedding_dimension integer NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id uuid NOT NULL REFERENCES twins(id) ON DELETE CASCADE,
  source_id uuid REFERENCES memory_sources(id) ON DELETE SET NULL,
  fact_type text NOT NULL,
  content text NOT NULL,
  confidence_score numeric(5,4) NOT NULL DEFAULT 0,
  sensitivity text NOT NULL DEFAULT 'private',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  twin_id uuid NOT NULL REFERENCES twins(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  model text,
  token_input integer NOT NULL DEFAULT 0,
  token_output integer NOT NULL DEFAULT 0,
  latency_ms integer,
  safety_status text NOT NULL DEFAULT 'allowed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_message_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  memory_chunk_id uuid REFERENCES memory_chunks(id) ON DELETE SET NULL,
  relevance_score numeric(8,6),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moderation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL,
  resource_id uuid,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  flag_type text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  severity text NOT NULL DEFAULT 'medium',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  ip_hash text,
  user_agent_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cost_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  twin_id uuid REFERENCES twins(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text,
  event_type text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_micro_usd bigint NOT NULL DEFAULT 0,
  latency_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_twins_owner ON twins(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user_twin ON uploads(user_id, twin_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status_priority ON processing_jobs(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_twin ON memory_chunks(twin_id);
CREATE INDEX IF NOT EXISTS idx_memory_sources_twin_sensitivity ON memory_sources(twin_id, sensitivity);
CREATE INDEX IF NOT EXISTS idx_memory_vectors_twin ON memory_vectors(twin_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_twin ON chat_sessions(user_id, twin_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_cost_events_user_twin ON cost_events(user_id, twin_id, created_at);

COMMIT;

