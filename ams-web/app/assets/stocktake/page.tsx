import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { dateTimeLabel } from "@/lib/format";
import { SEGMENTS, manilaDate } from "@/lib/internal-equipment";
import { isMissingTableError } from "@/lib/stocktake";
import { startStocktake } from "./actions";

// Equipment stocktake (schema_step49.sql): a physical count of the company
// register. Internal equipment only; separate from the client Asset
// Verification module.
export default async function StocktakeListPage({ searchParams }: { searchParams: { error?: string } }) {
  await requireStaff();
  const profile = await getProfile();
  const supabase = await createClient();

  const { data: stocktakes, error } = await supabase
    .from("equipment_stocktakes")
    .select("id, name, scope_segment, status, started_at, completed_at")
    .order("started_at", { ascending: false });

  const setupMissing = isMissingTableError(error);

  // Progress per stocktake: head counts, because a plain select is capped at
  // 1000 rows in total.
  const progress = new Map<string, { total: number; counted: number }>();
  await Promise.all(
    (stocktakes ?? []).map(async (s) => {
      const [total, counted] = await Promise.all([
        supabase.from("equipment_stocktake_items").select("id", { count: "exact", head: true }).eq("stocktake_id", s.id),
        supabase
          .from("equipment_stocktake_items")
          .select("id", { count: "exact", head: true })
          .eq("stocktake_id", s.id)
          .not("result", "is", null),
      ]);
      progress.set(s.id, { total: total.count ?? 0, counted: counted.count ?? 0 });
    }),
  );

  const defaultName = `Stocktake ${manilaDate().slice(0, 7)}`;
  const inputClass =
    "h-10 rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:border-blue-500 focus:outline-none";

  return (
    <AppShell
      profile={profile}
      title="Equipment Stocktake"
      subtitle="Count the company equipment register and see what is missing or with someone else."
      actions={
        <Link
          href="/assets"
          className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
        >
          ← Back to Assets
        </Link>
      }
    >
      {searchParams?.error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {searchParams.error}
        </p>
      )}
      {setupMissing ? (
        <p className="rounded-xl border border-hairline bg-surface p-6 text-sm text-slate-500">
          The stocktake is not set up yet. Run schema_step49.sql in the Supabase SQL editor.
        </p>
      ) : (
        <div className="space-y-8">
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error.message}
            </p>
          )}

          <form
            action={startStocktake}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-hairline bg-surface p-5"
          >
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-500">
              Name
              <input name="name" defaultValue={defaultName} required className={`${inputClass} w-64`} />
            </label>
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-slate-500">
              Scope
              <select name="segment" defaultValue="" className={inputClass}>
                <option value="">All segments</option>
                {SEGMENTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-ink hover:bg-blue-500"
            >
              Start stocktake
            </button>
            <p className="basis-full text-xs text-slate-500">
              Starting takes a snapshot of every active item in scope (retired and lost items are left out) with who
              is expected to hold it. The register itself is not changed by counting.
            </p>
          </form>

          <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {(stocktakes ?? []).map((s) => {
                  const p = progress.get(s.id) ?? { total: 0, counted: 0 };
                  return (
                    <tr key={s.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link href={`/assets/stocktake/${s.id}`} className="hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {SEGMENTS.find((x) => x.value === s.scope_segment)?.label ?? "All segments"}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{dateTimeLabel(s.started_at)}</td>
                      <td className="px-4 py-3 text-ink-soft">
                        {p.counted} of {p.total} counted
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                            s.status === "open"
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-emerald-500/15 text-emerald-400"
                          }`}
                        >
                          {s.status === "open" ? "Open" : "Completed"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {(stocktakes ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No stocktakes yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
