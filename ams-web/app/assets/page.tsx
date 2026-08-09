import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { logout } from "../login/actions";

const STATUS_LABEL: Record<string, string> = {
  operational: "Operational",
  under_maintenance: "Under Maintenance",
  unserviceable: "Unserviceable",
};

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
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Assets</h1>
          <p className="text-sm text-slate-500">
            All equipment tracked across clients and sites.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Dashboard
          </Link>
          <a
            href="/api/assets/export"
            className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Export CSV
          </a>
          {isStaff && (
            <Link
              href="/inventory"
              className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            >
              Inventory
            </Link>
          )}
          {isStaff && (
            <a
              href="/api/assets/export/unserviceable"
              className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            >
              Unserviceable Report
            </a>
          )}
          {isStaff && (
            <Link
              href="/audit-log"
              className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            >
              Audit Log
            </Link>
          )}
          {isStaff && (
            <Link
              href="/assets/new"
              className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
            >
              + Add Asset
            </Link>
          )}
          <form action={logout}>
            <button className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
              Sign out
            </button>
          </form>
        </div>
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
                className="border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/assets/${asset.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {asset.asset_tag}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {asset.organizations?.name ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {EQUIPMENT_LABEL[asset.equipment_type] ??
                    asset.equipment_type}
                </td>
                <td className="px-4 py-3">
                  {[asset.brand, asset.model].filter(Boolean).join(" / ") ||
                    "—"}
                </td>
                <td className="px-4 py-3">
                  {STATUS_LABEL[asset.status] ?? asset.status}
                </td>
                <td className="px-4 py-3">{asset.next_service_due ?? "—"}</td>
              </tr>
            ))}
            {assets?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {isStaff
                    ? 'No assets yet. Click "Add Asset" to create the first one.'
                    : "No assets on file yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
