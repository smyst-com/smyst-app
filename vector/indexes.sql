-- pgvector index plan.
-- HNSW is the default target for low-latency retrieval once enough data exists.
-- Run after initial schema and after choosing the production embedding dimension.

CREATE INDEX IF NOT EXISTS idx_memory_vectors_embedding_hnsw
ON memory_vectors
USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_memory_chunks_content_fts
ON memory_chunks
USING gin (to_tsvector('simple', content));

