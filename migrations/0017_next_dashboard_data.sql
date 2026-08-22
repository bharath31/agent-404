-- Next.js multi-site dashboard data model.
--
-- This migration is additive and intentionally leaves audit_reports and
-- funnel_events independent from sites: public audit history and aggregate
-- acquisition telemetry survive an owner's hard site deletion.

-- Key rotation keeps exactly one overlapping credential for 24 hours. The
-- application never exposes either previous key; only the new value is
-- returned by the explicit rotation mutation.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS previous_api_key TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS previous_api_key_expires_at TIMESTAMPTZ;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS previous_public_key TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS previous_public_key_expires_at TIMESTAMPTZ;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS reindex_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sites_previous_api_key
  ON sites (previous_api_key)
  WHERE previous_api_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sites_previous_public_key
  ON sites (previous_public_key)
  WHERE previous_public_key IS NOT NULL;

-- Clean legacy orphans before installing referential constraints. Each
-- statement's affected-row count is printed by migrations/run.ts so preview
-- migration cleanup can be inspected before the production cutover.
DELETE FROM pages p
WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = p.site_id);

DELETE FROM suggestion_logs sl
WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = sl.site_id);

DELETE FROM suggestion_rollups sr
WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = sr.site_id);

DELETE FROM recovery_events re
WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = re.site_id);

DELETE FROM install_probes ip
WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = ip.site_id);

-- Drop every top-level FK from these site-owned tables to sites. This handles
-- both the original 0001 constraint and the partition-parent constraint made
-- by 0014 without trying to drop inherited child constraints twice.
DO $cascade_fks$
DECLARE
  target_table TEXT;
  fk_name TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'pages',
    'suggestion_logs',
    'suggestion_rollups',
    'recovery_events',
    'install_probes'
  ]
  LOOP
    FOR fk_name IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid = target_table::regclass
        AND c.confrelid = 'sites'::regclass
        AND c.conparentid = 0
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', target_table, fk_name);
    END LOOP;
  END LOOP;
END
$cascade_fks$;

ALTER TABLE pages
  ADD CONSTRAINT pages_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE suggestion_logs
  ADD CONSTRAINT suggestion_logs_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE suggestion_rollups
  ADD CONSTRAINT suggestion_rollups_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE recovery_events
  ADD CONSTRAINT recovery_events_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE install_probes
  ADD CONSTRAINT install_probes_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;

-- Stable keyset pagination for the dashboard's two unbounded inventories.
CREATE INDEX IF NOT EXISTS idx_recovery_events_site_created_id
  ON recovery_events (site_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_pages_site_last_seen_id
  ON pages (site_id, last_seen DESC, id DESC);
