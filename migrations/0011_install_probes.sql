-- Durable install-liveness probes (dashboard rework / BAT-31 dogfood gap).
--
-- A probe fetches a dead URL on the customer's own domain with an AI-crawler
-- User-Agent and records what the live 404 response actually contains
-- (Link headers, JSON-LD). This is the only way to answer "is my install
-- working?" — registrations, sitemap indexing, and even served suggestions
-- are all invisible to a middleware that stopped running (the bharath.sh
-- case: dashboard showed all-green while the live site returned a bare 404).
--
-- Written by the manual "Run live check" button (source = 'manual') and by
-- the bounded daily cron pass (source = 'cron').
CREATE TABLE IF NOT EXISTS install_probes (
  id SERIAL PRIMARY KEY,
  site_id TEXT NOT NULL,
  probed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  probe_path TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL, -- 'unrecovered_404' | 'recovered_404' | 'non_404' | 'error'
  has_link_headers BOOLEAN NOT NULL DEFAULT FALSE,
  has_json_ld BOOLEAN NOT NULL DEFAULT FALSE,
  link_header TEXT,
  summary TEXT,
  source TEXT NOT NULL DEFAULT 'manual' -- 'manual' | 'cron'
);

CREATE INDEX IF NOT EXISTS idx_install_probes_site_probed
  ON install_probes (site_id, probed_at DESC);