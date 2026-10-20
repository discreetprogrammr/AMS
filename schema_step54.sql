-- Step 54: the read-only "viewer" role [idempotent]. FOR THE DEMO DATABASE ONLY.
--
-- A viewer is a person who needs to see what HorizonCare360 looks like (every
-- sidebar tab except User Access, Audit Log and Error Logs) without being able
-- to change anything. Viewers live in the separate demo Supabase project, which
-- holds sample data only. This file:
--   1. adds the role value 'viewer';
--   2. gives viewers SELECT, and nothing else, on the tables behind the tabs
--      they can open, never on internal (PHtek) organizations and never on the
--      audit log, error logs or the internal-equipment tables;
--   3. adds RESTRICTIVE policies that refuse every insert, update and delete by
--      a viewer on every table in `public` and on storage.objects, whatever
--      other policy would allow it. That is the real barrier: the app also
--      refuses writes and disables controls, but this holds even if someone
--      calls the API directly with a viewer's login.
--
-- SAFETY TRIPWIRE: viewers can read the parts stock and global alerts, which
-- are not organization-scoped. In a database with real data that would be a
-- leak, so this file refuses to run unless the database has been marked as a
-- demo database. In the DEMO project only, run this once first:
--
--     create table if not exists app_environment (key text primary key, value text not null);
--     alter table app_environment enable row level security;
--     insert into app_environment (key, value) values ('demo_database', 'true')
--       on conflict (key) do update set value = excluded.value;
--
-- Never mark the production database as a demo database.
--
-- Creating a viewer (demo project only): create the user in Supabase Auth
-- (Authentication, Users, Add user, Auto Confirm User), then
--     insert into profiles (id, full_name, role)
--     values ('<AUTH_USER_ID>', '<FULL NAME>', 'viewer')
--     on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
-- Leave organization_id empty. Safe to run this file more than once.

do $$
begin
  if to_regclass('public.app_environment') is null then
    raise exception 'Step 54 only runs in a database marked as the demo database, and this one is not marked. See the note at the top of this file. Nothing was changed.';
  end if;
  if not exists (select 1 from public.app_environment where key = 'demo_database' and value = 'true') then
    raise exception 'Step 54 only runs in a database marked as the demo database, and this one is not marked. See the note at the top of this file. Nothing was changed.';
  end if;
end
$$;

-- The marker table has no policy, so nobody can read or change it through the API
-- (the SQL editor and this file bypass RLS). Every other table in public already has RLS.
alter table public.app_environment enable row level security;

alter type user_role add value if not exists 'viewer';

-- ---------------------------------------------------------------------------
-- Helpers. Comparing role::text keeps the new enum value out of any plan that
-- would be built in the same transaction as the ALTER TYPE above (step 22 explains).
-- All security definer, so they read the tables without being filtered by RLS.
-- ---------------------------------------------------------------------------
create or replace function is_viewer() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role::text = 'viewer');
$$;

create or replace function viewer_can_read_org(p_org uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select is_viewer() and exists (select 1 from organizations o where o.id = p_org and not o.is_internal);
$$;

create or replace function viewer_can_read_site(p_site uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select is_viewer() and exists (
    select 1 from sites s join organizations o on o.id = s.organization_id
    where s.id = p_site and not o.is_internal);
$$;

create or replace function viewer_can_read_asset(p_asset uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select is_viewer() and exists (
    select 1 from assets a join organizations o on o.id = a.organization_id
    where a.id = p_asset and not o.is_internal);
$$;

create or replace function viewer_can_read_ticket(p_ticket uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from service_tickets t where t.id = p_ticket and viewer_can_read_asset(t.asset_id));
$$;

create or replace function viewer_can_read_service_record(p_record uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from service_records r
    where r.id = p_record
      and ((r.asset_id is not null and viewer_can_read_asset(r.asset_id))
        or (r.site_id is not null and viewer_can_read_site(r.site_id))));
$$;

create or replace function viewer_can_read_work_order(p_order uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from work_orders w where w.id = p_order and viewer_can_read_asset(w.asset_id));
$$;

create or replace function viewer_can_read_inspection(p_inspection uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from inspections i where i.id = p_inspection and viewer_can_read_asset(i.asset_id));
$$;

create or replace function viewer_can_read_cycle(p_cycle uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from inventory_cycles c where c.id = p_cycle and viewer_can_read_site(c.site_id));
$$;

-- ---------------------------------------------------------------------------
-- Read access (SELECT only), scoped to non-internal organizations.
-- ---------------------------------------------------------------------------
drop policy if exists "viewer read organizations" on organizations;
create policy "viewer read organizations" on organizations for select using (viewer_can_read_org(id));

drop policy if exists "viewer read sites" on sites;
create policy "viewer read sites" on sites for select using (viewer_can_read_site(id));

drop policy if exists "viewer read assets" on assets;
create policy "viewer read assets" on assets for select using (viewer_can_read_asset(id));

drop policy if exists "viewer read asset documents" on asset_documents;
create policy "viewer read asset documents" on asset_documents for select using (viewer_can_read_asset(asset_id));

drop policy if exists "viewer read tickets" on service_tickets;
create policy "viewer read tickets" on service_tickets for select using (viewer_can_read_asset(asset_id));

drop policy if exists "viewer read messages" on messages;
create policy "viewer read messages" on messages for select using (viewer_can_read_ticket(ticket_id));

drop policy if exists "viewer read service records" on service_records;
create policy "viewer read service records" on service_records for select using (viewer_can_read_service_record(id));

drop policy if exists "viewer read checklist items" on service_record_checklist_items;
create policy "viewer read checklist items" on service_record_checklist_items
  for select using (viewer_can_read_service_record(service_record_id));

drop policy if exists "viewer read service record parts" on service_record_parts;
create policy "viewer read service record parts" on service_record_parts
  for select using (viewer_can_read_service_record(service_record_id));

drop policy if exists "viewer read certificates" on compliance_certificates;
create policy "viewer read certificates" on compliance_certificates for select using (viewer_can_read_asset(asset_id));

drop policy if exists "viewer read calendar events" on calendar_events;
create policy "viewer read calendar events" on calendar_events for select using (viewer_can_read_asset(asset_id));

drop policy if exists "viewer read work orders" on work_orders;
create policy "viewer read work orders" on work_orders for select using (viewer_can_read_asset(asset_id));

drop policy if exists "viewer read work order parts" on work_order_parts;
create policy "viewer read work order parts" on work_order_parts
  for select using (viewer_can_read_work_order(work_order_id));

drop policy if exists "viewer read inspections" on inspections;
create policy "viewer read inspections" on inspections for select using (viewer_can_read_asset(asset_id));

drop policy if exists "viewer read inspection items" on inspection_items;
create policy "viewer read inspection items" on inspection_items
  for select using (viewer_can_read_inspection(inspection_id));

drop policy if exists "viewer read inventory cycles" on inventory_cycles;
create policy "viewer read inventory cycles" on inventory_cycles for select using (viewer_can_read_site(site_id));

drop policy if exists "viewer read inventory cycle items" on inventory_cycle_items;
create policy "viewer read inventory cycle items" on inventory_cycle_items
  for select using (viewer_can_read_cycle(inventory_cycle_id));

-- Alerts tied to an asset only; alerts with no asset (system alerts) are not shown.
drop policy if exists "viewer read alerts" on alerts;
create policy "viewer read alerts" on alerts for select using (asset_id is not null and viewer_can_read_asset(asset_id));

drop policy if exists "viewer read pm auto runs" on pm_auto_runs;
create policy "viewer read pm auto runs" on pm_auto_runs for select using (viewer_can_read_asset(asset_id));

drop policy if exists "viewer read sla escalations" on sla_escalations;
create policy "viewer read sla escalations" on sla_escalations for select using (viewer_can_read_ticket(ticket_id));

-- Not organization-scoped: the parts stock, its receipts and low-stock alerts. This is
-- why the tripwire at the top exists.
drop policy if exists "viewer read parts" on parts;
create policy "viewer read parts" on parts for select using (is_viewer());

drop policy if exists "viewer read part receipts" on part_receipts;
create policy "viewer read part receipts" on part_receipts for select using (is_viewer());

drop policy if exists "viewer read low stock alerts" on low_stock_alerts;
create policy "viewer read low stock alerts" on low_stock_alerts for select using (is_viewer());

drop policy if exists "viewer read sla policies" on sla_policies;
create policy "viewer read sla policies" on sla_policies
  for select using (is_viewer() and (organization_id is null or viewer_can_read_org(organization_id)));

-- Files: reports, chat attachments and asset documents the viewer can already see rows for.
drop policy if exists "viewer read service report pdfs" on storage.objects;
create policy "viewer read service report pdfs" on storage.objects
  for select using (
    bucket_id = 'service-reports'
    and is_viewer()
    and name in (select sr.report_url from service_records sr
                  where sr.report_url is not null and viewer_can_read_service_record(sr.id)));

drop policy if exists "viewer read chat attachments" on storage.objects;
create policy "viewer read chat attachments" on storage.objects
  for select using (
    bucket_id = 'chat-attachments'
    and is_viewer()
    and viewer_can_read_ticket((storage.foldername(name))[1]::uuid));

drop policy if exists "viewer read asset document files" on storage.objects;
create policy "viewer read asset document files" on storage.objects
  for select using (
    bucket_id = 'asset-documents'
    and is_viewer()
    and viewer_can_read_asset((storage.foldername(name))[1]::uuid));

-- Not granted to viewers, on purpose: audit_log, error_logs, compliance_escalations,
-- the equipment_* tables and asset_custodian_history (internal equipment).

-- ---------------------------------------------------------------------------
-- The hard stop: no write by a viewer, anywhere. RESTRICTIVE policies are
-- AND-ed with every permissive policy, so they win over any rule (including
-- "own row" ones such as a profile's name, read state, push subscriptions and
-- avatar uploads) that would otherwise let a viewer write.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop policy if exists "viewer cannot insert" on public.%I', t);
    execute format('drop policy if exists "viewer cannot update" on public.%I', t);
    execute format('drop policy if exists "viewer cannot delete" on public.%I', t);
    execute format('create policy "viewer cannot insert" on public.%I as restrictive for insert with check (not is_viewer())', t);
    execute format('create policy "viewer cannot update" on public.%I as restrictive for update using (not is_viewer()) with check (not is_viewer())', t);
    execute format('create policy "viewer cannot delete" on public.%I as restrictive for delete using (not is_viewer())', t);
  end loop;
end
$$;

drop policy if exists "viewer cannot insert" on storage.objects;
drop policy if exists "viewer cannot update" on storage.objects;
drop policy if exists "viewer cannot delete" on storage.objects;
create policy "viewer cannot insert" on storage.objects as restrictive for insert with check (not is_viewer());
create policy "viewer cannot update" on storage.objects as restrictive for update using (not is_viewer()) with check (not is_viewer());
create policy "viewer cannot delete" on storage.objects as restrictive for delete using (not is_viewer());
