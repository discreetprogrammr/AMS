import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { computeUnreadTicketIds } from "@/lib/messages/unread";
import { MessagesList } from "./messages-list";

// Client-visible, same as Tickets/Reports/Dashboard — RLS on both
// service_tickets and messages (schema_step25.sql) already scopes
// everything to the signed-in org for a client_viewer, so this page needs
// no extra filtering. One row per ticket, most-recently-active first.
export default async function MessagesPage() {
  const supabase = await createClient();
  const profile = await getProfile();
  const isStaff = isStaffRole(profile?.role);

  const { data: tickets } = await supabase
    .from("service_tickets")
    .select(
      "id, description, status, created_at, assets(sites(address), organizations(name))",
    )
    .order("created_at", { ascending: false });

  const ticketIds = (tickets ?? []).map((t) => t.id);

  const { data: messages } = ticketIds.length
    ? await supabase
        .from("messages")
        .select(
          "id, ticket_id, sender_id, message_type, call_kind, body, attachment_name, attachment_mime, created_at",
        )
        .in("ticket_id", ticketIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const { data: reads } = profile?.id
    ? await supabase
        .from("message_reads")
        .select("ticket_id, last_read_at")
        .eq("user_id", profile.id)
    : { data: [] };

  const unreadTicketIds = computeUnreadTicketIds(
    messages ?? [],
    reads ?? [],
    profile?.id ?? "",
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestByTicket = new Map<string, any>();
  for (const m of messages ?? []) {
    if (!latestByTicket.has(m.ticket_id)) latestByTicket.set(m.ticket_id, m);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (tickets ?? []).map((t: any) => ({
    ...t,
    latest: latestByTicket.get(t.id) ?? null,
    unread: unreadTicketIds.has(t.id),
  }));

  rows.sort((a, b) => {
    const aTime = new Date(a.latest?.created_at ?? a.created_at).getTime();
    const bTime = new Date(b.latest?.created_at ?? b.created_at).getTime();
    return bTime - aTime;
  });

  return (
    <AppShell
      profile={profile}
      title="HorizonCare360 Assist"
      subtitle={
        isStaff
          ? "Chat and calls across every ticket."
          : "Chat and calls with support about your tickets."
      }
    >
      <MessagesList rows={rows} />
    </AppShell>
  );
}
