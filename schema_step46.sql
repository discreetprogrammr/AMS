-- Step 46: Internal equipment register [idempotent]. HorizonCare360 also
-- holds Pacific Horizon Tek's own staff equipment (laptops, phones,
-- monitors, Team Fridays Digital's camera kit, ...) in the existing
-- `assets` table, under one new internal organization. See
-- docs/HorizonCare360_Internal_Equipment_Spec_v0.1.md sections 4.1-4.3.
--
-- Everything here is additive. Existing client assets are untouched: every
-- new asset column is nullable except `quantity`, which defaults to 1, so
-- no existing row needs a backfill. Safe to run more than once.
--
-- Deliberately NOT in this file (each is a separate, later decision):
--  - Importing the 73 spreadsheet items, or the desktop parent asset
--    (spec 4.4). That is the data-load PR.
--  - Excluding internal assets from analytics, cron jobs, Fleet Map etc.
--    That is app code (spec section 6) and must land before the data load.

-- ── 4.1 Internal organization flag ───────────────────────────────────────

alter table organizations add column if not exists is_internal boolean not null default false;

-- ── 4.2 New asset columns ────────────────────────────────────────────────
-- Existing columns reused as-is for internal items: asset_tag (Asset No.),
-- brand, model, serial_number, custodian, warranty_end_date, site_id.
-- equipment_type is always 'other' for internal items.

alter table assets
  add column if not exists segment text,
  add column if not exists asset_category text,
  add column if not exists description text,
  add column if not exists quantity integer not null default 1,
  add column if not exists ownership text,
  add column if not exists date_acquired date,
  add column if not exists acquisition_cost numeric(12,2),   -- PHP
  add column if not exists supplier text,
  add column if not exists department text,
  add column if not exists date_issued date,
  add column if not exists assignment_status text,
  add column if not exists condition text,
  add column if not exists return_disposal_date date,
  add column if not exists remarks text,
  -- Parts of a desktop point at their parent asset (spec 4.4). A deleted
  -- parent orphans its parts rather than deleting them.
  add column if not exists parent_asset_id uuid references assets(id) on delete set null;

-- Check constraints. Postgres has no `add constraint if not exists`, so each
-- is guarded by a pg_constraint lookup. NULL passes a CHECK, which is what
-- keeps these columns optional for client assets.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assets_segment_check' and conrelid = 'assets'::regclass) then
    alter table assets add constraint assets_segment_check
      check (segment in ('pacific_horizon_tek', 'team_fridays_digital'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'assets_ownership_check' and conrelid = 'assets'::regclass) then
    alter table assets add constraint assets_ownership_check
      check (ownership in ('company_owned', 'leased_rented', 'client_owned', 'other'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'assets_assignment_status_check' and conrelid = 'assets'::regclass) then
    alter table assets add constraint assets_assignment_status_check
      check (assignment_status in ('assigned', 'in_stock', 'returned', 'retired_disposed', 'lost'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'assets_condition_check' and conrelid = 'assets'::regclass) then
    alter table assets add constraint assets_condition_check
      check (condition in ('new', 'good', 'fair', 'for_repair', 'damaged', 'lost'));
  end if;
end
$$;

-- ── 4.1 Seed: the internal organization and its one site ─────────────────
-- `sites` has no name column (schema.sql), so "Head Office" is stored in
-- `address`, which is what the UI shows as a site's label.

insert into organizations (name, is_internal)
select 'Pacific Horizon Tek, Inc.', true
where not exists (
  select 1 from organizations where name = 'Pacific Horizon Tek, Inc.'
);

insert into sites (organization_id, address)
select o.id, 'Head Office'
from organizations o
where o.name = 'Pacific Horizon Tek, Inc.'
  and o.is_internal
  and not exists (
    select 1 from sites s where s.organization_id = o.id and s.address = 'Head Office'
  );

-- ── 4.2 Rule: segment is non-null if and only if the organization is internal
-- A CHECK constraint cannot read another table, so this is a trigger. Two
-- sides: assets (what you insert/update) and organizations (so flipping
-- is_internal on an org that already has assets cannot silently break it).

create or replace function enforce_asset_segment() returns trigger
language plpgsql as $$
declare
  org_is_internal boolean;
begin
  select is_internal into org_is_internal from organizations where id = NEW.organization_id;
  if org_is_internal and NEW.segment is null then
    raise exception 'assets.segment is required when the organization is internal (asset_tag %)', NEW.asset_tag;
  end if;
  if not coalesce(org_is_internal, false) and NEW.segment is not null then
    raise exception 'assets.segment must be null when the organization is not internal (asset_tag %)', NEW.asset_tag;
  end if;
  return NEW;
end;
$$;

drop trigger if exists assets_enforce_segment on assets;
create trigger assets_enforce_segment before insert or update of organization_id, segment on assets
  for each row execute function enforce_asset_segment();

create or replace function enforce_org_internal_segments() returns trigger
language plpgsql as $$
begin
  if NEW.is_internal and exists (select 1 from assets where organization_id = NEW.id and segment is null) then
    raise exception 'Cannot mark organization % internal: it has assets with no segment', NEW.id;
  end if;
  if not NEW.is_internal and exists (select 1 from assets where organization_id = NEW.id and segment is not null) then
    raise exception 'Cannot mark organization % non-internal: it has assets with a segment', NEW.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists organizations_enforce_internal_segments on organizations;
create trigger organizations_enforce_internal_segments before update of is_internal on organizations
  for each row execute function enforce_org_internal_segments();

-- ── 4.3 Status mapping (documentation only, no SQL) ──────────────────────
-- assets.status keeps meaning "operating state" for internal items too, and
-- the app (data-load script, asset form) sets it from condition /
-- assignment_status:
--   good / new / fair                 -> operational
--   condition = for_repair            -> down
--   condition = damaged               -> attention
--   assignment_status retired_disposed or lost -> unserviceable
-- Not enforced in the database: asset_status already holds all four values
-- (schema_step15.sql added 'attention' and 'down'), and a trigger deriving
-- one column from two others would surprise anyone editing status by hand.

-- No RLS or grant changes needed: the new columns sit on tables that
-- already have row-level policies, and the existing `assets_audit` trigger
-- (log_audit, to_jsonb of the whole row) captures them automatically.
