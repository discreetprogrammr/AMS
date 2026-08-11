-- Step 28: Support schema for a batch of UI/workflow improvements —
-- work order close timestamps, PM/CM reports linkable to a ticket, live
-- ticket status sync, and showing the real staff name to clients in chat.
--
-- Run this once in the Supabase SQL editor (after schema_step27.sql).

-- Work orders had no "when was this actually closed" timestamp — only
-- due_date (a target, not an actual). Stamped by updateWorkOrderStatus()
-- (app/work-orders/actions.ts) the first time a work order reaches
-- "closed", same pattern as service_tickets.resolved_at.
alter table work_orders add column closed_at timestamptz;

-- Lets a PM/CM report be filed "for" a specific ticket — previously a
-- report only linked to an asset, with no direct connection to the ticket
-- that prompted it (only an indirect asset_id -> tickets on that asset
-- relationship, which isn't precise once an asset has more than one
-- ticket). Nullable/optional: plenty of PM visits happen on a schedule,
-- not in response to a ticket.
alter table service_records add column ticket_id uuid references service_tickets(id) on delete set null;
create index service_records_ticket_id_idx on service_records(ticket_id);

-- Lets the Tickets table (staff AND client — same component,
-- tickets-table.tsx) live-update a row's status the instant staff change
-- it, the same way chat messages already update live. Without this, a
-- client only sees a status change after their next page load.
alter publication supabase_realtime add table service_tickets;

-- Lets a client see the real name of the staff member replying to them in
-- chat ("Tech Support — Jane Dela Cruz" instead of a generic "Support")
-- without opening up profiles generally — this only exposes STAFF
-- profiles (role admin/super_admin), never other clients' profiles, to
-- everyone. Combines via OR with the existing "read own profile or all if
-- staff" policy, so nothing already-working is narrowed.
create policy "anyone can read staff profiles" on profiles
  for select using (role in ('admin', 'super_admin'));
