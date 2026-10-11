import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { getInternalOrgIds } from "@/lib/internal-org";
import { AppShell } from "@/components/app-shell";
import { internalAssetsHref } from "@/lib/internal-equipment";
import { InternalStatusBadges } from "@/app/assets/internal-badges";
import { loadAllHeld, loadCustodianItems } from "../load";
import { loadCustodianProfiles } from "../profiles";
import { CustodianForm } from "../custodian-form";
import { custodianKey, summariseCustodians } from "@/lib/custodians";

// One person's equipment: what they hold, with a handover form per item and
// a printable clearance form for when they leave or hand things back.
export default async function CustodianPage({
  searchParams,
}: {
  searchParams: { name?: string; error?: string; saved?: string };
}) {
  await requireStaff();
  const name = (searchParams?.name ?? "").trim();
  if (!name) redirect("/custodians");

  const profile = await getProfile();
  const { rows, spelling, error } = await loadCustodianItems(name);
  const supabase = await createClient();
  const orgId = (await getInternalOrgIds(supabase))[0] ?? "";
  const { byKey: profiles, ready } = await loadCustodianProfiles(supabase);
  const profile_ = profiles.get(custodianKey(name)) ?? null;
  // Everyone else who holds equipment, so a rename onto one of them is
  // recognised as a merge.
  const everyone = summariseCustodians((await loadAllHeld(supabase)).rows).map((p) => p.name);
  const needsRepair = rows.filter((r) => r.condition === "for_repair" || r.condition === "damaged").length;
  const clearanceHref = `/custodians/clearance?name=${encodeURIComponent(name)}`;

  return (
    <AppShell
      profile={profile}
      title={rows.length ? spelling : name}
      subtitle="Company equipment held by this person."
      actions={
        <>
          <Link
            href="/custodians"
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            ← All custodians
          </Link>
          {rows.length > 0 && (
            <>
              <Link
                href={internalAssetsHref({ org: orgId }, { custodian: spelling })}
                className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
              >
                Open in Assets
              </Link>
              <Link href={clearanceHref} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500">
                Print clearance form
              </Link>
            </>
          )}
        </>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
      )}
      {searchParams?.error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {searchParams.error}
        </p>
      )}
      {searchParams?.saved && (
        <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          {searchParams.saved}
        </p>
      )}
      {profile_?.status === "left" && rows.length > 0 && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Marked as having left the company, but still holds {rows.length} item{rows.length === 1 ? "" : "s"}. Print
          the clearance form to get {rows.length === 1 ? "it" : "them"} back.
        </p>
      )}
      <CustodianForm
        originalName={rows.length ? spelling : name}
        itemCount={rows.length}
        profile={profile_}
        otherNames={everyone}
        ready={ready}
      />

      {rows.length === 0 ? (
        <p className="rounded-xl border border-hairline bg-surface p-6 text-sm text-slate-500">
          No active equipment is recorded for &quot;{name}&quot;. Their items may have been reassigned or retired.
        </p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Items held</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{rows.length}</p>
            </div>
            <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Needs repair</p>
              <p className={`mt-1 text-2xl font-semibold ${needsRepair > 0 ? "text-amber-400" : "text-ink"}`}>{needsRepair}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Asset No.</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Serial</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3 text-right">Form</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-hairline hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link href={`/assets/${r.id}`} className="hover:underline">
                        {r.asset_tag}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {r.description || [r.brand, r.model].filter(Boolean).join(" ") || "—"}
                      {r.asset_category ? <span className="block text-xs text-slate-500">{r.asset_category}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{r.serial_number ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{r.department ?? "—"}</td>
                    <td className="px-4 py-3">
                      <InternalStatusBadges assignmentStatus={r.assignment_status} condition={r.condition} />
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{r.date_issued ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/assets/${r.id}/handover`} className="text-xs font-medium text-blue-400 hover:underline">
                        Handover form
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
