import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffViewRole } from "@/lib/supabase/profile";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";
import { loadAssemblyIds } from "@/lib/assemblies";
import { AppShell } from "@/components/app-shell";
import { SearchBar } from "@/components/search-bar";
import {
  applyInternalFilters,
  manilaDate,
  parseInternalFilters,
} from "@/lib/internal-equipment";
import { AssetsTable, type AssetRow } from "./assets-table";
import { AssetsFilters, type InternalOptions } from "./assets-filters";
import { InternalSummaryTiles, type InternalSummary } from "./internal-summary";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined> & {
    q?: string;
    deleted?: string;
    org?: string;
    error?: string;
    bulk?: string;
  };
}) {
  const supabase = await createClient();
  const profile = await getProfile();
  const isStaff = isStaffViewRole(profile?.role);

  // Powers the search bar on the dashboard (and this page's own search
  // box) — a plain ?q= query string, no client JS needed. Matches against
  // asset_tag/brand/model directly; PostgREST's .or() splits on commas, so
  // strip any from the input first rather than trying to escape them.
  const q = (searchParams?.q ?? "").trim().replace(/,/g, "");

  // Filters live in the URL (?org=<uuid>&segment=<value>), staff only: a
  // client_viewer is already scoped to one organization by RLS. Segment
  // only means something for the internal organization (schema_step46).
  //
  // HR & Admin preset (lib/hr-admin-preset.ts): the list of organizations
  // is internal organizations only, and one of them is always selected, so
  // neither ?org= nor anything else in the URL can reach a client asset.
  const hrAdminPreset = isStaff && isHrAdminPreset(profile?.hidden_modules);
  let orgQuery = supabase.from("organizations").select("id, name, is_internal").order("name");
  if (hrAdminPreset) orgQuery = orgQuery.eq("is_internal", true);
  const { data: orgList } = isStaff ? await orgQuery : { data: [] };
  const organizations = orgList ?? [];
  const selectedOrg =
    organizations.find((o) => o.id === searchParams?.org) ?? (hrAdminPreset ? organizations[0] : undefined);
  const internalView = !!selectedOrg?.is_internal;
  // Segment / view / custodian / department / category / warranty only
  // mean something for the internal organization (parseInternalFilters).
  const filters = parseInternalFilters(internalView ? searchParams : {});
  const segment = filters.segment;
  const hasInternalOrg = organizations.some((o) => o.is_internal);

  let query = supabase
    .from("assets")
    .select(
      "id, asset_tag, serial_number, equipment_type, brand, model, status, segment, asset_category, description, custodian, department, assignment_status, condition, warranty_end_date, parent_asset_id, sites(address), organizations(name)",
    )
    .order("created_at", { ascending: false });

  if (selectedOrg) query = query.eq("organization_id", selectedOrg.id);
  if (internalView) query = applyInternalFilters(query, filters, manilaDate());

  if (q) {
    query = query.or(
      `asset_tag.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%,serial_number.ilike.%${q}%,description.ilike.%${q}%,custodian.ilike.%${q}%`,
    );
  }

  // A preset user with no internal organization to select sees nothing,
  // rather than an unscoped list.
  const { data: assets, error } = hrAdminPreset && !selectedOrg ? { data: [], error: null } : await query;

  // Internal view extras: summary tiles (org + Segment only, not q or the
  // other filters) and the distinct values behind the dropdowns.
  let summary: InternalSummary | null = null;
  let options: InternalOptions | null = null;
  // Assemblies (a record that other items are "part of", such as the Desktop
  // PC) are shown in the list but left out of the totals (lib/assemblies.ts).
  const assemblyIds =
    internalView && selectedOrg ? await loadAssemblyIds(supabase, [selectedOrg.id]) : new Set<string>();

  if (internalView && selectedOrg) {
    const today = manilaDate();
    const count = async (extra: Partial<typeof filters>) => {
      let base = supabase
        .from("assets")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", selectedOrg.id);
      if (assemblyIds.size > 0) base = base.not("id", "in", `(${Array.from(assemblyIds).join(",")})`);
      // Typed as a plain promise: PostgREST's builder generics are too deep
      // for tsc once they pass through the shared helper.
      const result = (await applyInternalFilters(
        base,
        {
          ...filters,
          view: "all",
          custodian: "",
          department: "",
          category: "",
          warranty: "",
          condition: "",
          assignment: "",
          missing: "",
          ...extra,
        },
        today,
      )) as { count: number | null };
      return result.count ?? 0;
    };
    const [total, assigned, inStock, needsRepair, warrantyExpiring, { data: facets }] =
      await Promise.all([
        count({}),
        count({ view: "assigned" }),
        count({ view: "in_stock" }),
        count({ view: "repair" }),
        count({ warranty: "expiring" }),
        supabase
          .from("assets")
          .select("custodian, department, asset_category")
          .eq("organization_id", selectedOrg.id),
      ]);
    const { data: listed } = await supabase.from("equipment_custodians").select("name, status");
    const listedCustodians = ((listed ?? []) as { name: string; status: string }[])
      .filter((p) => p.status !== "left")
      .map((p) => p.name);
    summary = { total, assigned, inStock, needsRepair, warrantyExpiring };
    const distinct = (pick: (r: { custodian: string | null; department: string | null; asset_category: string | null }) => string | null) =>
      Array.from(
        new Set((facets ?? []).map((r) => pick(r)?.trim() ?? "").filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b));
    options = {
      // The custodian list plus anyone already on an item, de-duplicated.
      custodians: Array.from(
        new Map(
          [...distinct((r) => r.custodian), ...listedCustodians].map((n) => [n.trim().toLowerCase(), n] as const),
        ).values(),
      ).sort((a, b) => a.localeCompare(b)),
      hasUnassigned: (facets ?? []).some((r) => !r.custodian?.trim()),
      departments: distinct((r) => r.department),
      categories: distinct((r) => r.asset_category),
    };
  }

  // Tag of each part's assembly, for the "Part of ..." line. The assembly is
  // usually in the list already; the filters can hide it, so look up the rest.
  const tagById = new Map<string, string>((assets ?? []).map((a: { id: string; asset_tag: string }) => [a.id, a.asset_tag]));
  const missingParents = Array.from(
    new Set(
      (assets ?? [])
        .map((a: { parent_asset_id: string | null }) => a.parent_asset_id)
        .filter((id: string | null): id is string => !!id && !tagById.has(id)),
    ),
  );
  if (missingParents.length > 0) {
    const { data: parents } = await supabase.from("assets").select("id, asset_tag").in("id", missingParents);
    for (const p of parents ?? []) tagById.set(p.id, p.asset_tag);
  }

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
    is_assembly: assemblyIds.has(a.id),
    parent_tag: a.parent_asset_id ? (tagById.get(a.parent_asset_id) ?? null) : null,
  }));

  // The internal export applies the same active filters (and q).
  const exportParams = new URLSearchParams();
  if (internalView) {
    if (q) exportParams.set("q", q);
    // view is always sent: the route treats a missing view as "everything".
    for (const [k, v] of Object.entries(filters)) if (v) exportParams.set(k, v);
  }
  const exportQuery = exportParams.size ? `?${exportParams.toString()}` : "";

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
            preserve={{
              org: selectedOrg?.id,
              segment,
              view: filters.view === "all" ? "" : filters.view,
              custodian: filters.custodian,
              department: filters.department,
              category: filters.category,
              warranty: filters.warranty,
              condition: filters.condition,
              assignment: filters.assignment,
              missing: filters.missing,
            }}
          />
          <a
            href={internalView ? `/api/assets/export/internal${exportQuery}` : "/api/assets/export"}
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            Export CSV
          </a>
          {internalView && (
            <Link
              href={`/assets/labels${exportQuery}`}
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Print QR labels
            </Link>
          )}
          {isStaff && internalView && (
            <Link
              href="/assets/internal-import"
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Import CSV
            </Link>
          )}
          {isStaff && internalView && (
            <Link
              href="/assets/stocktake"
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Stocktake
            </Link>
          )}
          {isStaff && !internalView && (
            <a
              href="/api/assets/export/unserviceable"
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Unserviceable Report
            </a>
          )}
          {isStaff && !internalView && (
            <Link
              href="/assets/import"
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              Import CSV
            </Link>
          )}
          {isStaff && hasInternalOrg && (
            <Link
              href="/assets/new?internal=1"
              className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
            >
              + Add Internal Equipment
            </Link>
          )}
          {isStaff && !internalView && (
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
      {searchParams?.bulk && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          {searchParams.bulk}
        </p>
      )}
      {searchParams?.error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {searchParams.error}
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
          filters={filters}
          options={options}
          q={q}
          hideOrganization={hrAdminPreset}
        />
      )}
      {summary && <InternalSummaryTiles summary={summary} assemblies={assemblyIds.size} />}

      <AssetsTable
        assets={rows}
        isStaff={isStaff}
        internalView={internalView}
        orgId={selectedOrg?.id ?? ""}
        q={q}
        filters={filters}
        guardedDelete={hrAdminPreset}
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
