-- Daily suggestion-log rollups (BAT-55).
--
-- suggestion_logs grows without bound (~300k rows/day at 1,000 sites) and the
-- dashboard scanned it raw on every load: getStats() ran COUNT(*) over the
-- whole table and getMatchQualityStats() matched the match_types JSON blob
-- with LIKE '%moved%'. Daily rollups keyed by (site_id, day) keep the
-- aggregate counts forever; raw rows are pruned after
-- SUGGESTION_LOG_RETENTION_DAYS (60) by the daily cron — see
-- src/lib/suggestion-rollups.ts.
--
-- Match-type counts are real queryable columns (the matcher only ever emits
-- 'moved' | 'similar' | 'related'), not a JSON blob re-matched with LIKE.
CREATE TABLE IF NOT EXISTS suggestion_rollups (
  site_id TEXT NOT NULL,
  day DATE NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  moved_count INTEGER NOT NULL DEFAULT 0,
  similar_count INTEGER NOT NULL DEFAULT 0,
  related_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, day)
);

-- Supports the cron's range scan for a day and batched retention deletes.
CREATE INDEX IF NOT EXISTS idx_suggestion_logs_created_at
  ON suggestion_logs (created_at);
