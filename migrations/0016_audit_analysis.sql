-- BAT-22: persist the optional deep-analysis payload (discovered pages,
-- broken internal links, orphan pages) alongside the standing audit probe.
ALTER TABLE audit_reports ADD COLUMN IF NOT EXISTS analysis JSONB;
