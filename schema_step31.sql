-- Step 31: Spare parts / consumables inventory — stock levels and
-- parts-used logging tied to work orders.
--
-- Deliberately separate from two things that already exist and sound
-- similar but aren't this:
--   - inventory_cycles / inventory_cycle_items (schema_step5.sql) verifies
--     that ASSETS physically exist and are serviceable (an annual physical
--     count). Nothing to do with parts stock.
--   - service_record_parts (schema.sql) is a free-text "what parts were
--     used on this report" log tied to a service_record/PDF report, with
--     no catalog behind it and no stock tracking (still used as-is by the
--     CM report form's "Parts Replaced" field — untouched here).
-- This step adds the real thing: a canonical parts catalog with an actual
-- on-hand quantity, and a usage log tied to work orders that decrements it.
--
-- Run this once in the Supabase SQL editor (after schema_step30.sql).

create table parts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  category text,
  unit text not null default 'pcs',
  quantity_on_hand int not null default 0,
  -- 0 = no threshold set yet, not "reorder immediately." The UI only
  -- flags "Low Stock" once this is > 0 and quantity_on_hand has dropped to
  -- or below it.
  reorder_level int not null default 0,
  unit_cost numeric(12,2),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger parts_audit after insert or update or delete on parts
  for each row execute function log_audit();

create table work_order_parts (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  part_id uuid references parts(id) on delete set null,
  -- Captured at insert time so a usage row stays meaningful (readable part
  -- name) even if the catalog entry it pointed to is later renamed or
  -- deleted — same defensive-snapshot approach as other places in this
  -- schema that keep a label even when the live join might disappear.
  part_name_snapshot text not null,
  quantity_used int not null default 1 check (quantity_used > 0),
  logged_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create trigger work_order_parts_audit after insert or update or delete on work_order_parts
  for each row execute function log_audit();

-- Keeps parts.quantity_on_hand always in sync with logged usage via a
-- trigger, not two separate app-code calls — so a stock decrement can
-- never happen without the usage row that explains it, or vice versa, even
-- if the request fails partway through. security definer for the same
-- reason log_audit() and the role-check helpers below already use it: this
-- needs to reliably update `parts` regardless of exactly which staff
-- member's RLS-scoped session triggers it. Deliberately allowed to go
-- negative rather than clamped at 0 — a negative on-hand count is itself
-- useful signal (usage was logged faster than stock was replenished), and
-- the UI treats <= reorder_level as "needs restock" either way.
create or replace function decrement_part_stock() returns trigger
language plpgsql security definer as $$
begin
  update parts
    set quantity_on_hand = quantity_on_hand - new.quantity_used,
        updated_at = now()
    where id = new.part_id;
  return new;
end;
$$;

create trigger work_order_parts_decrement_stock
  after insert on work_order_parts
  for each row execute function decrement_part_stock();

-- Staff-only end to end, same reasoning as work_orders/inventory_cycles —
-- spare-parts stock is internal ops, not part of the client portal.
alter table parts enable row level security;
alter table work_order_parts enable row level security;

create policy "staff manage parts" on parts
  for all using (is_internal_staff());
create policy "staff manage work order parts" on work_order_parts
  for all using (is_internal_staff());
