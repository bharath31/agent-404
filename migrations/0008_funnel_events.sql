-- Durable audit-to-install conversion funnel events (BAT-42).
-- Replaces the module-level in-memory eventsBuffer in src/lib/funnel-telemetry.ts,
-- which was per-isolate and reset on cold start, making GET /api/admin/funnel
-- reflect only whichever instance happened to serve that request instead of
-- real global traffic.
CREATE TABLE IF NOT EXISTS funnel_events (
  id SERIAL PRIMARY KEY,
  step TEXT NOT NULL,
  domain TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funnel_events_step ON funnel_events (step);
CREATE INDEX IF NOT EXISTS idx_funnel_events_created_at ON funnel_events (created_at);
