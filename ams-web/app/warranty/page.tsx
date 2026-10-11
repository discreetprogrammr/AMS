import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { getInternalOrgIds } from "@/lib/internal-org";
import { AppShell } from "@/components/app-shell";
import { excludeRetired, internalAssetsHref, manilaDate } from "@/lib/internal-equipment";
import { bucketWarranties, daysLabel, WARRANTY_BUCKETS, type WarrantyRow } from "@/lib/warranty";
import { loadAssemblyIds, withoutAssemblies } from "@/lib/assemblies";
import { emailIsConfigured, WARRANTY_SELECT } from "@/lib/warranty-reminders";
import { sendTestWarrantyEmail } from "./actions";

// Warranty & Renewals: company equipment whose warranty has lapsed or ends
// soon, and the weekly email that tells HR & Admin about it. Internal
// equipment only, active items only (retired / lost left out), staff only.
// Software licences and subscriptions join this page later.
const TONE: Record<string, string> = {
  expired: "text-red-400",
  d30: "text-amber-400",
  d60: "text-ink",
  d90: "text-ink",
};

export default async function WarrantyPage({ searchParams }: { searchParams: { mail?: string; mailOk?: string } }) {
  await requireStaff();
  const profile = await getProfile();
  const supabase = await createClient();
  const orgIds = await getInternalOrgIds(supabase);
  const today = manilaDate();

  let rows: WarrantyRow[] = [];
  let loadError: string | null = null;
  if (orgIds.length > 0) {
    let query = supabase.from("assets").select(WARRANTY_SELECT).in("organization_id", orgIds);
    query = excludeRetired(query);
    const { data, error } = await query;
    // An assembly has no warranty of its own; its parts do.
    rows = withoutAssemblies((data ?? []) as WarrantyRow[], await loadAssemblyIds(supabase, orgIds));
    loadError = error?.message ?? null;
  }
  const b = bucketWarranties(rows, today);
  const orgId = orgIds[0] ?? "";
  const emailReady = emailIsConfigured();

  const tiles = [
    ...WARRANTY_BUCKETS.map((w) => ({ label: w.label, value: b[w.key].length, tone: TONE[w.key], to: null as string | null })),
    {
      label: "No warranty date",
      value: b.unknown,
      tone: "text-ink",
      to: internalAssetsHref({ org: orgId }, { warranty: "unknown" }),
    },
  ];

  return (
    <AppShell
      profile={profile}
      title="Warranty & Renewals"
      subtitle="Company equipment warranties that have lapsed or are about to."
    >
      {loadError && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{loadError}</p>
      )}
      {searchParams?.mail && (
        <p
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            searchParams.mailOk === "1"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {searchParams.mail}
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map((t) => {
          const body = (
            <>
              <p className="text-xs uppercase tracking-wide text-slate-500">{t.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${t.value > 0 ? t.tone : "text-ink"}`}>{t.value}</p>
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

      <div className="space-y-6">
        {WARRANTY_BUCKETS.map(({ key, label }) =>
          b[key].length === 0 ? null : (
            <section key={key} className="rounded-xl border border-hairline bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
                {label} <span className="font-normal text-slate-500">({b[key].length})</span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4 font-medium">Asset No.</th>
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-4 py-2 font-medium">Custodian</th>
                      <th className="px-4 py-2 font-medium">Department</th>
                      <th className="px-4 py-2 font-medium">Warranty ends</th>
                      <th className="py-2 pl-4 text-right font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {b[key].map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-4 font-medium text-ink">
                          <Link href={`/assets/${r.id}`} className="hover:underline">
                            {r.asset_tag}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-ink-soft">
                          {r.description || [r.brand, r.model].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="px-4 py-2 text-ink-soft">{r.custodian || "—"}</td>
                        <td className="px-4 py-2 text-ink-soft">{r.department || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-ink-soft">{r.warranty_end_date}</td>
                        <td className={`whitespace-nowrap py-2 pl-4 text-right ${TONE[key]}`}>{daysLabel(r.daysLeft)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ),
        )}
        {b.expired.length + b.d30.length + b.d60.length + b.d90.length === 0 && (
          <p className="rounded-xl border border-hairline bg-surface p-6 text-sm text-slate-500">
            Nothing has lapsed or ends within 90 days.
          </p>
        )}
      </div>

      <section className="mt-8 rounded-xl border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">Weekly email reminder</h2>
        <p className="text-sm text-ink-soft">
          Every Monday at 8:30 AM (Manila), everyone with the HR &amp; Admin preset gets this list by email. It is skipped on a
          week when nothing has lapsed or ends within 90 days.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {emailReady
            ? "Email is set up."
            : "Email is not set up yet (RESEND_API_KEY and RESEND_FROM_EMAIL are missing), so reminders cannot go out until it is."}
        </p>
        <form action={sendTestWarrantyEmail} className="mt-3">
          <button
            type="submit"
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            Email me this list now
          </button>
        </form>
      </section>
    </AppShell>
  );
}
