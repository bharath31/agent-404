-- Public read key, domain verification, reclaim tokens.
-- Existing rows are grandfathered as verified (pre-PR registrations had no
-- ownership check). Real owners of those domains use POST /api/sites/reclaim
-- (24h cooling-off if the row is already verified). Audit existing domains
-- after deploy; this is not an automatic re-verification.

ALTER TABLE sites ADD COLUMN IF NOT EXISTS public_key TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS verification_token TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS reclaim_token TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS reclaim_requested_at TIMESTAMP;

UPDATE sites
SET public_key = 'pk_' || replace(gen_random_uuid()::text, '-', '')
WHERE public_key IS NULL;

UPDATE sites
SET verification_token = 'vf_' || replace(gen_random_uuid()::text, '-', '')
WHERE verification_token IS NULL;

UPDATE sites
SET verified_at = created_at
WHERE verified_at IS NULL;

ALTER TABLE sites ALTER COLUMN public_key SET NOT NULL;
ALTER TABLE sites ALTER COLUMN verification_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_public_key ON sites (public_key);
