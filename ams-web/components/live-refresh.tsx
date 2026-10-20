"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type LiveTable = "service_tickets" | "messages";

// Re-fetches the page's server data when something new is INSERTed, so a ticket
// raised (or a message or call sent) from the HorizonCare360 Assist mobile app
// shows up for staff without a manual reload.
//
// Why: the Tickets table only listened for UPDATEs (schema_step28.sql adds the
// table to the realtime publication, but nothing handled INSERT), and the
// Messages inbox listened for nothing, so both only changed on reload.
//
// It refreshes the server data instead of patching rows in place because both
// lists are built on the server with joins (site, organisation, latest message,
// unread flag) that a bare realtime payload doesn't carry. router.refresh()
// keeps client state such as filters and an open detail modal. Realtime applies
// RLS, so a client's page only hears about their own organisation's rows.
// Refreshes are debounced: a burst of inserts (a ticket plus its photos) is one
// refresh. Renders nothing.
export function LiveRefresh({ tables }: { tables: LiveTable[] }) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const key = tables.join(",");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    };

    let channel = supabase.channel(`live-refresh:${key}`);
    for (const table of key.split(",") as LiveTable[]) {
      channel = channel.on("postgres_changes", { event: "INSERT", schema: "public", table }, refresh);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      channel.unsubscribe();
    };
  }, [key, router, supabase]);

  return null;
}
