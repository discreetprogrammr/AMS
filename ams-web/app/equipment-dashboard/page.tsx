import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { getInternalOrgIds } from "@/lib/internal-org";
import {
  ASSIGNMENT_STATUSES,
  CONDITIONS,
  NONE,
  SEGMENTS,
  UNASSIGNED,
  internalAssetsHref,
  isRetiredRow,
  labelFor,
  type InternalFilters,
} from "@/lib/internal-equipment";
import { AppShell } from "@/components/app-shell";

// The internal-equipment dashboard: the landing page for the "HR & Admin"
// preset (lib/hr-admin-preset.ts), separate from the client /dashboard,
// which it does not touch. Every number comes from assets in internal
// organizations (getInternalOrgIds), selected server-side; client assets,
// tickets, service records and alerts are never queried. Counts cover the
// same rows as /assets with no pill chosen (retired / lost left out), so a
// tile and the list it links to agree. No warranty alerts and no total
// acquisition cost, by design.

type Row = {
  id: string;
  asset_tag: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  segment: string | null;
  asset_category: string | null;
  department: string | null;
  custodian: string | null;
  assignment_status: string | null;
  condition: string | null;
  acquisition_cost: number | null;
  date_acquired: string | null;
  updated_at: string | null;
  parent_asset_id: string | null;
};

type Counted = { key: string; label: string; count: number };

const UNSET = "Not set";

function tally(rows: Row[], pick: (r: Row) => string | null, labelOf?: (v: string) => string): Counted[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = pick(r)?.trim() || NONE;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts, ([key, count]) => ({
    key,
    label: key === NONE ? UNSET : (labelOf?.(key) ?? key),
    count,
  })).sort((a, b) => {
    if (a.key === NONE) return 1; // "Not set" last
    if (b.key === NONE) return -1;
    return b.count - a.count || a.label.localeCompare(b.label);
  });
}

function manilaDay(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export default async function EquipmentDashboardPage({
  searchParams,
}: {
  searchParams: { access_denied?: string };
}) {
  const profile = await getProfile();
  if (!isStaffRole(profile?.role)) redirect("/dashboard");

  const supabase = await createClient();
  const internalOrgIds = await getInternalOrgIds(supabase);
  const orgId = internalOrgIds[0] ?? "";

  let rows: Row[] = [];
  let loadError: string | null = null;
  if (internalOrgIds.length > 0) {
    const { data, error } = await supabase
      .from("assets")
      .select(
        "id, asset_tag, description, brand, model, segment, asset_category, department, custodian, assignment_status, condition, acquisition_cost, date_acquired, updated_at, parent_asset_id",
      )
      .in("organization_id", internalOrgIds)
      .order("updated_at", { ascending: false });
    rows = (data ?? []) as Row[];
    loadError = error?.message ?? null;
  }

  // An assembly (the record its parts point to, such as the Desktop PC) is
  // left out of every figure here, so the totals match HR's spreadsheet.
  const assemblyIds = new Set(rows.map((r) => r.parent_asset_id).filter((id): id is string => !!id));
  const counted = rows.filter((r) => !assemblyIds.has(r.id));
  const active = counted.filter((r) => !isRetiredRow(r));
  const retiredCount = counted.length - active.length;
  const href = (f: Partial<InternalFilters>) => internalAssetsHref({ org: orgId }, f);

  const bySegment = (value: string) => active.filter((r) => r.segment === value).length;
  const needsAttention = active.filter((r) => r.condition === "for_repair" || r.condition === "damaged").length;

  const tiles = [
    { label: "Total company assets", value: active.length, to: href({}) },
    ...SEGMENTS.map((s) => ({ label: s.label, value: bySegment(s.value), to: href({ segment: s.value }) })),
    { label: "Needs attention", value: needsAttention, to: href({ view: "repair" }), warn: needsAttention > 0 },
  ];

  const categories = tally(active, (r) => r.asset_category);
  const departments = tally(active, (r) => r.department);
  const assignments = tally(active, (r) => r.assignment_status, (v) => labelFor(ASSIGNMENT_STATUSES, v));
  const conditions = tally(active, (r) => r.condition, (v) => labelFor(CONDITIONS, v));

  const housekeeping = [
    {
      label: "No custodian",
      value: active.filter((r) => r.custodian === null || r.custodian === "").length,
      to: href({ custodian: UNASSIGNED }),
    },
    {
      label: "No acquisition cost",
      value: active.filter((r) => r.acquisition_cost === null).length,
      to: href({ missing: "acquisition_cost" }),
    },
    {
      label: "No date acquired",
      value: active.filter((r) => r.date_acquired === null).length,
      to: href({ missing: "date_acquired" }),
    },
  ];

  const recent = counted.slice(0, 10);

  return (
    <AppShell
      profile={profile}
      title="Dashboard"
      subtitle="Company equipment register: Pacific Horizon Tek and Team Fridays Digital."
    >
      {searchParams?.access_denied === "1" && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          You don&apos;t have access to that page. Contact your Super Admin if you think this is wrong.
        </p>
      )}
      {loadError && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {loadError}
        </p>
      )}
      {internalOrgIds.length === 0 && (
        <p className="rounded-xl border border-hairline bg-surface p-6 text-sm text-slate-500">
          No internal organization is set up yet.
        </p>
      )}

      {internalOrgIds.length > 0 && (
        <div className="space-y-8">
          {/* 1. Headline tiles */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((t) => (
              <Link
                key={t.label}
                href={t.to}
                className="rounded-xl border border-hairline bg-surface px-4 py-4 hover:bg-surface-hover"
              >
                <p className="text-xs uppercase tracking-wide text-slate-500">{t.label}</p>
                <p className={`mt-1 text-3xl font-semibold ${t.warn ? "text-amber-400" : "text-ink"}`}>{t.value}</p>
              </Link>
            ))}
          </section>

          {/* 2. Breakdowns */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Breakdown
              title="By category"
              items={categories}
              total={active.length}
              linkFor={(key) => href({ category: key })}
            />
            <Breakdown
              title="By department"
              items={departments}
              total={active.length}
              linkFor={(key) => href({ department: key })}
            />
            <Breakdown
              title="By status"
              items={assignments}
              total={active.length}
              linkFor={(key) => href({ assignment: key })}
            />
            <Breakdown
              title="By condition"
              items={conditions}
              total={active.length}
              linkFor={(key) => href({ condition: key })}
            />
          </section>

          <section className="rounded-xl border border-hairline bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">Segment by category</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4 font-medium">Category</th>
                    {SEGMENTS.map((s) => (
                      <th key={s.value} className="px-4 py-2 text-right font-medium">
                        {s.label}
                      </th>
                    ))}
                    <th className="py-2 pl-4 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {categories.map((c) => (
                    <tr key={c.key}>
                      <td className="py-2 pr-4 text-ink">
                        <Link href={href({ category: c.key })} className="hover:underline">
                          {c.label}
                        </Link>
                      </td>
                      {SEGMENTS.map((s) => {
                        const n = active.filter(
                          (r) => (r.asset_category?.trim() || NONE) === c.key && r.segment === s.value,
                        ).length;
                        return (
                          <td key={s.value} className="px-4 py-2 text-right text-ink-soft">
                            {n > 0 ? (
                              <Link href={href({ category: c.key, segment: s.value })} className="hover:underline">
                                {n}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 pl-4 text-right font-medium text-ink">{c.count}</td>
                    </tr>
                  ))}
                  {categories.length === 0 && (
                    <tr>
                      <td colSpan={SEGMENTS.length + 2} className="py-6 text-center text-slate-500">
                        No equipment yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. Housekeeping */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">Housekeeping</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {housekeeping.map((h) => (
                <Link
                  key={h.label}
                  href={h.to}
                  className="rounded-xl border border-hairline bg-surface px-4 py-3 hover:bg-surface-hover"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500">{h.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-ink">{h.value}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
              Recently added or changed
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4 font-medium">Asset No.</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Segment</th>
                    <th className="px-4 py-2 font-medium">Custodian</th>
                    <th className="py-2 pl-4 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-4 font-medium text-ink">
                        <Link href={`/assets/${r.id}`} className="hover:underline">
                          {r.asset_tag}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-ink-soft">
                        {r.description || [r.brand, r.model].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-4 py-2 text-ink-soft">{labelFor(SEGMENTS, r.segment)}</td>
                      <td className="px-4 py-2 text-ink-soft">{r.custodian || "—"}</td>
                      <td className="whitespace-nowrap py-2 pl-4 text-ink-soft">{manilaDay(r.updated_at)}</td>
                    </tr>
                  ))}
                  {recent.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        No equipment yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {retiredCount > 0 && (
            <p className="text-xs text-slate-500">
              {retiredCount} retired or lost item{retiredCount === 1 ? " is" : "s are"} not counted above.{" "}
              <Link href={href({ view: "retired" })} className="text-blue-400 hover:underline">
                View them
              </Link>
            </p>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Breakdown({
  title,
  items,
  total,
  linkFor,
}: {
  title: string;
  items: Counted[];
  total: number;
  linkFor: (key: string) => string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No equipment yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.key}>
              <Link href={linkFor(i.key)} className="group block">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-ink group-hover:underline">{i.label}</span>
                  <span className="shrink-0 text-ink-soft">{i.count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-blue-500/60"
                    style={{ width: `${total > 0 ? Math.max(2, Math.round((i.count / total) * 100)) : 0}%` }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
