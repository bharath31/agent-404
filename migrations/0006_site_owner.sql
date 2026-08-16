-- Auth0 owner (sub) for dashboard signup/login. NULL = legacy anonymous site.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS owner_sub TEXT;
CREATE INDEX IF NOT EXISTS idx_sites_owner_sub ON sites (owner_sub);
