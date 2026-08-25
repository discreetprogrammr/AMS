-- Step 43: Error Monitoring. Two existing failure points in the app are
-- currently invisible the moment they happen:
--   1. lib/pdf/generate-and-store.ts's catch block returns {ok:false,...}
--      with no durable record anywhere — visible only if the caller
--      happens to surface the message in a redirect, and gone forever
--      after that.
--   2. Every cron route's (pm-due, sla-check, compliance-check,
--      low-stock-check, weekly-digest) top-level catch block only
--      console.errors — visible only to someone who happens to check
--      Vercel's function logs.
-- This gives unhandled app errors (server actions, API routes, cron runs,
-- and now unrecoverable client-side render crashes too) a real home: a
-- dedicated error_logs table with full technical detail (source, message,
-- stack, context), PLUS a linked row in the existing `alerts` table
-- (schema_step10.sql) so every error also surfaces through the same
-- in-app bell + email/push staff notification every other alert type
-- already uses — no separate delivery mechanism to build or forget.

create table error_logs (
  id uuid primary key default gen_random_uuid(),
  -- Free-text label identifying where the error was caught, e.g.
  -- "cron:sla-check", "pdf:generate-and-store", "client:render" — not an
  -- enum, since new call sites will keep getting instrumented over time
  -- and a closed enum would mean a migration every time one's added.
  source text not null,
  message text not null,
  stack text,
  -- Whatever extra structured detail the call site has on hand at the
  -- moment of failure (a record id, a request URL, cron run params, etc.)
  -- — deliberately schemaless like radiation_readings/safety_checklist
  -- (schema_step41/42.sql) for the same reason: shape varies per source
  -- and none of it needs to be queried/filtered on individually.
  context jsonb,
  -- Linked back to the alerts-table row raised for this same error, so
  -- resolving/reading it in one place can be cross-referenced from the
  -- other. Nullable — logError() must never let an alerts-insert failure
  -- block the error_logs insert itself, or a broken alert write would
  -- swallow the very error trying to be logged.
  alert_id uuid references alerts(id) on delete set null,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table error_logs enable row level security;

-- Staff-only, same as `alerts` itself. No insert policy: every write goes
-- through the service-role client (lib/error-log.ts), which bypasses RLS
-- entirely — this is system-logged, not something any authenticated role
-- (staff or client) ever inserts directly.
create policy "staff can read error_logs" on error_logs
  for select using (is_internal_staff());

create policy "staff can update error_logs" on error_logs
  for update using (is_internal_staff());
