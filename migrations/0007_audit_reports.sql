-- Standing audit reports (BAT-38, BAT-39). Previously kept in a module-level
-- `Map` in src/api/routes/audit.ts — not durable across serverless isolates,
-- so a report created by POST /api/audit on one instance 404'd when a social
-- crawler fetched its OG image or /report/:id permalink from a different
-- instance moments later. This table is the durable replacement.

CREATE TABLE IF NOT EXISTS audit_reports (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  score INTEGER NOT NULL,
  claudebot_probe JSONB NOT NULL,
  summary JSONB NOT NULL,
  permalink TEXT NOT NULL,
  og_image_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_reports_domain ON audit_reports(domain);
CREATE INDEX IF NOT EXISTS idx_audit_reports_created_at ON audit_reports(created_at);
