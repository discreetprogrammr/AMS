-- Step 10 — Alerts module.
--
-- Reference-design note: the horizoncare-360 reference app's /alerts route
-- is a real-time monitoring feed (also staff-only — useClientRedirect()
-- again), but its own alerts are hand-seeded rows like "Uptime below SLA
-- threshold" or "Contract renewal upcoming" — it doesn't actually have a
-- live telemetry/IoT source feeding it either. AMS doesn't have that kind
-- of automated monitoring pipeline yet, so this starts as a staff-logged
-- alert feed (e.g. something spotted during a site visit or reported by
-- phone) with severity + read/resolved tracking. The schema is intentionally
-- shaped so a future automated source — e.g. a scheduled job checking
-- next_service_due or warranty_end_date on assets — could insert into this
-- same table later with zero UI changes.

create type alert_severity as enum ('critical', 'caution', 'info');

create table alerts (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id) on delete cascade,
  title text not null,
  description text,
  severity alert_severity not null default 'caution',
  is_read boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create trigger alerts_audit after insert or update or delete on alerts
  for each row execute function log_audit();

-- Staff-only, same reasoning as work_orders in Step 9.
alter table alerts enable row level security;

create policy "staff manage alerts" on alerts
  for all using (is_internal_staff());
