-- Step 7 — SLA timing fields for service_tickets.
--
-- Adds two timestamps so the dashboard can compute real first-response and
-- resolution times instead of guessing at them from the audit log:
--   - first_response_at: set the first time staff moves a ticket from
--     "open" to "in_progress" (the acknowledgeTicket action).
--   - resolved_at: set when staff marks a ticket "resolved"
--     (the resolveTicket action).
--
-- No RLS changes needed — these are just new columns on a table that
-- already has RLS enabled; the existing policies cover them.

alter table service_tickets
  add column if not exists first_response_at timestamptz,
  add column if not exists resolved_at timestamptz;
