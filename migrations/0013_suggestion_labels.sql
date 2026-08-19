-- BAT-63: hand-labeled ground truth for served suggestions, so matcher/
-- threshold changes can be measured against real precision instead of
-- guessed. Columns added directly to suggestion_logs (mirrors the pattern
-- in 0003_dashboard.sql) rather than a separate table, since a label is a
-- 1:1 annotation of an existing row.
ALTER TABLE suggestion_logs ADD COLUMN IF NOT EXISTS label TEXT
  CHECK (label IN ('correct', 'incorrect'));
ALTER TABLE suggestion_logs ADD COLUMN IF NOT EXISTS label_notes TEXT;
ALTER TABLE suggestion_logs ADD COLUMN IF NOT EXISTS labeled_at TIMESTAMP;
ALTER TABLE suggestion_logs ADD COLUMN IF NOT EXISTS labeled_by TEXT;

-- Fast "give me unlabeled rows to sample from" lookups for the weekly
-- labeling script (scripts/label-suggestions.ts).
CREATE INDEX IF NOT EXISTS idx_suggestion_logs_unlabeled
  ON suggestion_logs (created_at DESC)
  WHERE label IS NULL;
