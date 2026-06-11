BEGIN;

CREATE TABLE IF NOT EXISTS public_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL,
  resource_id uuid,
  locale text NOT NULL,
  slug text NOT NULL,
  canonical_url text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  page_type text NOT NULL,
  index_status text NOT NULL DEFAULT 'noindex',
  consent_status text NOT NULL DEFAULT 'pending',
  trust_score numeric(5,4) NOT NULL DEFAULT 0,
  structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  open_graph jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_summary text,
  ai_summary text,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (locale, slug)
);

CREATE TABLE IF NOT EXISTS knowledge_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  canonical_name text NOT NULL,
  locale text,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  aliases text[] NOT NULL DEFAULT '{}'::text[],
  description text,
  confidence_score numeric(5,4) NOT NULL DEFAULT 0,
  source_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (entity_type, canonical_name, locale)
);

CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  predicate text NOT NULL,
  object_entity_id uuid REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  object_literal text,
  source_page_id uuid REFERENCES public_pages(id) ON DELETE SET NULL,
  source_fact_id uuid REFERENCES memory_facts(id) ON DELETE SET NULL,
  confidence_score numeric(5,4) NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (object_entity_id IS NOT NULL OR object_literal IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public_pages(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid,
  source_url text,
  title text,
  quote text,
  checksum_sha256 text,
  trust_signal text NOT NULL DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS semantic_index_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public_pages(id) ON DELETE CASCADE,
  locale text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  entity_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  citation_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  embedding_model text,
  embedding_dimension integer,
  embedding vector(1536),
  fulltext tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_pages_indexable
  ON public_pages (locale, page_type, updated_at DESC)
  WHERE index_status = 'index' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_entities_type_name
  ON knowledge_entities (entity_type, canonical_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_subject
  ON knowledge_relationships (subject_entity_id, predicate)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_public_citations_page
  ON public_citations (page_id, source_type);

CREATE INDEX IF NOT EXISTS idx_semantic_index_documents_fulltext
  ON semantic_index_documents USING gin (fulltext);

CREATE INDEX IF NOT EXISTS idx_semantic_index_documents_embedding
  ON semantic_index_documents USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMIT;
