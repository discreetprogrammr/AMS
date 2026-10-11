import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { getInternalOrgIds } from "@/lib/internal-org";
import { AppShell } from "@/components/app-shell";
import { SEGMENTS, UNASSIGNED, excludeRetired, internalAssetsHref, labelFor } from "@/lib/internal-equipment";
import { summariseCustodians, type CustodyRow } from "@/lib/custodians";
import { loadCustodianProfiles } from "./profiles";

// Custodians: who holds what in the company equipment register. Built from
// the custodian typed on each internal item, so there is nothing extra to
// maintain. Internal equipment only, active items only (retired / lost left
// out), staff only.
export default async function CustodiansPage({ searchParams }: { searchParams: { q?: string } }) {
  await requireStaff();
  const profile = await getProfile();
  const supabase = await createClient();
  const orgIds = await getInternalOrgIds(supabase);

  let rows: CustodyRow[] = [];
  let unassigned = 0;
  let loadError: string | null = null;
  if (orgIds.length > 0) {
    let query = supabase
      .from("assets")
      .select(
        "id, asset_tag, description, brand, model, asset_category, serial_number, department, segment, condition, assignment_status, date_issued, custodian",
      )
      .in("organization_id", orgIds);
    query = excludeRetired(query);
    const { data, error } = await query;
    rows = (data ?? []) as CustodyRow[];
    loadError = error?.message ?? null;
    unassigned = rows.filter((r) => !r.custodian?.trim()).length;
  }

  const { byKey: profiles } = await loadCustodianProfiles(supabase);
  const people = summariseCustodians(rows);
  const leftButHolding = people.filter((p) => profiles.get(p.key)?.status === "left");
  const q = (searchParams?.q ?? "").trim().toLowerCase();
  const shown = q
    ? people.filter((p) =>
        [p.name, ...p.departments, profiles.get(p.key)?.job_title ?? ""].some((v) => v.toLowerCase().includes(q)),
      )
    : people;
  const totalHeld = people.reduce((n, p) => n + p.items, 0);
  const unassignedHref = internalAssetsHref({ org: orgIds[0] ?? "" }, { custodian: UNASSIGNED });

  const inputClass =
    "h-10 rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:border-blue-500 focus:outline-none";

  return (
    <AppShell
      profile={profile}
      title="Custodians"
      subtitle="Who holds which company equipment."
    >
      {loadError && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {loadError}
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "People holding equipment", value: people.length, to: null },
          { label: "Items held", value: totalHeld, to: null },
          {
            label: "Left the company, still holding",
            value: leftButHolding.reduce((n, p) => n + p.items, 0),
            to: null,
            warn: leftButHolding.length > 0,
          },
          { label: "Items with no custodian", value: unassigned, to: unassignedHref },
        ].map((t) => {
          const body = (
            <>
              <p className="text-xs uppercase tracking-wide text-slate-500">{t.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${"warn" in t && t.warn ? "text-amber-400" : "text-ink"}`}>{t.value}</p>
            </>
          );
          return t.to ? (
            <Link key={t.label} href={t.to} className="rounded-xl border border-hairline bg-surface px-4 py-3 hover:bg-surface-hover">
              {body}
            </Link>
          ) : (
            <div key={t.label} className="rounded-xl border border-hairline bg-surface px-4 py-3">
              {body}
            </div>
          );
        })}
      </div>

      <form action="/custodians" className="mb-4 flex gap-2">
        <input name="q" defaultValue={searchParams?.q ?? ""} placeholder="Search a name, title or department…" className={`${inputClass} w-72`} />
        <button type="submit" className="rounded-lg border border-hairline px-3 text-sm text-ink-soft hover:bg-surface-2">
          Search
        </button>
        {q && (
          <Link href="/custodians" className="flex items-center px-2 text-sm text-ink-soft hover:underline">
            Clear
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Custodian</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Segment</th>
              <th className="px-4 py-3 text-right">Items</th>
              <th className="px-4 py-3 text-right">Needs repair</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.key} className="border-t border-hairline hover:bg-surface-2">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link href={`/custodians/view?name=${encodeURIComponent(p.name)}`} className="hover:underline">
                    {p.name}
                  </Link>
                  {profiles.get(p.key)?.status === "left" && (
                    <span className="ml-2 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                      Left
                    </span>
                  )}
                  {profiles.get(p.key)?.job_title ? (
                    <span className="block text-xs font-normal text-slate-500">{profiles.get(p.key)?.job_title}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-ink-soft">{p.departments.join(", ") || "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{p.segments.map((s) => labelFor(SEGMENTS, s)).join(", ") || "—"}</td>
                <td className="px-4 py-3 text-right text-ink">{p.items}</td>
                <td className={`px-4 py-3 text-right ${p.needsRepair > 0 ? "text-amber-400" : "text-ink-soft"}`}>
                  {p.needsRepair}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {q ? `Nobody matches "${searchParams.q}".` : "No equipment has a custodian yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Names are grouped ignoring capital letters and extra spaces, as they are typed on each item. If the same
        person appears twice under different spellings (for example a nickname), fix the item with Bulk edit on the
        Assets list.
      </p>
    </AppShell>
  );
}
