-- Step 29: Support schema for automated PM (preventive maintenance) ticket
-- generation — a daily cron job (app/api/cron/pm-due/route.ts) that, for
-- every asset whose next_service_due is coming up within a configurable
-- lead window, auto-creates a service ticket, a calendar event, and a
-- heads-up alert, instead of relying on a human remembering to check.
--
-- Run this once in the Supabase SQL editor (after schema_step28.sql).

-- Lets an auto-generated (or manually created) calendar event point back to
-- the ticket that prompted it — closes a traceability gap: calendar_events
-- already links to work_orders (schema_step17.sql) but had no way to link
-- to the ticket itself. Nullable/optional: most calendar events still won't
-- have one (e.g. a PM visit scheduled without a ticket ever being raised).
alter table calendar_events add column ticket_id uuid references service_tickets(id) on delete set null;
create index calendar_events_ticket_id_idx on calendar_events(ticket_id);

-- Idempotency ledger for the PM cron job. Without this, a cron run that
-- fires twice for the same day (retry, manual re-trigger, clock skew) would
-- duplicate the ticket/event/alert for the same asset. One row per
-- (asset_id, due_date) pair the job has already acted on — the unique
-- constraint is what actually enforces "never twice," not just app logic.
-- Chosen over a single mutable column on assets (e.g.
-- last_pm_reminder_sent_at) because it keeps a real record of what the job
-- did and when, in the same normalized/auditable style as the rest of the
-- schema, and survives next_service_due being edited or cleared later.
create table pm_auto_runs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  due_date date not null,
  ticket_id uuid references service_tickets(id) on delete set null,
  calendar_event_id uuid references calendar_events(id) on delete set null,
  alert_id uuid references alerts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (asset_id, due_date)
);

-- Internal bookkeeping, not a user-facing business record like a ticket or
-- alert — no audit trigger. Staff can still read it (e.g. to debug "why
-- didn't a reminder fire") but nothing writes to it through the normal
-- authenticated client; only the cron job's service-role client does,
-- which bypasses RLS entirely.
alter table pm_auto_runs enable row level security;

create policy "staff can read pm auto runs" on pm_auto_runs
  for select using (is_internal_staff());
