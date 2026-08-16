-- Public read key, domain verification, reclaim tokens.
-- Existing sites are grandfathered as verified so current installs keep serving.

ALTER TABLE sites ADD COLUMN IF NOT EXISTS public_key TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS verification_token TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS reclaim_token TEXT;

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
