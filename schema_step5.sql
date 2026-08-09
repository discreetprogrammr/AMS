-- Pacific Horizon Tek — Asset Management Software
-- Step 5 migration: inventory cycle workflow (COA-style annual physical
-- inventory). Run this AFTER schema.sql — it's additive, not a replacement.
-- Implements Section 2/3/6/7 "Inventory cycle workflow" from AMS_Spec_v0.3.

create type inventory_cycle_status as enum ('open', 'completed');

-- One inventory cycle = one physical count event for one site, per the
-- spec's "a scheduled cycle per site with a checklist" language.
create table inventory_cycles (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  label text not null,                    -- e.g. "Annual Physical Inventory 2026"
  status inventory_cycle_status not null default 'open',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- One row per asset being checked off during a cycle. Created in bulk when
-- a cycle starts (one row per asset at that site at that time).
create table inventory_cycle_items (
  id uuid primary key default gen_random_uuid(),
  inventory_cycle_id uuid not null references inventory_cycles(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references profiles(id),
  condition_notes text,
  created_at timestamptz not null default now()
);

create trigger inventory_cycles_audit after insert or update or delete on inventory_cycles
  for each row execute function log_audit();

-- Internal-ops-only feature — not part of the client portal in the spec,
-- so these are staff-managed end to end, same pattern as assets/tickets.
alter table inventory_cycles enable row level security;
alter table inventory_cycle_items enable row level security;

create policy "staff manage inventory cycles" on inventory_cycles
  for all using (is_internal_staff());

create policy "staff manage inventory cycle items" on inventory_cycle_items
  for all using (is_internal_staff());
