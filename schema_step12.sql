-- Step 12 — Calendar module.
--
-- Reference-design note: I checked the reference's own client-visibility
-- rules before designing RLS for this one, since Work Orders, Alerts, and
-- Inspections all turned out to be staff-only there. Calendar is different
-- — it's NOT in the reference's `clientHidden` nav list, so clients do see
-- it. That means calendar_events follows the shared staff-manage /
-- client-read pattern used by service_tickets and service_records (Step
-- 1), not the staff-only pattern from Steps 9-11.
--
-- Also: the reference stores a free-text `location` column on each event.
-- AMS already knows an event's location through asset_id -> sites ->
-- address, so that's derived via the existing relations instead of
-- duplicated as a field that could drift out of sync with the asset's
-- actual site.

create type calendar_event_type as enum ('calibration', 'maintenance', 'firmware', 'inspection', 'other');
create type calendar_event_status as enum ('scheduled', 'completed', 'overdue');

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  title text not null,
  event_type calendar_event_type not null default 'maintenance',
  event_date date not null,
  status calendar_event_status not null default 'scheduled',
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create trigger calendar_events_audit after insert or update or delete on calendar_events
  for each row execute function log_audit();

alter table calendar_events enable row level security;

create policy "read own org calendar events or all if staff" on calendar_events
  for select using (
    is_internal_staff()
    or asset_id in (select id from assets where organization_id = my_organization_id())
  );
create policy "staff manage calendar events" on calendar_events
  for all using (is_internal_staff());
