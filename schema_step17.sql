-- Step 17 — Auto-add every Work Order to the Service Calendar.
--
-- Work orders already have a due_date; this just mirrors each one onto the
-- calendar as its own event type, linked back via work_order_id so status
-- changes on the work order (e.g. marked "completed") can keep the calendar
-- entry in sync instead of drifting out of date.
--
-- Uses the same "add value to existing enum" pattern as schema_step15.sql
-- (asset_status) rather than recreating calendar_event_type from scratch.

alter type calendar_event_type add value if not exists 'work_order' after 'inspection';

alter table calendar_events
  add column if not exists work_order_id uuid references work_orders(id) on delete cascade;
