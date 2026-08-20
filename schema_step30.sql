-- Step 30: Support schema for SLA breach escalation — a daily cron job
-- (app/api/cron/sla-check/route.ts) that proactively flags tickets
-- approaching or breaching their response/resolution SLA window (bumping
-- priority and raising an alert on an actual breach), instead of only
-- surfacing SLA performance after the fact on the dashboard.
--
-- Run this once in the Supabase SQL editor (after schema_step29.sql).

-- Idempotency + audit ledger for the SLA escalation job, same pattern as
-- pm_auto_runs (schema_step29.sql). One row per (ticket, event) the job has
-- already acted on — event_type covers all four checks the job makes: a
-- ticket can pass through "approaching" and later "breached" for either
-- its response SLA or its resolution SLA, and each of those four is
-- recorded independently so a ticket can legitimately accumulate more than
-- one row (e.g. response_approaching, then later response_breached) over
-- its lifetime without ever double-firing the same one twice.
create table sla_escalations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references service_tickets(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'response_approaching',
      'response_breached',
      'resolution_approaching',
      'resolution_breached'
    )
  ),
  alert_id uuid references alerts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (ticket_id, event_type)
);

-- Internal bookkeeping, not a user-facing business record — no audit
-- trigger, same reasoning as pm_auto_runs. Staff can read it (e.g. to see
-- why a ticket's priority jumped on its own); only the cron job's
-- service-role client ever writes to it.
alter table sla_escalations enable row level security;

create policy "staff can read sla escalations" on sla_escalations
  for select using (is_internal_staff());
