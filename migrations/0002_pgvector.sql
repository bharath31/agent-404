-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to pages
ALTER TABLE pages ADD COLUMN IF NOT EXISTS embedding vector(256);

-- HNSW index for cosine similarity search
CREATE INDEX IF NOT EXISTS idx_pages_embedding ON pages USING hnsw (embedding vector_cosine_ops);
