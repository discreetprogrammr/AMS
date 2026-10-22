-- Step 55: call_alerts, the signal behind the in-app incoming-call banner [idempotent].
--
-- A call is heard by the ticket page that is open, and engineers are rarely on
-- one ticket. The HorizonCare360 Assist mobile app does not write a `messages`
-- row while a call rings (it logs "call started" only once the call connects),
-- so nothing in the database says "a client is calling right now". This table
-- is that signal. /api/call-notify (called by the app when a call starts, and
-- again if nobody answers) inserts one row per event, and a banner on every
-- staff page (components/incoming-call-banner.tsx) listens for it.
--
-- - Append only. "started" shows the banner, "missed" clears it. Answering,
--   declining and ending already write call rows to `messages`, which clear it
--   too, so nothing here is ever updated or deleted by the app.
-- - Staff read it, nobody else. A client cannot see other clients' calls.
-- - A client may insert a row only as themselves and only for a ticket on their
--   own organisation's assets, the same rule as sending a message
--   (schema_step25.sql). The route inserts with the caller's own token, so no
--   service-role key is involved.
-- - Rows are tiny and only matter for about a minute. They are not trimmed
--   automatically. If the table ever grows, delete rows older than a day.
-- - caller_name and label are text the client controls (their own name) or the
--   server composes (site and unit). They are capped here, and the banner shows
--   them as plain text.
--
-- Run this once in the Supabase SQL editor (after schema_step53.sql, or after
-- schema_step54.sql where that has been applied). Safe to run more than once.

create table if not exists call_alerts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references service_tickets(id) on delete cascade,
  call_id text not null check (char_length(call_id) between 1 and 100),
  kind call_kind not null,
  event text not null check (event in ('started', 'missed')),
  caller_id uuid references profiles(id) on delete set null,
  caller_name text check (char_length(caller_name) <= 80),
  label text check (char_length(label) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists call_alerts_created_at_idx on call_alerts(created_at desc);

alter table call_alerts enable row level security;

drop policy if exists "staff read call alerts" on call_alerts;
create policy "staff read call alerts" on call_alerts
  for select using (is_internal_staff());

drop policy if exists "raise call alerts on own org tickets or all if staff" on call_alerts;
create policy "raise call alerts on own org tickets or all if staff" on call_alerts
  for insert with check (
    caller_id = auth.uid()
    and (
      is_internal_staff()
      or ticket_id in (
        select id from service_tickets
        where asset_id in (select id from assets where organization_id = my_organization_id())
      )
    )
  );

-- Needed for the banner to hear new rows live. A new table is not in Supabase's
-- realtime publication by default, so without this the banner would receive
-- nothing. Guarded so it can be run again.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_alerts'
  ) then
    alter publication supabase_realtime add table call_alerts;
  end if;
end
$$;
