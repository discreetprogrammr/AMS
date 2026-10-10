-- Step 49: Equipment stocktake for the internal register [idempotent]. A
-- stocktake is a physical count of PHtek's own equipment: a snapshot of
-- every active internal item at the moment it is started, then a result per
-- item (found, missing, or found with a different holder), a condition note
-- and who checked it. Nothing here changes the register itself: finishing a
-- count produces a report; HR edits the items afterwards.
--
-- Separate from the client Asset Verification (inventory_cycles), which is
-- per site and is not touched. Internal organizations only: the app builds
-- the snapshot from internal assets, and the tables hold nothing else.
--
-- Items keep their own copy of the tag, description and expected holder, so
-- a stocktake still reads correctly after an item is edited or deleted
-- (asset_id is set to null on delete, which also means these rows never
-- block deleting an asset). No audit triggers on purpose: log_audit would
-- put these rows into the Audit Log page, which is meant for client-facing
-- records. created_by / checked_by say who did what.
--
-- Safe to run more than once.

create table if not exists equipment_stocktakes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope_segment text check (scope_segment in ('pacific_horizon_tek', 'team_fridays_digital')),  -- null = all segments
  status text not null default 'open' check (status in ('open', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references profiles(id) on delete set null
);

create table if not exists equipment_stocktake_items (
  id uuid primary key default gen_random_uuid(),
  stocktake_id uuid not null references equipment_stocktakes(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  asset_tag text not null,
  description text,
  expected_custodian text,
  expected_department text,
  result text check (result in ('found', 'missing', 'different_holder')),  -- null = not counted yet
  actual_custodian text,
  condition_note text,
  checked_at timestamptz,
  checked_by uuid references profiles(id) on delete set null
);

create index if not exists equipment_stocktake_items_stocktake_idx
  on equipment_stocktake_items (stocktake_id, asset_tag);

alter table equipment_stocktakes enable row level security;
alter table equipment_stocktake_items enable row level security;
grant select, insert, update, delete on equipment_stocktakes to authenticated;
grant select, insert, update, delete on equipment_stocktake_items to authenticated;

drop policy if exists "staff manage equipment stocktakes" on equipment_stocktakes;
create policy "staff manage equipment stocktakes" on equipment_stocktakes
  for all using (is_internal_staff()) with check (is_internal_staff());

drop policy if exists "staff manage equipment stocktake items" on equipment_stocktake_items;
create policy "staff manage equipment stocktake items" on equipment_stocktake_items
  for all using (is_internal_staff()) with check (is_internal_staff());
