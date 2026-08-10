import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { SearchBar } from "@/components/search-bar";
import { AssetRowActions } from "./asset-row-actions";

const EQUIPMENT_LABEL: Record<string, string> = {
  xray_screening: "X-ray Screening",
  people_threat_screening: "People/Threat Screening",
  water_generation: "Water Generation",
  pump: "Pump",
  other: "Other",
};

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: { q?: string; deleted?: string };
}) {
  const supabase = await createClient();
  const profile = await getProfile();
  const isStaff = isStaffRole(profile?.role);

  // Powers the search bar on the dashboard (and this page's own search
  // box) — a plain ?q= query string, no client JS needed. Matches against
  // asset_tag/brand/model directly; PostgREST's .or() splits on commas, so
  // strip any from the input first rather than trying to escape them.
  const q = (searchParams?.q ?? "").trim().replace(/,/g, "");

  let query = supabase
    .from("assets")
    .select(
      "id, asset_tag, equipment_type, brand, model, status, sites(address), organizations(name)",
    )
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(
      `asset_tag.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%`,
    );
  }

  const { data: assets, error } = await query;

  return (
    <AppShell
      profile={profile}
      title="Managed Assets"
      subtitle="Asset registry across all sites."
      actions={
        <>
          <SearchBar
            action="/assets"
            placeholder="Search assets…"
            defaultValue={q}
          />
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
      {searchParams?.deleted === "1" && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Asset deleted.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Asset ID</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Equipment Type</th>
              <th className="px-4 py-3">Brand / Model</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Site</th>
              {isStaff && <th className="px-4 py-3 text-right">Actions</th>}
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
                  {asset.sites?.address ?? "—"}
                </td>
                {isStaff && (
                  <td className="px-4 py-3 text-right">
                    <AssetRowActions
                      assetId={asset.id}
                      assetTag={asset.asset_tag}
                    />
                  </td>
                )}
              </tr>
            ))}
            {assets?.length === 0 && (
              <tr>
                <td
                  colSpan={isStaff ? 7 : 6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  {q
                    ? `No assets match "${q}".`
                    : isStaff
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
