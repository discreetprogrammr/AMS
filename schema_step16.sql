-- Step 16 — link service_tickets to the work_orders they spawn.
--
-- Work Orders and Service Tickets are deliberately separate (staff-only
-- internal task vs. client-facing complaint with an SLA clock — see the
-- note in schema_step9.sql), but until now nothing recorded that a given
-- ticket was the reason a work order got created. This adds an optional
-- back-reference: a ticket can point at the work order it spawned.
--
-- on delete set null (not cascade): deleting a work order should never
-- delete the ticket that prompted it — the ticket just goes back to
-- looking unlinked.
--
-- No RLS changes needed — same reasoning as Step 7 (first_response_at /
-- resolved_at): this is a new column on a table that already has RLS
-- enabled, and the existing "staff manage tickets" policy already covers
-- UPDATE on every column, not just the ones that existed when it was
-- written.

alter table service_tickets
  add column if not exists work_order_id uuid references work_orders(id) on delete set null;
