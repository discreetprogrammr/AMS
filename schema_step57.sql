-- Step 57 (part 2 of 2): what a field engineer may see and do [idempotent].
--
-- Run schema_step56.sql first, as its own run (it adds the 'field_engineer'
-- value, which cannot be used until that run has committed).
--
-- The rule behind everything here: a field engineer is NOT is_internal_staff()
-- (admin or super_admin). Every existing "staff manage ..." policy therefore
-- keeps them out by default, and this file grants only what the CTO approved
-- on 23 Oct 2026 (docs/FIELD-ENGINEER-ACCESS.md in the HorizonCare360 Assist
-- repo, section 2):
--
--   - Tickets and chat: read all, reply, change status, raise a ticket for a
--     client, send photos. Every message must be sent AS the signed-in user.
--   - Units: read all, change only status and next_service_due.
--   - Work orders: only the ones assigned to them (new work_orders.assigned_to).
--   - Service records and inspections: create only on a unit (or site) in one
--     of their assigned work orders, read and edit only their own.
--   - Reference data, read only: sites, organisations, unit documents, parts
--     (without the unit cost), staff and client names.
--   - Everything else (audit log, error logs, SLA, compliance, calendar,
--     inventory, equipment register, user access): no access.
--
-- Also changed for EVERYONE, not only field engineers:
--   - messages inserts must now have sender_id = the signed-in user. Before,
--     anyone allowed to post could post with another person's name in
--     sender_id, which is shown as "Tech Support, <name>" to clients.
--   - The "anyone can read staff profiles" policy is limited to signed-in
--     users. It used to be readable with the public key and no login.
--
-- Why triggers for column limits: a column GRANT applies to every signed-in
-- user (the `authenticated` database role), admins included, so it cannot
-- limit one app role. A before-update trigger can: it refuses a field engineer
-- who changes any column outside a list, and does nothing for anyone else.
--
-- Run this once in the Supabase SQL editor (after schema_step56.sql). Safe to
-- run more than once. A field engineer can sign in only to the mobile app:
-- accounts are created by hand (Authentication > Users, then a profiles row
-- with role = 'field_engineer'), the same way client accounts are.

-- ── 1. Who is assigned to a work order ─────────────────────────────────────
-- Free text lead_technician stays as it is (it can still list the crew). This
-- is the real link to the person who owns the job in the app, the team lead.
-- Nullable: existing work orders stay unassigned, so no field engineer sees
-- them until the office assigns one.

alter table work_orders
  add column if not exists assigned_to uuid references profiles(id) on delete set null;

create index if not exists work_orders_assigned_to_idx on work_orders(assigned_to);

-- ── 2. Helpers ─────────────────────────────────────────────────────────────
-- security definer + stable, like is_internal_staff(): they must read
-- profiles and work_orders regardless of the caller's own row access.

create or replace function is_field_engineer() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'field_engineer'
  );
$$;

create or replace function fe_owns_work_order(target uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select is_field_engineer()
    and exists (select 1 from work_orders where id = target and assigned_to = auth.uid());
$$;

create or replace function fe_assigned_to_asset(target uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select is_field_engineer()
    and exists (select 1 from work_orders where asset_id = target and assigned_to = auth.uid());
$$;

create or replace function fe_assigned_to_site(target uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select is_field_engineer()
    and exists (
      select 1 from work_orders wo
      join assets a on a.id = wo.asset_id
      where a.site_id = target and wo.assigned_to = auth.uid()
    );
$$;

create or replace function fe_owns_service_record(target uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select is_field_engineer()
    and exists (select 1 from service_records where id = target and created_by = auth.uid());
$$;

create or replace function fe_owns_inspection(target uuid, must_be_draft boolean) returns boolean
language sql security definer stable set search_path = public as $$
  select is_field_engineer()
    and exists (
      select 1 from inspections
      where id = target and created_by = auth.uid()
        and (not must_be_draft or status = 'draft')
    );
$$;

-- ── 3. Column limits for a field engineer ──────────────────────────────────
-- Trigger arguments are the columns a field engineer MAY change. Any other
-- change raises 42501 (insufficient privilege). Does nothing for other roles.

create or replace function field_engineer_limit_update() returns trigger
language plpgsql set search_path = public as $$
declare
  allowed text[] := tg_argv;
begin
  if is_field_engineer()
     and (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'A field engineer may only change: %', array_to_string(allowed, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists assets_field_engineer_limit on assets;
create trigger assets_field_engineer_limit before update on assets
  for each row execute function field_engineer_limit_update('status', 'next_service_due', 'updated_at');

drop trigger if exists service_tickets_field_engineer_limit on service_tickets;
create trigger service_tickets_field_engineer_limit before update on service_tickets
  for each row execute function field_engineer_limit_update('status', 'first_response_at', 'resolved_at', 'updated_at');

drop trigger if exists work_orders_field_engineer_limit on work_orders;
create trigger work_orders_field_engineer_limit before update on work_orders
  for each row execute function field_engineer_limit_update('status', 'closed_at', 'updated_at');

-- ── 4. Tickets and chat: any ticket ────────────────────────────────────────

drop policy if exists "field engineers read tickets" on service_tickets;
create policy "field engineers read tickets" on service_tickets
  for select using (is_field_engineer());

drop policy if exists "field engineers raise tickets" on service_tickets;
create policy "field engineers raise tickets" on service_tickets
  for insert with check (is_field_engineer() and raised_by = auth.uid());

drop policy if exists "field engineers update tickets" on service_tickets;
create policy "field engineers update tickets" on service_tickets
  for update using (is_field_engineer()) with check (is_field_engineer());

-- messages: replaces the two policies from schema_step25.sql. Same rules as
-- before, plus the field engineer, plus sender_id = auth.uid() on insert for
-- everyone. Call notes (call_started and so on) are inserted by the signed-in
-- user too, so they are covered by the same check.

drop policy if exists "read own org ticket messages or all if staff" on messages;
create policy "read own org ticket messages or all if staff" on messages
  for select using (
    is_internal_staff()
    or is_field_engineer()
    or ticket_id in (
      select id from service_tickets
      where asset_id in (select id from assets where organization_id = my_organization_id())
    )
  );

drop policy if exists "send messages on own org tickets or all if staff" on messages;
create policy "send messages on own org tickets or all if staff" on messages
  for insert with check (
    sender_id = auth.uid()
    and (
      is_internal_staff()
      or is_field_engineer()
      or ticket_id in (
        select id from service_tickets
        where asset_id in (select id from assets where organization_id = my_organization_id())
      )
    )
  );

drop policy if exists "field engineers read call alerts" on call_alerts;
create policy "field engineers read call alerts" on call_alerts
  for select using (is_field_engineer());

-- Photos in chat (bucket chat-attachments): read and upload on any ticket.
drop policy if exists "field engineers read chat attachments" on storage.objects;
create policy "field engineers read chat attachments" on storage.objects
  for select using (bucket_id = 'chat-attachments' and is_field_engineer());

drop policy if exists "field engineers upload chat attachments" on storage.objects;
create policy "field engineers upload chat attachments" on storage.objects
  for insert with check (bucket_id = 'chat-attachments' and is_field_engineer());

-- ── 5. Names ───────────────────────────────────────────────────────────────
-- A client sees a staff member's name on a reply ("Tech Support, <name>") only
-- if the profile is readable (schema_step28.sql: admin and super_admin). Add
-- field engineers, so their replies show a name too. And a field engineer
-- reads profiles to show who wrote each message (clients and colleagues).

-- The old policy had no `to` clause, so it applied to the `anon` role as well:
-- a visitor with only the public key and no login could read every staff
-- profile row (name, role, avatar). It is now limited to signed-in users,
-- which is all the chat needs.
drop policy if exists "anyone can read staff profiles" on profiles;
create policy "anyone can read staff profiles" on profiles
  for select to authenticated using (role in ('admin', 'super_admin', 'field_engineer'));

drop policy if exists "field engineers read profiles" on profiles;
create policy "field engineers read profiles" on profiles
  for select using (is_field_engineer());

-- ── 6. Units, sites, organisations, documents, parts: read ─────────────────

drop policy if exists "field engineers read assets" on assets;
create policy "field engineers read assets" on assets
  for select using (is_field_engineer());

-- Only status and next_service_due may change (trigger in section 3).
drop policy if exists "field engineers update assets" on assets;
create policy "field engineers update assets" on assets
  for update using (is_field_engineer()) with check (is_field_engineer());

drop policy if exists "field engineers read sites" on sites;
create policy "field engineers read sites" on sites
  for select using (is_field_engineer());

drop policy if exists "field engineers read organizations" on organizations;
create policy "field engineers read organizations" on organizations
  for select using (is_field_engineer());

drop policy if exists "field engineers read asset documents" on asset_documents;
create policy "field engineers read asset documents" on asset_documents
  for select using (is_field_engineer());

drop policy if exists "field engineers read asset document files" on storage.objects;
create policy "field engineers read asset document files" on storage.objects
  for select using (bucket_id = 'asset-documents' and is_field_engineer());

-- parts has a unit_cost column, and a policy cannot hide a column. So a field
-- engineer has no access to the parts table itself, and reads this view,
-- which leaves the cost out. A view runs with its owner's rights, so the
-- is_field_engineer() filter inside it is what limits who sees any row.
create or replace view parts_for_field_engineers as
  select id, name, sku, category, unit, quantity_on_hand, reorder_level
  from parts
  where is_field_engineer();

revoke all on parts_for_field_engineers from anon, authenticated;
grant select on parts_for_field_engineers to authenticated;

-- ── 7. Work orders: only their own ─────────────────────────────────────────
-- Read and update. No create and no delete: the office creates and assigns
-- work orders. Only status and closed_at may change (trigger in section 3), so
-- a field engineer cannot reassign a job or edit its description.

drop policy if exists "field engineers read own work orders" on work_orders;
create policy "field engineers read own work orders" on work_orders
  for select using (is_field_engineer() and assigned_to = auth.uid());

drop policy if exists "field engineers update own work orders" on work_orders;
create policy "field engineers update own work orders" on work_orders
  for update using (is_field_engineer() and assigned_to = auth.uid())
  with check (is_field_engineer() and assigned_to = auth.uid());

-- Parts used on their own work orders. The stock count is kept in sync by the
-- security definer trigger decrement_part_stock() (schema_step31.sql), so a
-- field engineer does not need write access to parts for this to work.
drop policy if exists "field engineers read parts on own work orders" on work_order_parts;
create policy "field engineers read parts on own work orders" on work_order_parts
  for select using (fe_owns_work_order(work_order_id));

drop policy if exists "field engineers log parts on own work orders" on work_order_parts;
create policy "field engineers log parts on own work orders" on work_order_parts
  for insert with check (fe_owns_work_order(work_order_id) and logged_by = auth.uid());

drop policy if exists "field engineers fix parts on own work orders" on work_order_parts;
create policy "field engineers fix parts on own work orders" on work_order_parts
  for update using (fe_owns_work_order(work_order_id))
  with check (fe_owns_work_order(work_order_id));

-- ── 8. Service records: create on an assigned unit or site, own only ───────

drop policy if exists "field engineers create service records" on service_records;
create policy "field engineers create service records" on service_records
  for insert with check (
    is_field_engineer()
    and created_by = auth.uid()
    and (
      (asset_id is not null and fe_assigned_to_asset(asset_id))
      or (asset_id is null and site_id is not null and fe_assigned_to_site(site_id))
    )
  );

drop policy if exists "field engineers read own service records" on service_records;
create policy "field engineers read own service records" on service_records
  for select using (is_field_engineer() and created_by = auth.uid());

drop policy if exists "field engineers update own service records" on service_records;
create policy "field engineers update own service records" on service_records
  for update using (is_field_engineer() and created_by = auth.uid())
  with check (
    is_field_engineer()
    and created_by = auth.uid()
    and (
      (asset_id is not null and fe_assigned_to_asset(asset_id))
      or (asset_id is null and site_id is not null and fe_assigned_to_site(site_id))
    )
  );

drop policy if exists "field engineers read own service record parts" on service_record_parts;
create policy "field engineers read own service record parts" on service_record_parts
  for select using (fe_owns_service_record(service_record_id));

drop policy if exists "field engineers add own service record parts" on service_record_parts;
create policy "field engineers add own service record parts" on service_record_parts
  for insert with check (fe_owns_service_record(service_record_id));

drop policy if exists "field engineers edit own service record parts" on service_record_parts;
create policy "field engineers edit own service record parts" on service_record_parts
  for update using (fe_owns_service_record(service_record_id))
  with check (fe_owns_service_record(service_record_id));

drop policy if exists "field engineers read own checklist items" on service_record_checklist_items;
create policy "field engineers read own checklist items" on service_record_checklist_items
  for select using (fe_owns_service_record(service_record_id));

drop policy if exists "field engineers add own checklist items" on service_record_checklist_items;
create policy "field engineers add own checklist items" on service_record_checklist_items
  for insert with check (fe_owns_service_record(service_record_id));

drop policy if exists "field engineers edit own checklist items" on service_record_checklist_items;
create policy "field engineers edit own checklist items" on service_record_checklist_items
  for update using (fe_owns_service_record(service_record_id))
  with check (fe_owns_service_record(service_record_id));

-- ── 9. Inspections: assigned unit, own only, locked once submitted ─────────
-- The using clause is checked against the existing row, so a draft can be
-- edited and submitted, and a submitted inspection can no longer be changed.

drop policy if exists "field engineers create inspections" on inspections;
create policy "field engineers create inspections" on inspections
  for insert with check (
    is_field_engineer() and created_by = auth.uid() and fe_assigned_to_asset(asset_id)
  );

drop policy if exists "field engineers read own inspections" on inspections;
create policy "field engineers read own inspections" on inspections
  for select using (is_field_engineer() and created_by = auth.uid());

drop policy if exists "field engineers edit own draft inspections" on inspections;
create policy "field engineers edit own draft inspections" on inspections
  for update using (is_field_engineer() and created_by = auth.uid() and status = 'draft')
  with check (is_field_engineer() and created_by = auth.uid() and fe_assigned_to_asset(asset_id));

drop policy if exists "field engineers read own inspection items" on inspection_items;
create policy "field engineers read own inspection items" on inspection_items
  for select using (fe_owns_inspection(inspection_id, false));

drop policy if exists "field engineers add items to own draft inspections" on inspection_items;
create policy "field engineers add items to own draft inspections" on inspection_items
  for insert with check (fe_owns_inspection(inspection_id, true));

drop policy if exists "field engineers edit items of own draft inspections" on inspection_items;
create policy "field engineers edit items of own draft inspections" on inspection_items
  for update using (fe_owns_inspection(inspection_id, true))
  with check (fe_owns_inspection(inspection_id, true));
