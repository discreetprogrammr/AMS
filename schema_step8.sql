-- Step 8 — Clients module.
--
-- Reference-design note: the horizoncare-360 reference app has separate
-- `clients` and `machines` tables. In AMS those already exist conceptually
-- as `organizations` and `assets` (down to the same RLS-scoping role
-- client_viewer relies on via my_organization_id()) — adding parallel
-- `clients`/`machines` tables would just split the same real-world entity
-- across two schemas with no way to keep them in sync. So instead of
-- copying the reference schema literally, this migration adds the one
-- genuinely missing field (email) to what we already have, and gives
-- staff a UI to manage it — same entity, no duplication.

alter table organizations
  add column if not exists email text;

-- Neither organizations nor sites had audit logging — every other
-- editable entity in the app does. Since this step adds a real staff UI
-- for creating/editing both, bring them in line.
create trigger organizations_audit after insert or update or delete on organizations
  for each row execute function log_audit();
create trigger sites_audit after insert or update or delete on sites
  for each row execute function log_audit();
