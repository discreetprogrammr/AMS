import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { changedFields } from "@/lib/audit";

const TABLE_LABEL: Record<string, string> = {
  assets: "Asset",
  service_records: "Service Record",
  service_tickets: "Service Ticket",
  inventory_cycles: "Inventory Cycle",
};

export default async function AuditLogPage() {
  await requireStaff();

  const supabase = await createClient();

  const { data: entries, error } = await supabase
    .from("audit_log")
    .select(
      "id, table_name, record_id, action, changed_at, old_data, new_data, profiles(full_name)",
    )
    .order("changed_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Audit Log</h1>
          <p className="text-sm text-slate-500">
            Last 100 changes across the system — who changed what, and when.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
        >
          Dashboard
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Record</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Changed By</th>
              <th className="px-4 py-3">Fields Changed</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {entries?.map((e: any) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-4 py-3">
                  {new Date(e.changed_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {TABLE_LABEL[e.table_name] ?? e.table_name}
                </td>
                <td className="px-4 py-3 capitalize">
                  {String(e.action).toLowerCase()}
                </td>
                <td className="px-4 py-3">
                  {e.profiles?.full_name ?? "System"}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {e.action === "UPDATE"
                    ? changedFields(e.old_data, e.new_data).join(", ") || "—"
                    : "—"}
                </td>
              </tr>
            ))}
            {entries?.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No activity logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
