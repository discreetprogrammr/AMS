-- Pacific Horizon Tek — Asset Management Software
-- Step 6 migration: audit log surfacing + role-permission hardening.
-- Run this AFTER schema.sql and schema_step5.sql.

-- IMPORTANT FIX: audit_log has had NO Row Level Security since Step 1.
-- Every other table got `alter table ... enable row level security` —
-- audit_log was missed. In practice that meant any authenticated user,
-- including a client_viewer, could read the full change history across
-- every organization via the API (Supabase grants authenticated users
-- broad access by default until RLS is turned on). This closes that gap.
alter table audit_log enable row level security;

create policy "staff read audit log" on audit_log
  for select using (is_internal_staff());

-- Deliberately no insert/update/delete policy: the only writer is the
-- log_audit() trigger function, which runs as `security definer` and
-- bypasses RLS on its own — so the log stays append-only and untouchable
-- via the API, even for staff.

-- Lets the UI resolve "changed_by" to a person's name instead of a bare
-- UUID. Safe to add now — every changed_by value comes from auth.uid() at
-- the time of a logged change, and every user who has made a change has a
-- profiles row (required since Step 1 setup).
alter table audit_log
  add constraint audit_log_changed_by_fkey
  foreign key (changed_by) references profiles(id);
