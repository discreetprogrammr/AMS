-- Step 32: Stock receiving ("In") to go with the parts-used logging
-- ("Out") schema_step31.sql already added — closes the loop so the
-- Inventory tab reflects parts arriving from a supplier, not just parts
-- consumed on a work order.
--
-- Run this once in the Supabase SQL editor (after schema_step31.sql).

create table part_receipts (
  id uuid primary key default gen_random_uuid(),
  part_id uuid references parts(id) on delete set null,
  -- Same defensive-snapshot reasoning as work_order_parts.part_name_snapshot
  -- (schema_step31.sql) — stays readable even if the catalog entry is
  -- later renamed or deleted.
  part_name_snapshot text not null,
  quantity_received int not null check (quantity_received > 0),
  supplier text,
  reference_number text,        -- PO number, invoice number, delivery receipt, etc.
  unit_cost numeric(12,2),      -- what was actually paid this delivery, which can
                                 -- drift from parts.unit_cost over time — kept per
                                 -- receipt rather than overwriting the catalog value.
  notes text,
  received_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create trigger part_receipts_audit after insert or update or delete on part_receipts
  for each row execute function log_audit();

-- Mirror of decrement_part_stock (schema_step31.sql) — adds instead of
-- subtracts. Same security definer reasoning: needs to reliably update
-- `parts` regardless of exactly which staff member's RLS-scoped session
-- triggers it.
create or replace function increment_part_stock() returns trigger
language plpgsql security definer as $$
begin
  update parts
    set quantity_on_hand = quantity_on_hand + new.quantity_received,
        updated_at = now()
    where id = new.part_id;
  return new;
end;
$$;

create trigger part_receipts_increment_stock
  after insert on part_receipts
  for each row execute function increment_part_stock();

-- Staff-only, same as parts/work_order_parts.
alter table part_receipts enable row level security;

create policy "staff manage part receipts" on part_receipts
  for all using (is_internal_staff());
