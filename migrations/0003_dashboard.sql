-- Add scoring metadata to suggestion_logs for dashboard analytics
ALTER TABLE suggestion_logs ADD COLUMN IF NOT EXISTS scores TEXT;
ALTER TABLE suggestion_logs ADD COLUMN IF NOT EXISTS match_types TEXT;

-- Index for efficient dashboard queries
CREATE INDEX IF NOT EXISTS idx_suggestion_logs_site_created
  ON suggestion_logs (site_id, created_at DESC);
