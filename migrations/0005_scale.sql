-- Scale: content-hash dedup, cron resume, lexical prefilter index
ALTER TABLE pages ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_pages_site_hash ON pages (site_id, content_hash);

ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_cron_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_pages_site_url ON pages (site_id, url);
