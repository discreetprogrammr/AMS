import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { SearchBar } from "@/components/search-bar";
import { AssetsTable, type AssetRow } from "./assets-table";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: { q?: string; deleted?: string; asset?: string };
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
      "id, asset_tag, serial_number, equipment_type, brand, model, status, sites(address), organizations(name)",
    )
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(
      `asset_tag.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%`,
    );
  }

  const { data: assets, error } = await query;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: AssetRow[] = (assets ?? []).map((a: any) => ({
    id: a.id,
    asset_tag: a.asset_tag,
    serial_number: a.serial_number,
    equipment_type: a.equipment_type,
    brand: a.brand,
    model: a.model,
    status: a.status,
    site_address: a.sites?.address ?? null,
    organization_name: a.organizations?.name ?? null,
  }));

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

      <AssetsTable
        assets={rows}
        isStaff={isStaff}
        selectedAssetId={searchParams?.asset ?? null}
        emptyMessage={
          q
            ? `No assets match "${q}".`
            : isStaff
              ? 'No assets yet. Click "Add Asset" to create the first one.'
              : "No assets on file yet."
        }
      />
    </AppShell>
  );
}
