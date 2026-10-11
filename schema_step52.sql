-- Step 52: Unit on internal equipment, and "For Repair" as an assignment
-- status [idempotent].
--   1. assets.unit: how the quantity is counted (pc, set, unit, pair, lot).
--      Internal equipment only in practice; client assets leave it null. The
--      internal export had a Unit column that came out blank because there
--      was nowhere to keep it. Existing internal items are set to 'pc', which
--      is what HR's spreadsheet has for every row.
--   2. assignment_status gains 'for_repair' (HR's list has For Repair among
--      its statuses). The old check constraint was created inline in step 46,
--      so it is looked up by what it checks rather than assumed.
--
-- Run this BEFORE deploying the app version that saves a Unit or uses the new
-- status: saving an internal item without it fails with a message that says
-- to run this file. Safe to run more than once.

alter table assets add column if not exists unit text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assets_unit_check' and conrelid = 'assets'::regclass) then
    alter table assets add constraint assets_unit_check
      check (unit in ('pc', 'set', 'unit', 'pair', 'lot'));
  end if;
end
$$;

do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'assets'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%assignment_status%'
  loop
    execute format('alter table assets drop constraint %I', c);
  end loop;

  alter table assets add constraint assets_assignment_status_check
    check (assignment_status in ('assigned', 'in_stock', 'for_repair', 'returned', 'retired_disposed', 'lost'));
end
$$;

-- Every existing internal item is counted in pieces, as in the spreadsheet.
update assets
   set unit = 'pc'
 where unit is null
   and organization_id in (select id from organizations where is_internal);
