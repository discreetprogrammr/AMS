import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { WorkOrdersTable, type WorkOrderRow } from "./work-orders-table";

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: { created?: string; error?: string };
}) {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  // service_tickets(id) here is a reverse embed — service_tickets.work_order_id
  // is the FK, pointing at this table, not the other way around (see
  // schema_step16.sql). Supabase/PostgREST can still join across it from
  // this side; it just comes back as an array (usually 0 or 1 ticket) per
  // work order rather than a single object.
  const { data: workOrders, error: fetchError } = await supabase
    .from("work_orders")
    .select(
      "id, task_title, description, work_type, priority, status, lead_technician, due_date, created_at, assets(asset_tag, sites(address), organizations(name)), service_tickets(id)",
    )
    .order("created_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: WorkOrderRow[] = (workOrders ?? []).map((w: any) => ({
    id: w.id,
    task_title: w.task_title,
    description: w.description,
    work_type: w.work_type,
    priority: w.priority,
    status: w.status,
    lead_technician: w.lead_technician,
    due_date: w.due_date,
    created_at: w.created_at,
    site_name: w.assets?.sites?.address ?? null,
    organization_name: w.assets?.organizations?.name ?? null,
    from_ticket_id: w.service_tickets?.[0]?.id ?? null,
  }));

  return (
    <AppShell
      profile={profile}
      title="Work Orders"
      subtitle="Maintenance queue across all sites."
      actions={
        <Link
          href="/work-orders/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
        >
          + Create Work Order
        </Link>
      }
    >
      {searchParams?.created === "1" && !searchParams?.error && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Work order created.
        </p>
      )}
      {searchParams?.error && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          {searchParams.error}
        </p>
      )}
      {fetchError && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {fetchError.message}
        </p>
      )}
      <WorkOrdersTable workOrders={rows} />
    </AppShell>
  );
}
