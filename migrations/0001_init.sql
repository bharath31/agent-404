-- Sites table
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sites_api_key ON sites(api_key);
CREATE INDEX idx_sites_domain ON sites(domain);

-- Pages table
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL REFERENCES sites(id),
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  headings TEXT NOT NULL DEFAULT '[]',
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id, url)
);

CREATE INDEX idx_pages_site_id ON pages(site_id);

-- Suggestion logs
CREATE TABLE IF NOT EXISTS suggestion_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL REFERENCES sites(id),
  dead_url TEXT NOT NULL,
  suggested_urls TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_suggestion_logs_site_id ON suggestion_logs(site_id);
