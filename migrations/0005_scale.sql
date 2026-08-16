-- Scale: content-hash dedup and cron resume.
-- Lookups by (site_id, url) already use UNIQUE(site_id, url) from 0001_init.sql.
ALTER TABLE pages ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_cron_at TIMESTAMP;
