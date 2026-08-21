-- Step 33: Client Trends/Analytics view — uptime %, ticket volume, and MTTR
-- over time, for management to reference alongside the service contract.
--
-- Ticket volume and MTTR need nothing new: service_tickets is already
-- readable per-role exactly the way this feature needs it (staff see every
-- org, a client sees only their own — schema.sql's existing policy).
--
-- Uptime % is the one genuinely new metric, and it's reconstructed from
-- real history rather than invented: for each month in the trend window, we
-- ask "what fraction of assets were 'operational' as of the end of that
-- month?" by walking each asset's audit_log status-change trail (every
-- assets insert/update is already captured there via log_audit(),
-- schema.sql) and taking whatever status was current as of that date. No
-- new tracking table, no new trigger — just a new read path onto data that
-- already exists.
--
-- The blocker: audit_log today is Super Admin-only (schema_step22b.sql), so
-- neither a regular Admin nor a client_viewer's own session could run that
-- reconstruction. This policy is additive (multiple permissive SELECT
-- policies on the same table combine with OR), so it doesn't touch or
-- narrow the existing Super-Admin policy — it just also lets:
--   - any staff (admin or super_admin) read audit_log rows for the assets
--     table, fleet-wide (matches how every other staff-facing query in this
--     app already treats "staff see everything")
--   - a client read audit_log rows for the assets table, but only for
--     assets belonging to their own org
-- Every OTHER table's audit trail (tickets, inventory, parts, etc.) stays
-- exactly as restricted as it already was — this only opens up the one
-- slice (asset status history) the new feature actually needs.
--
-- Run this once in the Supabase SQL editor (after schema_step32.sql).

create policy "read own org asset status history" on audit_log
  for select using (
    table_name = 'assets'
    and (
      is_internal_staff()
      or record_id in (select id from assets where organization_id = my_organization_id())
    )
  );
