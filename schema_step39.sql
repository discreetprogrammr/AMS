-- Step 39: Low-stock parts alerts — the "Low Stock" / "Out of Stock" badge
-- on the Parts page (app/parts/parts-table.tsx's stockStatus()) is passive:
-- nobody finds out unless they happen to open that page. This adds a daily
-- cron sweep that proactively raises a staff alert (in-app + email/push via
-- lib/notify.ts) the first time a part crosses into Low Stock or Out of
-- Stock, same overall shape as PM automation / SLA escalation / compliance
-- alerts (schema_step29/30/34.sql).
--
-- The ledger here works differently from those three, though, and that's
-- deliberate, not an oversight: a certificate expiry, an SLA breach, or a
-- PM due-date are one-way lifecycle events — once they happen, they've
-- happened, so "insert once, unique constraint forever blocks a repeat" is
-- exactly right. Stock levels aren't one-way — a part can go low, get
-- restocked (Receive Stock, schema_step32.sql), and go low again next
-- month, potentially many times over. A permanent unique(part_id,
-- event_type) ledger would alert the first time a part ever goes low and
-- then silently stay quiet forever after, even across a full restock. So
-- instead of a permanent "already happened" record, this stores the
-- CURRENT alert level per part, and the row is deleted entirely once the
-- part is restocked back above its reorder level — "no row" means "fine
-- right now," which naturally re-arms the alert for the next time it drops
-- low again.
--
-- Run this once in the Supabase SQL editor (after schema_step38.sql).

create table low_stock_alerts (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references parts(id) on delete cascade,
  last_level text not null check (last_level in ('low', 'out_of_stock')),
  alert_id uuid references alerts(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (part_id)
);

-- Internal bookkeeping only, same reasoning as pm_auto_runs/
-- compliance_escalations — no audit trigger, staff-read only.
alter table low_stock_alerts enable row level security;

create policy "staff read low stock alerts" on low_stock_alerts
  for select using (is_internal_staff());
