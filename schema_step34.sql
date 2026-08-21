-- Step 34: Compliance certificate & warranty expiry alerts — proactive
-- notices before certificates or warranties lapse, instead of only ever
-- being visible if someone happens to look at the asset record. Both
-- `compliance_certificates.expiry_date` and `assets.warranty_end_date`
-- already exist (schema.sql) — this adds the automated check, not new
-- data fields.
--
-- Same architecture as PM automation (schema_step29.sql) and SLA breach
-- escalation (schema_step30.sql): a daily cron job walks the relevant
-- records, raises a staff-visible `alerts` row the first time something
-- crosses a threshold, and records that it already did so in a dedicated
-- idempotency ledger so it never fires twice for the same thing.
--
-- One ledger covers BOTH certificate and warranty expiries (they live on
-- two different tables), disambiguated by record_type rather than one
-- single strict foreign key — record_id is intentionally a bare uuid with
-- no FK constraint, the same polymorphic-reference pattern audit_log
-- already uses via table_name + record_id (schema.sql).
--
-- Run this once in the Supabase SQL editor (after schema_step33.sql).

create table compliance_escalations (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('certificate', 'warranty')),
  record_id uuid not null,
  event_type text not null check (event_type in ('approaching', 'expired')),
  alert_id uuid references alerts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (record_type, record_id, event_type)
);

-- Internal bookkeeping only, same reasoning as pm_auto_runs — no audit
-- trigger, staff-read only (nobody edits this by hand).
alter table compliance_escalations enable row level security;

create policy "staff read compliance escalations" on compliance_escalations
  for select using (is_internal_staff());
