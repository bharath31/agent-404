-- Durable 404 suggestion recovery tracking (BAT-61).
-- Replaces the module-level in-memory activeEvents buffer in src/lib/recovery-tracker.ts,
-- which was per-isolate and reset on cold start, making /api/admin/recovery-metrics
-- reflect only whichever instance happened to serve the request instead of real global traffic.
CREATE TABLE IF NOT EXISTS recovery_events (
  id SERIAL PRIMARY KEY,
  site_id TEXT NOT NULL,
  dead_url TEXT NOT NULL,
  suggested_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  agent_category TEXT NOT NULL,
  user_agent TEXT,
  client_hash TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  recovered BOOLEAN NOT NULL DEFAULT FALSE,
  recovered_url TEXT,
  recovery_latency_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_recovery_events_site_created ON recovery_events (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_events_unrecovered ON recovery_events (recovered) WHERE recovered = FALSE;