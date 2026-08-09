import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { WorkOrdersTable, type WorkOrderRow } from "./work-orders-table";

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: { created?: string };
}) {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: workOrders, error } = await supabase
    .from("work_orders")
    .select(
      "id, task_title, description, work_type, priority, status, lead_technician, due_date, created_at, assets(asset_tag, organizations(name))",
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
    asset_tag: w.assets?.asset_tag ?? null,
    organization_name: w.assets?.organizations?.name ?? null,
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
      {searchParams?.created === "1" && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Work order created.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message}
        </p>
      )}
      <WorkOrdersTable workOrders={rows} />
    </AppShell>
  );
}
