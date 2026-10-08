import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { SearchBar } from "@/components/search-bar";
import { isOneOf, SEGMENTS } from "@/lib/internal-equipment";
import { AssetsTable, type AssetRow } from "./assets-table";
import { AssetsFilters } from "./assets-filters";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: { q?: string; deleted?: string; org?: string; segment?: string };
}) {
  const supabase = await createClient();
  const profile = await getProfile();
  const isStaff = isStaffRole(profile?.role);

  // Powers the search bar on the dashboard (and this page's own search
  // box) — a plain ?q= query string, no client JS needed. Matches against
  // asset_tag/brand/model directly; PostgREST's .or() splits on commas, so
  // strip any from the input first rather than trying to escape them.
  const q = (searchParams?.q ?? "").trim().replace(/,/g, "");

  // Filters live in the URL (?org=<uuid>&segment=<value>), staff only: a
  // client_viewer is already scoped to one organization by RLS. Segment
  // only means something for the internal organization (schema_step46).
  const { data: orgList } = isStaff
    ? await supabase
        .from("organizations")
        .select("id, name, is_internal")
        .order("name")
    : { data: [] };
  const organizations = orgList ?? [];
  const selectedOrg = organizations.find((o) => o.id === searchParams?.org);
  const internalView = !!selectedOrg?.is_internal;
  const segment =
    internalView && isOneOf(SEGMENTS, searchParams?.segment ?? null)
      ? (searchParams.segment as string)
      : "";
  const hasInternalOrg = organizations.some((o) => o.is_internal);

  let query = supabase
    .from("assets")
    .select(
      "id, asset_tag, serial_number, equipment_type, brand, model, status, segment, asset_category, description, custodian, department, assignment_status, condition, warranty_end_date, sites(address), organizations(name)",
    )
    .order("created_at", { ascending: false });

  if (selectedOrg) query = query.eq("organization_id", selectedOrg.id);
  if (segment) query = query.eq("segment", segment);

  if (q) {
    query = query.or(
      `asset_tag.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%,serial_number.ilike.%${q}%,description.ilike.%${q}%,custodian.ilike.%${q}%`,
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
    segment: a.segment,
    asset_category: a.asset_category,
    description: a.description,
    custodian: a.custodian,
    department: a.department,
    assignment_status: a.assignment_status,
    condition: a.condition,
    warranty_end_date: a.warranty_end_date,
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
            preserve={{ org: selectedOrg?.id, segment }}
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
              href="/assets/import"
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Import CSV
            </Link>
          )}
          {isStaff && internalView && (
            <a
              href="/api/assets/export/internal"
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Export internal equipment
            </a>
          )}
          {isStaff && hasInternalOrg && (
            <Link
              href="/assets/new?internal=1"
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              + Add Internal Equipment
            </Link>
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

      {isStaff && (
        <AssetsFilters
          organizations={organizations}
          orgId={selectedOrg?.id ?? ""}
          segment={segment}
          q={q}
        />
      )}

      <AssetsTable
        assets={rows}
        isStaff={isStaff}
        internalView={internalView}
        emptyMessage={
          q
            ? `No assets match "${q}".`
            : selectedOrg
              ? "No assets match these filters."
            : isStaff
              ? 'No assets yet. Click "Add Asset" to create the first one.'
              : "No assets on file yet."
        }
      />
    </AppShell>
  );
}
