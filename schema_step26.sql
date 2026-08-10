-- Step 26: Per-user "last read" tracking for the Messages/chat feature —
-- powers the notification bell (sidebar) and the "New" indicator on the
-- Messages inbox list.
--
-- Design notes:
-- - One row per (user, ticket) rather than per-message read receipts —
--   all we need is "have I seen everything up to time X in this ticket's
--   thread", not per-message read state.
-- - Client upserts its own row (last_read_at = now()) when it opens a
--   ticket's chat thread, and again each time a new inbound message
--   arrives while the thread is open. A ticket counts as unread whenever
--   the latest message from someone else is newer than this row (or no
--   row exists yet at all).
-- - RLS: a user can only read/write their OWN read-state rows — this
--   table carries no ticket-access logic itself, that's still fully
--   enforced by messages'/service_tickets' own RLS (a user can only ever
--   mark a ticket as read if they could already see its messages).
--
-- Run this once in the Supabase SQL editor (after schema_step25.sql).

create table message_reads (
  user_id uuid not null references profiles(id) on delete cascade,
  ticket_id uuid not null references service_tickets(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, ticket_id)
);

alter table message_reads enable row level security;

create policy "read own read-state" on message_reads
  for select using (user_id = auth.uid());

create policy "insert own read-state" on message_reads
  for insert with check (user_id = auth.uid());

create policy "update own read-state" on message_reads
  for update using (user_id = auth.uid());
