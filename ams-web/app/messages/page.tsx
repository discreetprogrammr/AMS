import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ticketRef } from "@/lib/format";

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
        .select("id, ticket_id, message_type, call_kind, body, created_at")
        .in("ticket_id", ticketIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestByTicket = new Map<string, any>();
  for (const m of messages ?? []) {
    if (!latestByTicket.has(m.ticket_id)) latestByTicket.set(m.ticket_id, m);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (tickets ?? []).map((t: any) => ({
    ...t,
    latest: latestByTicket.get(t.id) ?? null,
  }));

  rows.sort((a, b) => {
    const aTime = new Date(a.latest?.created_at ?? a.created_at).getTime();
    const bTime = new Date(b.latest?.created_at ?? b.created_at).getTime();
    return bTime - aTime;
  });

  return (
    <AppShell
      profile={profile}
      title="Messages"
      subtitle={
        isStaff
          ? "Chat and calls across every ticket."
          : "Chat and calls with support about your tickets."
      }
    >
      <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
        {rows.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            No tickets to message about yet.
          </p>
        )}
        {rows.map((t) => (
          <Link
            key={t.id}
            href={`/messages/${t.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-2"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{ticketRef(t.id)}</span>
                <StatusBadge status={t.status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-ink-soft">
                {t.assets?.sites?.address ?? "—"}
                {t.assets?.organizations?.name
                  ? ` — ${t.assets.organizations.name}`
                  : ""}
              </p>
              <p className="mt-1 truncate text-sm text-slate-500">
                {previewText(t.latest)}
              </p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">
              {new Date(t.latest?.created_at ?? t.created_at).toLocaleDateString()}
            </span>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function previewText(m: any): string {
  if (!m) return "No messages yet — say hello.";
  const kindLabel = m.call_kind === "video" ? "Video" : "Voice";
  switch (m.message_type) {
    case "text":
      return m.body ?? "";
    case "call_started":
      return `${kindLabel} call`;
    case "call_ended":
      return `${kindLabel} call ended`;
    case "call_missed":
      return `Missed ${kindLabel.toLowerCase()} call`;
    case "call_declined":
      return `Declined ${kindLabel.toLowerCase()} call`;
    default:
      return "";
  }
}
