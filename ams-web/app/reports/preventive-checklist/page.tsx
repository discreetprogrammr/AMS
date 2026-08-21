import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { ticketRef } from "@/lib/format";
import { PreventiveChecklistForm } from "./preventive-form";

export default async function PreventiveChecklistPage({
  searchParams,
}: {
  searchParams: { error?: string; ticket_id?: string; asset_id?: string };
}) {
  await requireStaff("/reports");
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_tag, serial_number, sites(address), organizations(name)")
    .order("asset_tag");

  // Same "arrive from a ticket, or pick one from a dropdown" pattern as
  // /work-orders/new — lets a report be filed "for" a specific ticket
  // (schema_step28.sql's service_records.ticket_id) so the ticket detail
  // view can surface it automatically once generated.
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
      title="Preventive Maintenance Checklist"
      subtitle="Standard PM report — creates a service record on submit."
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
        <PreventiveChecklistForm
          assets={assets ?? []}
          // Ticket-derived takes priority when both are somehow present;
          // ?asset_id= is the new path in from the asset detail page's
          // "Start PM Checklist" quick action / QR scan flow, with no
          // ticket involved at all.
          prefilledAssetId={ticket?.asset_id ?? searchParams?.asset_id ?? null}
          prefilledTicketId={ticketId}
          linkableTickets={linkableTickets ?? []}
        />
      </div>
    </AppShell>
  );
}
