-- Step 25: Chat + voice/video calling, scoped to a service ticket — a
-- client and staff can message and call each other about a specific
-- ticket, the same way they already collaborate on it via status updates.
--
-- Design notes:
-- - One flat `messages` table per ticket rather than a separate
--   "conversations" table — every ticket already IS the unit of work
--   (status, priority, SLA timestamps all live on it), so there's nothing
--   a separate conversation record would add. A conversation is just
--   "the messages where ticket_id = this ticket."
-- - `message_type` covers both real chat text AND call *events*
--   (call_started/call_ended/call_missed/call_declined) so the call
--   history shows up inline in the same timeline as the text messages —
--   one feed, not two UIs to check.
-- - The actual live call media (audio/video) never touches this table or
--   even Supabase at all — it's a direct WebRTC peer connection between
--   the two browsers. What DOES go through Supabase Realtime (not this
--   table) is the call *signaling* (offer/answer/ICE candidates, ringing/
--   hangup) — that's ephemeral broadcast traffic, nothing to persist.
--   This table only stores the call *events* for history, appended once
--   a call starts/ends/gets missed.
-- - RLS mirrors the exact same "staff manage everything, client reads/
--   writes only their own org's tickets" pattern already used for
--   service_tickets itself (schema.sql) — a client can only message/call
--   about tickets raised on their own organization's assets.
--
-- Run this once in the Supabase SQL editor (after schema.sql).

create type message_type as enum ('text', 'call_started', 'call_ended', 'call_missed', 'call_declined');
create type call_kind as enum ('audio', 'video');

create table messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references service_tickets(id) on delete cascade,
  sender_id uuid references profiles(id),
  message_type message_type not null default 'text',
  call_kind call_kind,
  body text,
  created_at timestamptz not null default now()
);

create index messages_ticket_id_created_at_idx on messages(ticket_id, created_at);

alter table messages enable row level security;

create policy "read own org ticket messages or all if staff" on messages
  for select using (
    is_internal_staff()
    or ticket_id in (
      select id from service_tickets
      where asset_id in (select id from assets where organization_id = my_organization_id())
    )
  );

create policy "send messages on own org tickets or all if staff" on messages
  for insert with check (
    is_internal_staff()
    or ticket_id in (
      select id from service_tickets
      where asset_id in (select id from assets where organization_id = my_organization_id())
    )
  );

-- Required for the chat UI's live-updating message list — by default a
-- new table isn't included in Supabase's realtime publication, so
-- postgres_changes subscriptions on `messages` would silently receive
-- nothing without this.
alter publication supabase_realtime add table messages;
