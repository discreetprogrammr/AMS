import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { ticketRef } from "@/lib/format";
import { TicketChat } from "./ticket-chat";

export default async function TicketMessagesPage({
  params,
}: {
  params: { ticketId: string };
}) {
  const supabase = await createClient();
  const profile = await getProfile();

  // RLS ("read own org tickets or all if staff", schema.sql) is what
  // actually enforces access here — a client_viewer hitting someone
  // else's ticket id just gets no row back, same as every other detail
  // page in this app.
  const { data: ticket } = await supabase
    .from("service_tickets")
    .select(
      "id, description, status, priority, assets(serial_number, sites(address), organizations(name))",
    )
    .eq("id", params.ticketId)
    .single();

  if (!ticket) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select(
      "id, ticket_id, sender_id, message_type, call_kind, body, attachment_path, attachment_name, attachment_mime, attachment_size, created_at, profiles(full_name)",
    )
    .eq("ticket_id", params.ticketId)
    .order("created_at", { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asset = (ticket as any).assets;

  return (
    <AppShell
      profile={profile}
      title={ticketRef(ticket.id)}
      subtitle={[asset?.sites?.address, asset?.organizations?.name]
        .filter(Boolean)
        .join(" — ")}
      actions={
        <Link
          href="/messages"
          className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
        >
          ← Back
        </Link>
      }
    >
      <TicketChat
        ticketId={ticket.id}
        currentUserId={profile?.id ?? ""}
        currentUserName={profile?.full_name ?? "Me"}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialMessages={(messages ?? []) as any}
      />
    </AppShell>
  );
}
