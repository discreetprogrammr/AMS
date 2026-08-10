-- Step 22 (part 2 of 2): run this AFTER schema_step22.sql has finished/
-- committed as its own separate run (see the note at the top of that file
-- for why — referencing the brand-new 'super_admin' value here would
-- error with 55P04 if it were still pending in the same transaction as
-- the ALTER TYPE that added it).
--
-- is_internal_staff() now means "any staff tier" (admin OR super_admin) —
-- every existing staff-only RLS policy across schema.sql / schema_step5.sql
-- / schema_step6.sql / schema_step9.sql / schema_step10.sql /
-- schema_step11.sql / etc. continues to work completely unmodified, since
-- they all call this same function and neither its name nor its signature
-- changed. A new is_super_admin() helper gates Audit Log specifically.

create or replace function is_internal_staff() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

create or replace function is_super_admin() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'super_admin'
  );
$$;

-- Audit Log becomes Super Admin-only (previously any staff role could see
-- it, back when there was only one staff tier).
drop policy if exists "staff read audit log" on audit_log;
create policy "super admin read audit log" on audit_log
  for select using (is_super_admin());
