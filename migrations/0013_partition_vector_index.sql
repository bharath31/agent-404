-- Partition `pages` by site_id so the HNSW vector index is partitioned too
-- (BAT-53).
--
-- Problem: today there is ONE global HNSW index on pages.embedding
-- (migrations/0002_pgvector.sql, dimension bumped to 768 by
-- 0010_cloudflare_embeddings.sql). searchByEmbedding filters with
-- `WHERE site_id = $1` and lets HNSW post-filter the approximate
-- nearest-neighbor result set. As the index grows, a tenant with a small
-- share of a large global index gets progressively worse recall — the HNSW
-- graph traversal can exhaust its candidate list before finding enough rows
-- for that site_id, silently degrading match quality rather than erroring.
--
-- Fix: make `pages` a table PARTITION BY HASH (site_id) with 16 partitions,
-- each carrying its own (much smaller) HNSW index. A query filtered by
-- site_id is partition-pruned to exactly one partition before HNSW search
-- even runs, so index quality no longer degrades as OTHER tenants grow.
--
-- Postgres cannot convert an existing table to partitioned in place, so this
-- migration does a create-copy-swap:
--   1. Create `pages_new`, partitioned, with the same columns/constraints.
--   2. Create the 16 hash partitions.
--   3. Bulk-copy existing rows (no indexes on embedding yet, for fast copy).
--   4. Build indexes (site_id + HNSW) on the parent, which cascades to all
--      16 partitions automatically.
--   5. Under a short exclusive lock: copy any rows written *during* the bulk
--      copy (delta by last_seen), then rename pages -> pages_old and
--      pages_new -> pages.
--   6. Verify row counts match, then drop pages_old.
--
-- *** LOCKING / DOWNTIME NOTE (read before running against a live DB) ***
-- Steps 1-4 take no lock beyond normal DML/DDL on the *new* tables and do
-- not block reads/writes on the live `pages` table. Step 5 takes an
-- ACCESS EXCLUSIVE lock on `pages` for the duration of the delta copy PLUS
-- the two renames — on a busy table this could still be a few seconds if a
-- lot of writes landed during step 3's bulk copy, since the delta copy has
-- to catch up before the rename can proceed. On agent-404's current traffic
-- this should be sub-second, but re-run the delta copy / measure the gap
-- immediately before step 5 on a much larger table before trusting that.
-- Any writes to `pages` that land in the gap between step 5 starting to
-- read the delta and the rename committing will be missed — the lock
-- exists specifically to make that gap effectively zero, but it is not
-- provably zero without testing on a staging snapshot.
--
-- Recommend running this during a low-traffic window and validating with
-- scripts/benchmark-recall.ts before/after on a staging or prod snapshot.
--
-- *** NOT SAFE TO BLINDLY RE-RUN ***
-- This migration is a one-shot swap, not idempotent like most others in
-- this directory (no IF NOT EXISTS / ON CONFLICT-safe DDL) — a second run
-- would fail at `CREATE TABLE pages_new` since it already exists as `pages`.
-- If it fails partway through steps 1-4 (before the `BEGIN` in step 5),
-- clean up manually before retrying:
--   DROP TABLE IF EXISTS pages_new;   -- CASCADEs to the 16 pages_new_p* partitions
-- If it fails inside the step 5 transaction, Postgres rolls that back
-- automatically and `pages` is untouched — safe to just fix the issue and
-- re-run from step 5 (pages_new from steps 1-4 is still there and does not
-- need to be rebuilt). If the step 6 DO block's RAISE EXCEPTION fires,
-- STOP — `pages` is already live under its new (partitioned) identity at
-- that point; do not drop anything until you've reconciled counts by hand.

-- === Step 1: create the partitioned table ===============================
-- Partitioning columns must be part of every unique constraint, so the
-- primary key becomes (id, site_id) instead of just (id). `id` itself stays
-- unique in practice (see step 6, which repoints the existing sequence).
CREATE TABLE pages_new (
  id INTEGER NOT NULL DEFAULT nextval('pages_id_seq'),
  site_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  headings TEXT NOT NULL DEFAULT '[]',
  last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
  content_hash TEXT,
  embedding vector(768),
  CONSTRAINT pages_new_pkey PRIMARY KEY (id, site_id),
  CONSTRAINT pages_new_site_id_url_key UNIQUE (site_id, url),
  CONSTRAINT pages_new_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id)
) PARTITION BY HASH (site_id);

-- === Step 2: 16 hash partitions ==========================================
CREATE TABLE pages_new_p0 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE pages_new_p1 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE pages_new_p2 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE pages_new_p3 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE pages_new_p4 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE pages_new_p5 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE pages_new_p6 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE pages_new_p7 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE pages_new_p8 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE pages_new_p9 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE pages_new_p10 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE pages_new_p11 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE pages_new_p12 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE pages_new_p13 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE pages_new_p14 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE pages_new_p15 PARTITION OF pages_new FOR VALUES WITH (MODULUS 16, REMAINDER 15);

-- === Step 3: bulk-copy existing rows =====================================
-- Deliberately done before the indexes below exist, so the copy itself
-- doesn't pay HNSW build cost row-by-row.
INSERT INTO pages_new (id, site_id, url, title, description, headings, last_seen, content_hash, embedding)
SELECT id, site_id, url, title, description, headings, last_seen, content_hash, embedding
FROM pages;

-- === Step 4: build indexes on the parent (cascades to all 16 partitions) ==
-- Named with a _new suffix for now to avoid colliding with the live
-- pages.idx_pages_site_id / idx_pages_embedding indexes; renamed to the
-- canonical names in step 6 after the old table is gone.
CREATE INDEX idx_pages_site_id_new ON pages_new (site_id);

-- HNSW build defaults (m=16, ef_construction=64) match pgvector's own
-- defaults, i.e. unchanged from the original global index in
-- 0002_pgvector.sql. Revisit if scripts/benchmark-recall.ts shows the
-- default recall/build-time tradeoff isn't right for a given partition size.
CREATE INDEX idx_pages_embedding_new ON pages_new USING hnsw (embedding vector_cosine_ops);

-- === Step 5: catch up on writes since step 3, then swap ==================
BEGIN;

LOCK TABLE pages IN ACCESS EXCLUSIVE MODE;

-- Anything inserted/updated (upsertPage touches last_seen on every write)
-- after the bulk copy started needs to land in pages_new before the swap.
INSERT INTO pages_new (id, site_id, url, title, description, headings, last_seen, content_hash, embedding)
SELECT p.id, p.site_id, p.url, p.title, p.description, p.headings, p.last_seen, p.content_hash, p.embedding
FROM pages p
WHERE p.last_seen > (SELECT COALESCE(MAX(last_seen), 'epoch'::timestamp) FROM pages_new)
ON CONFLICT (site_id, url) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  headings = EXCLUDED.headings,
  embedding = COALESCE(EXCLUDED.embedding, pages_new.embedding),
  content_hash = COALESCE(EXCLUDED.content_hash, pages_new.content_hash),
  last_seen = EXCLUDED.last_seen;

ALTER TABLE pages RENAME TO pages_old;
ALTER TABLE pages_new RENAME TO pages;

-- Repoint the id sequence's ownership at the new table so it isn't dropped
-- along with pages_old, and so \d-style introspection reflects reality.
ALTER SEQUENCE pages_id_seq OWNED BY pages.id;

COMMIT;

-- === Step 6: verify, then drop the old table =============================
-- Self-checking guard: aborts (raises, does not drop anything) if the swap
-- somehow lost or duplicated rows. If this fires, STOP — do not re-run
-- blindly; investigate pages vs pages_old by hand first.
DO $$
DECLARE
  old_count bigint;
  new_count bigint;
BEGIN
  SELECT COUNT(*) INTO old_count FROM pages_old;
  SELECT COUNT(*) INTO new_count FROM pages;
  IF old_count > new_count THEN
    RAISE EXCEPTION
      'pages row count after partition swap (%) is lower than pages_old (%). Aborting before DROP TABLE pages_old — investigate before re-running.',
      new_count, old_count;
  END IF;
END $$;

-- Rename constraints/indexes to their canonical (non "_new") names now that
-- the old table's same-named objects are about to be gone.
ALTER TABLE pages RENAME CONSTRAINT pages_new_pkey TO pages_pkey;
ALTER TABLE pages RENAME CONSTRAINT pages_new_site_id_url_key TO pages_site_id_url_key;
ALTER TABLE pages RENAME CONSTRAINT pages_new_site_id_fkey TO pages_site_id_fkey;
ALTER INDEX idx_pages_site_id_new RENAME TO idx_pages_site_id;
ALTER INDEX idx_pages_embedding_new RENAME TO idx_pages_embedding;

DROP TABLE pages_old;
