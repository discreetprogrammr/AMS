-- Step 13 — Reports module.
--
-- The reference's Reports page pulls from `pm_reports` / `cm_reports`
-- tables that don't correspond to anything in AMS. AMS already has
-- `service_records` (since schema.sql, Step 1) with exactly the shape a
-- maintenance report needs — service_type, date_performed, performed_by,
-- findings, result, next_due_date — it just never had a UI to create one
-- anywhere in the app. This migration doesn't rebuild that table; it adds
-- the one column service_records was missing (downtime_hours, needed for
-- corrective/repair reports) and a checklist_items child table — same
-- sibling pattern as the existing service_record_parts — to hold the
-- section-by-section pass/attention/fail detail the reference's PM
-- checklist captures.
--
-- Explicitly NOT replicated from the reference: PDF generation, signature
-- capture, CSAT ratings, and photo upload. Those need Supabase Storage
-- buckets and client-side PDF libraries that amount to a project of their
-- own — flagging this as a deliberate scope cut, not an oversight.

alter table service_records
  add column if not exists downtime_hours numeric;

create type checklist_item_status as enum ('ok', 'attention', 'fail');

create table service_record_checklist_items (
  id uuid primary key default gen_random_uuid(),
  service_record_id uuid not null references service_records(id) on delete cascade,
  section text not null,
  item_label text not null,
  status checklist_item_status not null default 'ok',
  remarks text,
  created_at timestamptz not null default now()
);

create trigger service_record_checklist_items_audit after insert or update or delete on service_record_checklist_items
  for each row execute function log_audit();

-- Same read/write shape as service_record_parts: staff manage everything,
-- clients can read checklist items for records tied to their own org's
-- assets (their service_records rows are already visible to them today).
alter table service_record_checklist_items enable row level security;

create policy "read own org checklist items or all if staff" on service_record_checklist_items
  for select using (
    is_internal_staff()
    or service_record_id in (
      select sr.id from service_records sr
      join assets a on a.id = sr.asset_id
      where a.organization_id = my_organization_id()
    )
  );
create policy "staff manage checklist items" on service_record_checklist_items
  for all using (is_internal_staff());
