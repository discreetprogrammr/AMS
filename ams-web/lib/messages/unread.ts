// Pure data-only helper (no supabase import) so the exact same unread
// logic can run both server-side (Messages inbox page, using the server
// Supabase client) and client-side (the sidebar's notification bell,
// using the browser client) without violating the client/server-component
// import boundary that bit this app before (see README — the
// next/headers bug).
//
// A ticket counts as "unread" for a user when the newest message from
// someone ELSE in that ticket is newer than that user's last_read_at for
// the ticket (schema_step26.sql's message_reads table) — or when no
// last_read_at row exists at all yet.

export type UnreadMessageInput = {
  ticket_id: string;
  sender_id: string | null;
  created_at: string;
};

export type ReadStateInput = {
  ticket_id: string;
  last_read_at: string;
};

export function computeUnreadTicketIds(
  messages: UnreadMessageInput[],
  reads: ReadStateInput[],
  currentUserId: string,
): Set<string> {
  const lastReadByTicket = new Map<string, number>();
  for (const r of reads) {
    lastReadByTicket.set(r.ticket_id, new Date(r.last_read_at).getTime());
  }

  const latestInboundByTicket = new Map<string, number>();
  for (const m of messages) {
    if (!m.sender_id || m.sender_id === currentUserId) continue;
    const t = new Date(m.created_at).getTime();
    const prev = latestInboundByTicket.get(m.ticket_id) ?? 0;
    if (t > prev) latestInboundByTicket.set(m.ticket_id, t);
  }

  const unread = new Set<string>();
  for (const [ticketId, latest] of latestInboundByTicket) {
    const lastRead = lastReadByTicket.get(ticketId);
    if (lastRead === undefined || latest > lastRead) unread.add(ticketId);
  }
  return unread;
}
