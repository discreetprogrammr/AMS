-- Step 11 — Inspections module.
--
-- Reference-design note: the reference app's /inspections route is
-- staff-only (useClientRedirect() again) and only ever shows the single
-- most recent inspection record — no list, no way to start a new one from
-- the UI. AMS follows the same three-category checklist shape (Exterior &
-- Safety / Imaging & Detection / System & Software, pass/attention/fail
-- results) but makes it a real workflow: a list of every inspection ever
-- run, a "New Inspection" form, and a detail page per inspection — closer
-- to how the existing Inventory Cycles module already works than to the
-- reference's single-record view.

create type inspection_status as enum ('draft', 'submitted');
create type inspection_result as enum ('pass', 'attention', 'fail');

create table inspections (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  technician_name text,
  inspection_date date not null default current_date,
  status inspection_status not null default 'draft',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per checklist item. Bulk-created from a fixed template when an
-- inspection is started, same "generate rows in bulk at creation time"
-- pattern as inventory_cycle_items in Step 5.
create table inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  category text not null,
  item_name text not null,
  result inspection_result not null default 'pass',
  created_at timestamptz not null default now()
);

create trigger inspections_audit after insert or update or delete on inspections
  for each row execute function log_audit();
create trigger inspection_items_audit after insert or update or delete on inspection_items
  for each row execute function log_audit();

-- Staff-only, same reasoning as work_orders (Step 9) and alerts (Step 10) —
-- the reference redirects clients away from this route too.
alter table inspections enable row level security;
alter table inspection_items enable row level security;

create policy "staff manage inspections" on inspections
  for all using (is_internal_staff());
create policy "staff manage inspection items" on inspection_items
  for all using (is_internal_staff());
