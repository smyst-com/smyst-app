BEGIN;

-- Legacy/local SQL hardening reference only.
-- Production uses Legacy edge provider KV + IDrive e2, not this relational schema.

CREATE OR REPLACE FUNCTION smyst_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_touch_updated_at') THEN
    CREATE TRIGGER trg_users_touch_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION smyst_touch_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_twins_touch_updated_at') THEN
    CREATE TRIGGER trg_twins_touch_updated_at
      BEFORE UPDATE ON twins
      FOR EACH ROW
      EXECUTE FUNCTION smyst_touch_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chat_sessions_touch_updated_at') THEN
    CREATE TRIGGER trg_chat_sessions_touch_updated_at
      BEFORE UPDATE ON chat_sessions
      FOR EACH ROW
      EXECUTE FUNCTION smyst_touch_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_public_pages_touch_updated_at') THEN
    CREATE TRIGGER trg_public_pages_touch_updated_at
      BEFORE UPDATE ON public_pages
      FOR EACH ROW
      EXECUTE FUNCTION smyst_touch_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_knowledge_entities_touch_updated_at') THEN
    CREATE TRIGGER trg_knowledge_entities_touch_updated_at
      BEFORE UPDATE ON knowledge_entities
      FOR EACH ROW
      EXECUTE FUNCTION smyst_touch_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_semantic_index_documents_touch_updated_at') THEN
    CREATE TRIGGER trg_semantic_index_documents_touch_updated_at
      BEFORE UPDATE ON semantic_index_documents
      FOR EACH ROW
      EXECUTE FUNCTION smyst_touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_status') THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_status
      CHECK (status IN ('pending', 'active', 'disabled', 'deleted')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_twins_status') THEN
    ALTER TABLE twins ADD CONSTRAINT chk_twins_status
      CHECK (status IN ('draft', 'ready', 'disabled', 'deleted')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_twins_visibility') THEN
    ALTER TABLE twins ADD CONSTRAINT chk_twins_visibility
      CHECK (visibility IN ('private', 'public', 'unlisted')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_consent_records_status') THEN
    ALTER TABLE consent_records ADD CONSTRAINT chk_consent_records_status
      CHECK (status IN ('granted', 'revoked', 'expired', 'pending')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_uploads_status') THEN
    ALTER TABLE uploads ADD CONSTRAINT chk_uploads_status
      CHECK (status IN ('requested', 'url_issued', 'uploaded', 'processing', 'processed', 'failed', 'deleted', 'expired')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_uploads_privacy') THEN
    ALTER TABLE uploads ADD CONSTRAINT chk_uploads_privacy
      CHECK (privacy IN ('private', 'public', 'unlisted')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sensitivity_values_uploads') THEN
    ALTER TABLE uploads ADD CONSTRAINT chk_sensitivity_values_uploads
      CHECK (sensitivity IN ('public', 'private', 'sensitive', 'restricted')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_processing_jobs_status') THEN
    ALTER TABLE processing_jobs ADD CONSTRAINT chk_processing_jobs_status
      CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_chat_messages_role') THEN
    ALTER TABLE chat_messages ADD CONSTRAINT chk_chat_messages_role
      CHECK (role IN ('system', 'user', 'assistant', 'tool')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_chat_message_tokens_nonnegative') THEN
    ALTER TABLE chat_messages ADD CONSTRAINT chk_chat_message_tokens_nonnegative
      CHECK (token_input >= 0 AND token_output >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_confidence_scores_memory_facts') THEN
    ALTER TABLE memory_facts ADD CONSTRAINT chk_confidence_scores_memory_facts
      CHECK (confidence_score >= 0 AND confidence_score <= 1) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_public_pages_index_status') THEN
    ALTER TABLE public_pages ADD CONSTRAINT chk_public_pages_index_status
      CHECK (index_status IN ('index', 'noindex', 'blocked', 'deleted')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_public_pages_consent_status') THEN
    ALTER TABLE public_pages ADD CONSTRAINT chk_public_pages_consent_status
      CHECK (consent_status IN ('pending', 'granted', 'revoked', 'public_domain')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_public_pages_trust_score') THEN
    ALTER TABLE public_pages ADD CONSTRAINT chk_public_pages_trust_score
      CHECK (trust_score >= 0 AND trust_score <= 1) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_knowledge_entities_confidence_score') THEN
    ALTER TABLE knowledge_entities ADD CONSTRAINT chk_knowledge_entities_confidence_score
      CHECK (confidence_score >= 0 AND confidence_score <= 1) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_knowledge_relationships_confidence_score') THEN
    ALTER TABLE knowledge_relationships ADD CONSTRAINT chk_knowledge_relationships_confidence_score
      CHECK (confidence_score >= 0 AND confidence_score <= 1) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_twin_collaborators_user ON twin_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_user_status ON consent_records(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_records_twin_status ON consent_records(twin_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_storage_key_active ON uploads(storage_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_uploads_status_created ON uploads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_twin_status ON uploads(twin_id, status) WHERE twin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_assets_upload ON media_assets(upload_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_upload ON processing_jobs(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_processing_jobs_twin ON processing_jobs(twin_id) WHERE twin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memory_sources_upload ON memory_sources(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memory_vectors_chunk ON memory_vectors(chunk_id);
CREATE INDEX IF NOT EXISTS idx_memory_facts_source ON memory_facts(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_feedback_user_created ON chat_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_user_status ON moderation_flags(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_object ON knowledge_relationships(object_entity_id, predicate) WHERE object_entity_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_source_page ON knowledge_relationships(source_page_id) WHERE source_page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_source_fact ON knowledge_relationships(source_fact_id) WHERE source_fact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_semantic_index_documents_page ON semantic_index_documents(page_id);
CREATE INDEX IF NOT EXISTS idx_semantic_index_documents_locale_created ON semantic_index_documents(locale, created_at DESC);

CREATE OR REPLACE VIEW active_twins AS
SELECT
  t.id,
  t.owner_user_id,
  t.slug,
  t.name,
  t.status,
  t.visibility,
  t.default_language,
  t.created_at,
  t.updated_at
FROM twins t
WHERE t.deleted_at IS NULL
  AND t.status <> 'deleted';

CREATE OR REPLACE VIEW indexable_public_pages AS
SELECT
  id,
  resource_type,
  resource_id,
  locale,
  slug,
  canonical_url,
  title,
  description,
  page_type,
  trust_score,
  updated_at,
  published_at
FROM public_pages
WHERE deleted_at IS NULL
  AND index_status = 'index'
  AND consent_status IN ('granted', 'public_domain');

COMMIT;
