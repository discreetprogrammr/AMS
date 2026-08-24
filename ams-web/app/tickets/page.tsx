import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { TicketsTable, type TicketRow } from "./tickets-table";

// Client-visible (unlike most of app/**) — a client_viewer needs to see
// their own fleet's tickets, same as Dashboard/Assets/Reports. RLS ("read
// own org tickets or all if staff" in schema.sql) already scopes the query
// below to just their org's tickets with zero extra filtering needed here.
// "+ Request New Service" is open to clients too (/tickets/new, RLS-scoped
// to their own assets) — only creating a work order from a ticket stays
// staff-only, gated behind `isStaff` in the table.
export default async function TicketsPage({
  searchParams,
}: {
  // `ticket` — deep-links straight to a ticket's detail modal (e.g. from the
  // Fleet Map site popup's "latest service ticket" link) instead of just
  // landing on the unfiltered queue and making the user find it themselves.
  searchParams: { created?: string; ticket?: string };
}) {
  const profile = await getProfile();
  const isStaff = isStaffRole(profile?.role);

  const supabase = await createClient();

  const { data: tickets, error } = await supabase
    .from("service_tickets")
    .select(
      "id, description, status, priority, created_at, resolved_at, work_order_id, assets(id, serial_number, sites(address), organizations(name))",
    )
    .order("created_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: TicketRow[] = (tickets ?? []).map((t: any) => ({
    id: t.id,
    description: t.description,
    status: t.status,
    priority: t.priority,
    created_at: t.created_at,
    resolved_at: t.resolved_at,
    work_order_id: t.work_order_id,
    asset_id: t.assets?.id ?? null,
    serial_number: t.assets?.serial_number ?? null,
    site_address: t.assets?.sites?.address ?? null,
    organization_name: t.assets?.organizations?.name ?? null,
  }));

  return (
    <AppShell
      profile={profile}
      title="Ticket Queue"
      subtitle={
        isStaff
          ? "All service tickets raised across clients and sites."
          : "Service tickets raised on your fleet."
      }
      actions={
        <Link
          href="/tickets/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
        >
          + Request New Service
        </Link>
      }
    >
      {searchParams?.created === "1" && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Service request submitted.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message}
        </p>
      )}

      <TicketsTable tickets={rows} isStaff={isStaff} initialTicketId={searchParams?.ticket ?? null} />
    </AppShell>
  );
}
