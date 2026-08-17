-- Switch embeddings to Cloudflare Workers AI (@cf/baai/bge-base-en-v1.5, 768 dims).
-- Every existing row has NULL embedding (the OpenRouter path never returned
-- vectors), so the dimension change is lossless.
DROP INDEX IF EXISTS idx_pages_embedding;
ALTER TABLE pages ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768);
CREATE INDEX IF NOT EXISTS idx_pages_embedding ON pages USING hnsw (embedding vector_cosine_ops);
