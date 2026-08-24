import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ticketRef, dateTimeLabel } from "@/lib/format";
import { computeUnreadTicketIds } from "@/lib/messages/unread";

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
                {t.unread && (
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
                    New
                  </span>
                )}
              </div>
              {/* Ticket description — without this, "TKT-XXXXXXXX" tells a
                  client nothing about which of their (possibly several)
                  open tickets a thread is actually about, so they'd have to
                  guess or cross-check against the Tickets page before
                  messaging/calling in. Shown right under the ref/status so
                  it's the first thing that identifies the ticket. */}
              <p className="mt-0.5 truncate text-sm text-ink-soft">
                {t.description || "No description provided."}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {t.assets?.sites?.address ?? "—"}
                {t.assets?.organizations?.name
                  ? ` — ${t.assets.organizations.name}`
                  : ""}
              </p>
              <p className={`mt-1 truncate text-sm ${t.unread ? "font-semibold text-ink" : "text-slate-500"}`}>
                {previewText(t.latest)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Started {dateTimeLabel(t.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {t.unread && <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-label="Unread" />}
              <span className="whitespace-nowrap text-xs text-slate-500">
                Updated {dateTimeLabel(t.latest?.created_at ?? t.created_at)}
              </span>
            </div>
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
      if (m.body) return m.body;
      if (m.attachment_name) {
        const isImage = (m.attachment_mime as string | null)?.startsWith("image/");
        return `📎 ${isImage ? "Photo" : m.attachment_name}`;
      }
      return "";
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
