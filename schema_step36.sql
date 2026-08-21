-- Step 36: Push notification subscriptions — the last leg of "installable
-- PWA with push notifications." A push subscription is per-device/per-
-- browser (not per-email like Resend), so this is genuinely new state to
-- store: the endpoint URL + keys the browser hands back from
-- pushManager.subscribe(), one row per device someone has opted in on.
--
-- Owner-only RLS (a user manages their own subscriptions; nobody else has
-- any legitimate reason to read another user's push credentials — unlike
-- alerts/audit_log, there's no staff-oversight use case here). No audit
-- trigger — this is delivery-mechanism bookkeeping, not a business record,
-- same reasoning as pm_auto_runs (schema_step29.sql).
--
-- Run this once in the Supabase SQL editor (after schema_step35.sql).

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

create policy "manage own push subscriptions" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
