"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computeUnreadTicketIds } from "@/lib/messages/unread";

// Small red-dot indicator next to the "HorizonCare360 Assist" nav item —
// unrelated to components/notification-bell.tsx (that one is the Alerts
// bell in the dashboard topbar; this one is scoped to chat/call unread
// state, schema_step26.sql's message_reads table).
//
// Recomputed from the database on every mount rather than kept in some
// app-wide store — this component remounts on every page navigation (it
// lives inside Sidebar, which is instantiated fresh per page via
// AppShell), so persisting state across navigations isn't needed;
// re-deriving from the DB is simpler and always correct even after a hard
// refresh.
export function MessagesUnreadDot({ userId }: { userId: string }) {
  const [hasUnread, setHasUnread] = useState(false);
  const pathname = usePathname();
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    let cancelled = false;

    async function loadUnread() {
      // Latest ~100 inbound messages across every ticket this user can
      // see (RLS-scoped) is a reasonable proxy for "anything worth
      // flagging" without pulling full history.
      const [{ data: incoming }, { data: reads }] = await Promise.all([
        supabase
          .from("messages")
          .select("ticket_id, sender_id, created_at")
          .neq("sender_id", userId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("message_reads").select("ticket_id, last_read_at").eq("user_id", userId),
      ]);
      if (cancelled) return;
      const unread = computeUnreadTicketIds(incoming ?? [], reads ?? [], userId);
      setHasUnread(unread.size > 0);
    }

    loadUnread();

    // Live updates while sitting on any page — a fresh inbound message
    // anywhere immediately lights the dot, without waiting for the next
    // navigation/remount. Skip it if the message belongs to the ticket
    // thread currently open — ticket-chat.tsx marks that ticket read
    // itself as messages arrive, so it was never really "unread".
    const channel = supabase
      .channel(`unread-watch:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const senderId = payload.new.sender_id as string | null;
          const ticketId = payload.new.ticket_id as string;
          if (!senderId || senderId === userId) return;
          if (pathname === `/messages/${ticketId}`) return;
          setHasUnread(true);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!hasUnread) return null;

  return (
    <span
      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-red-500"
      aria-label="New messages"
    />
  );
}
