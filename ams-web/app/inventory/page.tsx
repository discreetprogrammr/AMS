import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";

export default async function InventoryPage() {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: cycles, error } = await supabase
    .from("inventory_cycles")
    .select(
      "id, label, status, started_at, completed_at, sites(address, organizations(name))",
    )
    .order("started_at", { ascending: false });

  return (
    <AppShell
      profile={profile}
      title="Inventory Cycles"
      subtitle="COA-style physical inventory counts, per site."
      actions={
        <Link
          href="/inventory/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
        >
          + Start Cycle
        </Link>
      }
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
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Completed</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {cycles?.map((cycle: any) => (
              <tr
                key={cycle.id}
                className="border-t border-hairline hover:bg-surface-2"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/inventory/${cycle.id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {cycle.label}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {cycle.sites?.organizations?.name
                    ? `${cycle.sites.organizations.name} — `
                    : ""}
                  {cycle.sites?.address ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={cycle.status} />
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {new Date(cycle.started_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {cycle.completed_at
                    ? new Date(cycle.completed_at).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
            {cycles?.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No inventory cycles yet. Click &ldquo;Start Cycle&rdquo; to
                  begin one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
