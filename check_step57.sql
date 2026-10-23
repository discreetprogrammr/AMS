-- Check for schema_step56.sql and schema_step57.sql: field engineer access.
--
-- Run it in the Supabase SQL editor of the TEST project, after steps 56 and 57.
-- It creates its own fictional users, organisations, units and tickets, signs
-- in as each of them in turn, and checks that what must work works and what
-- must be refused is refused. Nothing is kept: the script ends by raising an
-- error on purpose, which rolls everything back. THE RED ERROR AT THE END IS
-- EXPECTED. It carries the report: read the lines starting PASS or FAIL.
--
-- Do not run it against production or demo. It is safe there too (everything
-- rolls back), but there is no reason to, and it inserts into auth.users.
--
-- How a "sign in" works: for each check the script sets the claims Supabase
-- reads for auth.uid(), switches to the `authenticated` database role (so row
-- level security applies), runs one statement, then switches back.
--   ok:N     the statement ran and affected or returned N rows
--   error:X  the statement was refused with SQLSTATE X (42501 is "not allowed").
--            A check that expects a refusal passes only on 42501, so a typo in the
--            script cannot pass by accident.
-- A refused UPDATE or DELETE under row level security often reports ok:0
-- instead of an error, because the rows are simply invisible to that user.

create temp table fx (k text primary key, id uuid);
insert into fx
  select k, gen_random_uuid()
  from unnest(array['fe1','fe2','adm','cli','org1','org2','site1','site2','a1','a2',
                    'wo1','wo2','tk','part1','sr','sr2','insp','item1','item2']) as k;

create temp table results (n serial, pass boolean, name text, got text, want text);

create or replace function pg_temp.try(uid uuid, stmt text) returns text
language plpgsql as $$
declare
  n bigint;
begin
  if uid is null then
    -- Not signed in: only the public key.
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
  begin
    execute stmt;
    get diagnostics n = row_count;
    reset role;
    return 'ok:' || n;
  exception when others then
    reset role;
    return 'error:' || sqlstate;
  end;
end;
$$;

create or replace function pg_temp.check(test_name text, got text, want text) returns void
language plpgsql as $$
begin
  insert into results (pass, name, got, want)
  values (got = want or (want = 'error' and got = 'error:42501'), test_name, got, want);
end;
$$;

-- ── Fixtures (as the database owner, so row level security does not apply) ──

insert into auth.users (id, email)
  select id, k || '.check@example.com' from fx where k in ('fe1', 'fe2', 'adm', 'cli');

insert into organizations (id, name)
  select id, 'Check org ' || k from fx where k in ('org1', 'org2');

insert into profiles (id, full_name, role, organization_id)
values
  ((select id from fx where k = 'fe1'), 'Check Engineer One', 'field_engineer', null),
  ((select id from fx where k = 'fe2'), 'Check Engineer Two', 'field_engineer', null),
  ((select id from fx where k = 'adm'), 'Check Admin', 'admin', null),
  ((select id from fx where k = 'cli'), 'Check Client', 'client_viewer', (select id from fx where k = 'org1'))
on conflict (id) do update
  set full_name = excluded.full_name, role = excluded.role, organization_id = excluded.organization_id;

insert into sites (id, organization_id, address)
values
  ((select id from fx where k = 'site1'), (select id from fx where k = 'org1'), 'Check site one'),
  ((select id from fx where k = 'site2'), (select id from fx where k = 'org2'), 'Check site two');

insert into assets (id, organization_id, site_id, asset_tag, equipment_type, serial_number)
values
  ((select id from fx where k = 'a1'), (select id from fx where k = 'org1'), (select id from fx where k = 'site1'), 'CHK-1', 'other', 'SN1'),
  ((select id from fx where k = 'a2'), (select id from fx where k = 'org2'), (select id from fx where k = 'site2'), 'CHK-2', 'other', 'SN2');

insert into service_tickets (id, asset_id, raised_by, description)
values ((select id from fx where k = 'tk'), (select id from fx where k = 'a1'), (select id from fx where k = 'cli'), 'Check ticket');

insert into work_orders (id, asset_id, task_title, assigned_to)
values
  ((select id from fx where k = 'wo1'), (select id from fx where k = 'a1'), 'Check job one', (select id from fx where k = 'fe1')),
  ((select id from fx where k = 'wo2'), (select id from fx where k = 'a2'), 'Check job two', (select id from fx where k = 'fe2'));

insert into parts (id, name, quantity_on_hand, unit_cost)
values ((select id from fx where k = 'part1'), 'Check part', 10, 99.50);

insert into call_alerts (ticket_id, call_id, kind, event)
values ((select id from fx where k = 'tk'), 'check-call', 'video', 'started');

insert into storage.objects (bucket_id, name)
values ('asset-documents', (select id::text from fx where k = 'a1') || '/manual.pdf');

-- ── Checks ──────────────────────────────────────────────────────────────────

do $$
declare
  fe1 uuid := (select id from fx where k = 'fe1');
  fe2 uuid := (select id from fx where k = 'fe2');
  adm uuid := (select id from fx where k = 'adm');
  cli uuid := (select id from fx where k = 'cli');
  org1 uuid := (select id from fx where k = 'org1');
  org2 uuid := (select id from fx where k = 'org2');
  site1 uuid := (select id from fx where k = 'site1');
  site2 uuid := (select id from fx where k = 'site2');
  a1 uuid := (select id from fx where k = 'a1');
  a2 uuid := (select id from fx where k = 'a2');
  wo1 uuid := (select id from fx where k = 'wo1');
  wo2 uuid := (select id from fx where k = 'wo2');
  tk uuid := (select id from fx where k = 'tk');
  part1 uuid := (select id from fx where k = 'part1');
  sr uuid := (select id from fx where k = 'sr');
  sr2 uuid := (select id from fx where k = 'sr2');
  insp uuid := (select id from fx where k = 'insp');
  item1 uuid := (select id from fx where k = 'item1');
  item2 uuid := (select id from fx where k = 'item2');
  stock int;
  kept int;
begin
  -- Work orders: only their own
  perform pg_temp.check('fe1 sees only their own work order',
    pg_temp.try(fe1, format('select 1 from work_orders where id in (%L, %L)', wo1, wo2)), 'ok:1');
  perform pg_temp.check('fe2 sees only their own work order',
    pg_temp.try(fe2, format('select 1 from work_orders where id in (%L, %L)', wo1, wo2)), 'ok:1');
  perform pg_temp.check('admin still sees both work orders',
    pg_temp.try(adm, format('select 1 from work_orders where id in (%L, %L)', wo1, wo2)), 'ok:2');
  perform pg_temp.check('fe1 can change status of own work order',
    pg_temp.try(fe1, format('update work_orders set status = %L where id = %L', 'in_progress', wo1)), 'ok:1');
  perform pg_temp.check('fe1 cannot change another engineer''s work order',
    pg_temp.try(fe1, format('update work_orders set status = %L where id = %L', 'in_progress', wo2)), 'ok:0');
  perform pg_temp.check('fe1 cannot edit the title of own work order',
    pg_temp.try(fe1, format('update work_orders set task_title = %L where id = %L', 'changed', wo1)), 'error');
  perform pg_temp.check('fe1 cannot reassign own work order',
    pg_temp.try(fe1, format('update work_orders set assigned_to = %L where id = %L', fe2, wo1)), 'error');
  perform pg_temp.check('fe1 cannot create a work order',
    pg_temp.try(fe1, format('insert into work_orders (asset_id, task_title, assigned_to) values (%L, %L, %L)', a1, 'x', fe1)), 'error');
  perform pg_temp.check('admin can still edit a work order title',
    pg_temp.try(adm, format('update work_orders set task_title = %L where id = %L', 'admin edit', wo2)), 'ok:1');

  -- Tickets: any ticket, status only, can raise one as themselves
  perform pg_temp.check('fe1 reads any ticket',
    pg_temp.try(fe1, format('select 1 from service_tickets where id = %L', tk)), 'ok:1');
  perform pg_temp.check('fe1 raises a ticket as themselves on any unit',
    pg_temp.try(fe1, format('insert into service_tickets (asset_id, raised_by, description) values (%L, %L, %L)', a2, fe1, 'Raised in the field')), 'ok:1');
  perform pg_temp.check('fe1 cannot raise a ticket in someone else''s name',
    pg_temp.try(fe1, format('insert into service_tickets (asset_id, raised_by, description) values (%L, %L, %L)', a2, cli, 'Spoof')), 'error');
  perform pg_temp.check('fe1 can change ticket status',
    pg_temp.try(fe1, format('update service_tickets set status = %L where id = %L', 'in_progress', tk)), 'ok:1');
  perform pg_temp.check('fe1 cannot edit a ticket description',
    pg_temp.try(fe1, format('update service_tickets set description = %L where id = %L', 'changed', tk)), 'error');
  perform pg_temp.check('client still raises a ticket on own unit',
    pg_temp.try(cli, format('insert into service_tickets (asset_id, raised_by, description) values (%L, %L, %L)', a1, cli, 'Client ticket')), 'ok:1');
  perform pg_temp.check('client cannot raise a ticket on another organisation''s unit',
    pg_temp.try(cli, format('insert into service_tickets (asset_id, raised_by, description) values (%L, %L, %L)', a2, cli, 'Other org')), 'error');

  -- Messages: who sent it must be the signed-in user, for every role
  perform pg_temp.check('fe1 replies as themselves',
    pg_temp.try(fe1, format('insert into messages (ticket_id, sender_id, body) values (%L, %L, %L)', tk, fe1, 'On my way')), 'ok:1');
  perform pg_temp.check('fe1 cannot post as the client',
    pg_temp.try(fe1, format('insert into messages (ticket_id, sender_id, body) values (%L, %L, %L)', tk, cli, 'Spoof')), 'error');
  perform pg_temp.check('client posts as themselves on own ticket',
    pg_temp.try(cli, format('insert into messages (ticket_id, sender_id, body) values (%L, %L, %L)', tk, cli, 'Hello')), 'ok:1');
  perform pg_temp.check('client cannot post as an admin',
    pg_temp.try(cli, format('insert into messages (ticket_id, sender_id, body) values (%L, %L, %L)', tk, adm, 'Spoof')), 'error');
  perform pg_temp.check('admin posts as themselves',
    pg_temp.try(adm, format('insert into messages (ticket_id, sender_id, body) values (%L, %L, %L)', tk, adm, 'Admin reply')), 'ok:1');
  perform pg_temp.check('admin cannot post as the client',
    pg_temp.try(adm, format('insert into messages (ticket_id, sender_id, body) values (%L, %L, %L)', tk, cli, 'Spoof')), 'error');
  perform pg_temp.check('a call note is covered by the same rule',
    pg_temp.try(fe1, format('insert into messages (ticket_id, sender_id, message_type, call_kind) values (%L, %L, %L, %L)', tk, fe1, 'call_started', 'video')), 'ok:1');
  perform pg_temp.check('fe1 reads the whole conversation',
    pg_temp.try(fe1, format('select 1 from messages where ticket_id = %L', tk)), 'ok:4');
  perform pg_temp.check('client sees the field engineers'' names',
    pg_temp.try(cli, format('select 1 from profiles where id in (%L, %L)', fe1, fe2)), 'ok:2');
  perform pg_temp.check('fe1 reads a call alert',
    pg_temp.try(fe1, format('select 1 from call_alerts where ticket_id = %L', tk)), 'ok:1');
  perform pg_temp.check('fe1 stores their own read marker',
    pg_temp.try(fe1, format('insert into message_reads (user_id, ticket_id) values (%L, %L)', fe1, tk)), 'ok:1');

  -- Units: read all, change only status and next service due
  perform pg_temp.check('fe1 reads every unit',
    pg_temp.try(fe1, format('select 1 from assets where id in (%L, %L)', a1, a2)), 'ok:2');
  perform pg_temp.check('fe1 can change a unit''s status',
    pg_temp.try(fe1, format('update assets set status = %L where id = %L', 'attention', a1)), 'ok:1');
  perform pg_temp.check('fe1 can change next service due',
    pg_temp.try(fe1, format('update assets set next_service_due = current_date + 30 where id = %L', a1)), 'ok:1');
  perform pg_temp.check('fe1 cannot change a serial number',
    pg_temp.try(fe1, format('update assets set serial_number = %L where id = %L', 'CHANGED', a1)), 'error');
  perform pg_temp.check('fe1 cannot move a unit to another organisation',
    pg_temp.try(fe1, format('update assets set organization_id = %L where id = %L', org2, a1)), 'error');
  perform pg_temp.check('fe1 cannot delete a unit',
    pg_temp.try(fe1, format('delete from assets where id = %L', a2)), 'ok:0');
  perform pg_temp.check('admin can still change a serial number',
    pg_temp.try(adm, format('update assets set serial_number = %L where id = %L', 'ADMIN-EDIT', a1)), 'ok:1');

  -- Reference data and things a field engineer must not reach
  perform pg_temp.check('fe1 reads sites',
    pg_temp.try(fe1, format('select 1 from sites where id in (%L, %L)', site1, site2)), 'ok:2');
  perform pg_temp.check('fe1 reads organisations',
    pg_temp.try(fe1, format('select 1 from organizations where id in (%L, %L)', org1, org2)), 'ok:2');
  perform pg_temp.check('fe1 reads a unit document file',
    pg_temp.try(fe1, 'select 1 from storage.objects where bucket_id = ''asset-documents'''), 'ok:1');
  perform pg_temp.check('client of another organisation cannot read it',
    pg_temp.try(cli, format('select 1 from storage.objects where bucket_id = %L and name like %L', 'asset-documents', a2 || '/%')), 'ok:0');
  perform pg_temp.check('fe1 cannot read the audit log',
    pg_temp.try(fe1, 'select 1 from audit_log'), 'ok:0');
  perform pg_temp.check('fe1 cannot read the parts table directly',
    pg_temp.try(fe1, 'select 1 from parts'), 'ok:0');
  perform pg_temp.check('fe1 reads parts through the view',
    pg_temp.try(fe1, format('select 1 from parts_for_field_engineers where id = %L', part1)), 'ok:1');
  perform pg_temp.check('the view has no unit cost',
    pg_temp.try(fe1, 'select unit_cost from parts_for_field_engineers'), 'error:42703');
  perform pg_temp.check('a client sees nothing in the parts view',
    pg_temp.try(cli, 'select 1 from parts_for_field_engineers'), 'ok:0');
  perform pg_temp.check('an admin sees nothing in the parts view (they use the table)',
    pg_temp.try(adm, 'select 1 from parts_for_field_engineers'), 'ok:0');
  perform pg_temp.check('fe1 uploads a chat photo',
    pg_temp.try(fe1, format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'chat-attachments', tk || '/photo.jpg')), 'ok:1');

  -- Parts used on their own work order
  perform pg_temp.check('fe1 logs parts on own work order',
    pg_temp.try(fe1, format('insert into work_order_parts (work_order_id, part_id, part_name_snapshot, quantity_used, logged_by) values (%L, %L, %L, 2, %L)', wo1, part1, 'Check part', fe1)), 'ok:1');
  select quantity_on_hand into stock from parts where id = part1;
  perform pg_temp.check('stock went down by the quantity used', 'ok:' || stock, 'ok:8');
  perform pg_temp.check('fe1 cannot log parts on another engineer''s work order',
    pg_temp.try(fe1, format('insert into work_order_parts (work_order_id, part_id, part_name_snapshot, quantity_used, logged_by) values (%L, %L, %L, 1, %L)', wo2, part1, 'Check part', fe1)), 'error');
  perform pg_temp.check('fe2 cannot see parts logged on fe1''s work order',
    pg_temp.try(fe2, 'select 1 from work_order_parts'), 'ok:0');

  -- Service records: only on an assigned unit or site, only their own
  perform pg_temp.check('fe1 creates a service record on an assigned unit',
    pg_temp.try(fe1, format('insert into service_records (id, asset_id, service_type, date_performed, created_by) values (%L, %L, %L, current_date, %L)', sr, a1, 'repair', fe1)), 'ok:1');
  perform pg_temp.check('fe1 cannot create one on a unit that is not assigned',
    pg_temp.try(fe1, format('insert into service_records (asset_id, service_type, date_performed, created_by) values (%L, %L, current_date, %L)', a2, 'repair', fe1)), 'error');
  perform pg_temp.check('fe1 cannot create one in someone else''s name',
    pg_temp.try(fe1, format('insert into service_records (asset_id, service_type, date_performed, created_by) values (%L, %L, current_date, %L)', a1, 'repair', fe2)), 'error');
  perform pg_temp.check('fe1 creates a site record at an assigned site',
    pg_temp.try(fe1, format('insert into service_records (id, site_id, service_type, date_performed, created_by) values (%L, %L, %L, current_date, %L)', sr2, site1, 'training', fe1)), 'ok:1');
  perform pg_temp.check('fe2 cannot create a site record at fe1''s site',
    pg_temp.try(fe2, format('insert into service_records (site_id, service_type, date_performed, created_by) values (%L, %L, current_date, %L)', site1, 'training', fe2)), 'error');
  perform pg_temp.check('fe1 reads their own records',
    pg_temp.try(fe1, 'select 1 from service_records'), 'ok:2');
  perform pg_temp.check('fe2 cannot read fe1''s records',
    pg_temp.try(fe2, 'select 1 from service_records'), 'ok:0');
  perform pg_temp.check('fe1 edits their own record',
    pg_temp.try(fe1, format('update service_records set findings = %L where id = %L', 'Replaced belt', sr)), 'ok:1');
  perform pg_temp.check('fe2 cannot edit fe1''s record',
    pg_temp.try(fe2, format('update service_records set findings = %L where id = %L', 'Tampered', sr)), 'ok:0');
  perform pg_temp.check('fe1 cannot move their record to an unassigned unit',
    pg_temp.try(fe1, format('update service_records set asset_id = %L where id = %L', a2, sr)), 'error');
  perform pg_temp.check('fe1 cannot delete a record',
    pg_temp.try(fe1, format('delete from service_records where id = %L', sr)), 'ok:0');
  select count(*) into kept from service_records where id = sr;
  perform pg_temp.check('the record is still there after the delete attempt', 'ok:' || kept, 'ok:1');
  perform pg_temp.check('fe1 adds a part to their own record',
    pg_temp.try(fe1, format('insert into service_record_parts (service_record_id, part_name) values (%L, %L)', sr, 'Belt')), 'ok:1');
  perform pg_temp.check('fe2 cannot add a part to fe1''s record',
    pg_temp.try(fe2, format('insert into service_record_parts (service_record_id, part_name) values (%L, %L)', sr, 'Belt')), 'error');

  -- Inspections: assigned unit, own only, locked once submitted
  perform pg_temp.check('fe1 starts an inspection on an assigned unit',
    pg_temp.try(fe1, format('insert into inspections (id, asset_id, created_by) values (%L, %L, %L)', insp, a1, fe1)), 'ok:1');
  perform pg_temp.check('fe1 cannot start one on an unassigned unit',
    pg_temp.try(fe1, format('insert into inspections (asset_id, created_by) values (%L, %L)', a2, fe1)), 'error');
  perform pg_temp.check('fe1 adds an item to the draft',
    pg_temp.try(fe1, format('insert into inspection_items (id, inspection_id, category, item_name) values (%L, %L, %L, %L)', item1, insp, 'Safety', 'Door interlock')), 'ok:1');
  perform pg_temp.check('fe2 cannot add an item to fe1''s inspection',
    pg_temp.try(fe2, format('insert into inspection_items (inspection_id, category, item_name) values (%L, %L, %L)', insp, 'Safety', 'x')), 'error');
  perform pg_temp.check('fe1 submits the inspection',
    pg_temp.try(fe1, format('update inspections set status = %L where id = %L', 'submitted', insp)), 'ok:1');
  perform pg_temp.check('fe1 cannot change it after submitting',
    pg_temp.try(fe1, format('update inspections set technician_name = %L where id = %L', 'late edit', insp)), 'ok:0');
  perform pg_temp.check('fe1 cannot add an item after submitting',
    pg_temp.try(fe1, format('insert into inspection_items (id, inspection_id, category, item_name) values (%L, %L, %L, %L)', item2, insp, 'Safety', 'Late item')), 'error');
  perform pg_temp.check('fe1 can still read the submitted inspection',
    pg_temp.try(fe1, 'select 1 from inspections'), 'ok:1');
  perform pg_temp.check('fe2 cannot read fe1''s inspection',
    pg_temp.try(fe2, 'select 1 from inspections'), 'ok:0');

  -- Profiles
  perform pg_temp.check('someone who is not signed in cannot read staff profiles',
    pg_temp.try(null, 'select 1 from profiles'), 'ok:0');
  perform pg_temp.check('fe1 can change their own display name',
    pg_temp.try(fe1, format('update profiles set full_name = %L where id = %L', 'Check Engineer One B', fe1)), 'ok:1');
  perform pg_temp.check('fe1 cannot promote themselves',
    pg_temp.try(fe1, format('update profiles set role = %L where id = %L', 'super_admin', fe1)), 'error');
  perform pg_temp.check('a client cannot promote themselves',
    pg_temp.try(cli, format('update profiles set role = %L where id = %L', 'field_engineer', cli)), 'error');
end;
$$;

-- ── Report ──────────────────────────────────────────────────────────────────
-- Raises on purpose so that the whole script, fixtures included, rolls back.

do $$
declare
  report text;
  failed int;
  total int;
begin
  select count(*) filter (where not pass), count(*) into failed, total from results;
  select string_agg(
           (case when pass then 'PASS  ' else 'FAIL  ' end) || name ||
           case when pass then '' else '   (got ' || got || ', wanted ' || want || ')' end,
           E'\n' order by n)
    into report from results;
  raise exception E'\nFIELD ENGINEER CHECK: % of % passed\n%\n\nEverything above was rolled back. This error is expected.',
    total - failed, total, report;
end;
$$;
