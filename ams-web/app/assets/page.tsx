import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";

const EQUIPMENT_LABEL: Record<string, string> = {
  xray_screening: "X-ray Screening",
  people_threat_screening: "People/Threat Screening",
  water_generation: "Water Generation",
  pump: "Pump",
  other: "Other",
};

export default async function AssetsPage() {
  const supabase = await createClient();
  const profile = await getProfile();
  const isStaff = profile?.role === "internal_staff";

  const { data: assets, error } = await supabase
    .from("assets")
    .select(
      "id, asset_tag, equipment_type, brand, model, status, next_service_due, sites(address), organizations(name)",
    )
    .order("created_at", { ascending: false });

  return (
    <AppShell
      profile={profile}
      title="Assets"
      subtitle="All equipment tracked across clients and sites."
      actions={
        <>
          <a
            href="/api/assets/export"
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            Export CSV
          </a>
          {isStaff && (
            <a
              href="/api/assets/export/unserviceable"
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Unserviceable Report
            </a>
          )}
          {isStaff && (
            <Link
              href="/assets/new"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              + Add Asset
            </Link>
          )}
        </>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Asset Tag</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Equipment Type</th>
              <th className="px-4 py-3">Brand / Model</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Next Service Due</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {assets?.map((asset: any) => (
              <tr
                key={asset.id}
                className="border-t border-hairline hover:bg-surface-2"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/assets/${asset.id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {asset.asset_tag}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {asset.organizations?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {EQUIPMENT_LABEL[asset.equipment_type] ??
                    asset.equipment_type}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {[asset.brand, asset.model].filter(Boolean).join(" / ") ||
                    "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={asset.status} />
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {asset.next_service_due ?? "—"}
                </td>
              </tr>
            ))}
            {assets?.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  {isStaff
                    ? 'No assets yet. Click "Add Asset" to create the first one.'
                    : "No assets on file yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
