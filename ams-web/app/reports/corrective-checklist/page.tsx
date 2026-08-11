import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { ticketRef } from "@/lib/format";
import { CorrectiveChecklistForm } from "./corrective-form";

export default async function CorrectiveChecklistPage({
  searchParams,
}: {
  searchParams: { error?: string; ticket_id?: string };
}) {
  await requireStaff("/reports");
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_tag, serial_number, sites(address), organizations(name)")
    .order("asset_tag");

  // Same "arrive from a ticket, or pick one from a dropdown" pattern as
  // /work-orders/new and the preventive checklist — lets a report be filed
  // "for" a specific ticket (schema_step28.sql's service_records.ticket_id)
  // so the ticket detail view can surface it automatically once generated.
  const ticketId = searchParams?.ticket_id ?? null;
  const { data: ticketData } = ticketId
    ? await supabase
        .from("service_tickets")
        .select("id, asset_id, description, assets(serial_number, sites(address))")
        .eq("id", ticketId)
        .single()
    : { data: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ticket = ticketData as any;

  const { data: linkableTickets } = ticketId
    ? { data: null }
    : await supabase
        .from("service_tickets")
        .select("id, description, created_at, assets(serial_number, sites(address))")
        .neq("status", "closed")
        .order("created_at", { ascending: false });

  return (
    <AppShell
      profile={profile}
      title="Corrective Maintenance Report"
      subtitle="Fault response / repair record — creates a service record on submit."
    >
      <div>
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        {ticket && (
          <p className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-300">
            Logging this report for ticket {ticketRef(ticket.id)}
            {ticket.assets?.sites?.address ? ` at ${ticket.assets.sites.address}` : ""}
            {ticket.assets?.serial_number ? ` · SN ${ticket.assets.serial_number}` : ""}.
          </p>
        )}
        <CorrectiveChecklistForm
          assets={assets ?? []}
          prefilledAssetId={ticket?.asset_id ?? null}
          prefilledTicketId={ticketId}
          linkableTickets={linkableTickets ?? []}
        />
      </div>
    </AppShell>
  );
}
