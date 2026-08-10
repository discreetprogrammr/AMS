-- Step 21: Unify ticket_status and work_order_status onto the same
-- vocabulary — Open / In Progress / Parts Pending / Closed — instead of
-- tickets saying "Resolved" and work orders saying "Completed" for what is
-- functionally the same terminal state. Also adds a brand-new "Parts
-- Pending" status to both, for when a job is blocked waiting on a part.
--
-- - ticket_status: 'resolved' is renamed to 'closed'. 'parts_pending' is
--   added as a new value, ordered right after 'in_progress'.
-- - work_order_status: 'completed' is renamed to 'closed'. 'parts_pending'
--   is added the same way.
--
-- Renaming an enum value carries every existing row's value over
-- automatically as part of the ALTER — no UPDATE needed, no data loss.
--
-- Run this once in the Supabase SQL editor (after schema.sql and
-- schema_step9.sql).

alter type ticket_status rename value 'resolved' to 'closed';
alter type ticket_status add value if not exists 'parts_pending' after 'in_progress';

alter type work_order_status rename value 'completed' to 'closed';
alter type work_order_status add value if not exists 'parts_pending' after 'in_progress';
