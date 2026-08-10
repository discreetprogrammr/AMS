import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";

export default async function InspectionsPage() {
  await requireStaff();
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: inspections, error } = await supabase
    .from("inspections")
    .select(
      "id, technician_name, inspection_date, status, assets(asset_tag, organizations(name)), inspection_items(result)",
    )
    .order("inspection_date", { ascending: false });

  return (
    <AppShell
      profile={profile}
      title="Inspections"
      subtitle="Field inspection checklists across the fleet."
      actions={
        <Link
          href="/inspections/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
        >
          + New Inspection
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
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Technician</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {inspections?.map((insp: any) => {
              const items = insp.inspection_items ?? [];
              const total = items.length;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const passing = items.filter((i: any) => i.result === "pass").length;
              return (
                <tr
                  key={insp.id}
                  className="border-t border-hairline hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/inspections/${insp.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {insp.assets?.asset_tag ?? "—"}
                    </Link>
                    {insp.assets?.organizations?.name && (
                      <div className="text-xs text-slate-500">
                        {insp.assets.organizations.name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {insp.technician_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {new Date(insp.inspection_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {passing}/{total}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={insp.status} />
                  </td>
                </tr>
              );
            })}
            {inspections?.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No inspections recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
