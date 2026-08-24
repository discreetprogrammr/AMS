-- Step 40: SLA policy configuration — the response/resolution targets used
-- by the SLA Performance dashboard widgets and the breach-escalation cron
-- job (lib/sla-escalation.ts) have been two hardcoded constants in
-- lib/sla.ts (8h response / 48h resolution) since that job was first built.
-- This turns them into real, editable data: one global default, plus
-- optional per-organization overrides for a client with a different
-- contracted SLA tier.
--
-- Editing is Super Admin-only (explicit ask, not the usual "any staff"
-- boundary this app uses elsewhere) — an SLA target is closer to a
-- contractual commitment than routine day-to-day data entry, so it gets the
-- same restricted-write tier as Audit Log (schema_step22b.sql's
-- is_super_admin()). Any staff can still read the current policy, same as
-- everyone can already see SLA performance on the dashboard.
--
-- Run this once in the Supabase SQL editor (after schema_step39.sql).

create table sla_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  -- Exactly one row is the global default (is_global = true,
  -- organization_id null); every other row is a per-org override
  -- (is_global = false, organization_id set). The check constraint below
  -- enforces that a row is always exactly one shape, never both or neither.
  is_global boolean not null default false,
  response_target_hours numeric not null check (response_target_hours > 0),
  resolution_target_hours numeric not null check (resolution_target_hours > 0),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  constraint sla_policies_shape check (
    (is_global and organization_id is null) or (not is_global and organization_id is not null)
  )
);

-- Partial unique indexes rather than a plain unique(organization_id) column
-- — a plain unique constraint treats every NULL as distinct from every
-- other NULL, which would happily allow multiple "global" rows to pile up.
-- These two guarantee "at most one global row" and "at most one row per
-- org" without that gap.
create unique index sla_policies_one_global on sla_policies (is_global) where is_global;
create unique index sla_policies_one_per_org on sla_policies (organization_id) where organization_id is not null;

create trigger sla_policies_audit after insert or update or delete on sla_policies
  for each row execute function log_audit();

alter table sla_policies enable row level security;

create policy "staff read sla policies" on sla_policies
  for select using (is_internal_staff());

create policy "super admin manage sla policies" on sla_policies
  for all using (is_super_admin()) with check (is_super_admin());

-- Seed the global default with today's hardcoded values (lib/sla.ts) so
-- behavior doesn't change the moment this migration runs — only once
-- someone actually edits it on /sla-settings. `where not exists` rather
-- than an ON CONFLICT clause keeps this safe to re-run without depending on
-- exactly matching the partial index's conflict-target syntax.
insert into sla_policies (is_global, response_target_hours, resolution_target_hours)
select true, 8, 48
where not exists (select 1 from sla_policies where is_global);
