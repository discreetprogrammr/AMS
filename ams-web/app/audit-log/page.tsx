import { createClient } from "@/lib/supabase/server";
import { getProfile, requireSuperAdmin } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { changedFields } from "@/lib/audit";

const TABLE_LABEL: Record<string, string> = {
  assets: "Asset",
  service_records: "Service Record",
  service_tickets: "Service Ticket",
  inventory_cycles: "Inventory Cycle",
};

export default async function AuditLogPage() {
  await requireSuperAdmin();
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: entries, error } = await supabase
    .from("audit_log")
    .select(
      "id, table_name, record_id, action, changed_at, old_data, new_data, profiles(full_name)",
    )
    .order("changed_at", { ascending: false })
    .limit(100);

  return (
    <AppShell
      profile={profile}
      title="Audit Log"
      subtitle="Last 100 changes across the system — who changed what, and when."
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
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
              <tr key={e.id} className="border-t border-hairline">
                <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                  {new Date(e.changed_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {TABLE_LABEL[e.table_name] ?? e.table_name}
                </td>
                <td className="px-4 py-3 capitalize text-ink-soft">
                  {String(e.action).toLowerCase()}
                </td>
                <td className="px-4 py-3 text-ink-soft">
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
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No activity logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
