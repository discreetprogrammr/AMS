import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { dateTimeLabel } from "@/lib/format";
import { SEGMENTS } from "@/lib/internal-equipment";
import { countStocktake, stocktakeResultLabel, type StocktakeItem } from "@/lib/stocktake";
import { completeStocktake, deleteStocktake, recordCount } from "../actions";
import { ConfirmButton } from "../confirm-button";

// One stocktake: count items one by one (open), or read the result
// (completed). The default view of an open count is what is still to do.
const VIEWS = [
  { value: "todo", label: "To count" },
  { value: "found", label: "Found" },
  { value: "missing", label: "Missing" },
  { value: "different_holder", label: "Different holder" },
  { value: "all", label: "All" },
] as const;

const TONE: Record<string, string> = {
  found: "bg-emerald-500/15 text-emerald-400",
  missing: "bg-red-500/15 text-red-400",
  different_holder: "bg-amber-500/15 text-amber-400",
};

export default async function StocktakePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { show?: string; q?: string; error?: string };
}) {
  await requireStaff();
  const profile = await getProfile();
  const supabase = await createClient();

  const { data: stocktake } = await supabase
    .from("equipment_stocktakes")
    .select("id, name, scope_segment, status, started_at, completed_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!stocktake) notFound();

  const { data: itemRows, error } = await supabase
    .from("equipment_stocktake_items")
    .select(
      "id, asset_id, asset_tag, description, expected_custodian, expected_department, result, actual_custodian, condition_note, checked_at",
    )
    .eq("stocktake_id", params.id)
    .order("asset_tag", { ascending: true });
  const items = (itemRows ?? []) as StocktakeItem[];

  const open = stocktake.status === "open";
  const counts = countStocktake(items);
  const show = VIEWS.some((v) => v.value === searchParams?.show)
    ? (searchParams.show as string)
    : open
      ? "todo"
      : "all";
  const q = (searchParams?.q ?? "").trim().toLowerCase();

  const visible = items.filter((i) => {
    if (show === "todo" && i.result) return false;
    if (show !== "todo" && show !== "all" && i.result !== show) return false;
    if (!q) return true;
    return [i.asset_tag, i.description, i.expected_custodian, i.actual_custodian]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const href = (next: { show?: string; q?: string }) => {
    const p = new URLSearchParams();
    const s = next.show ?? show;
    const query = next.q ?? q;
    if (s !== (open ? "todo" : "all")) p.set("show", s);
    if (query) p.set("q", query);
    const qs = p.toString();
    return `/assets/stocktake/${params.id}${qs ? `?${qs}` : ""}`;
  };
  const backValue = href({});

  const tiles = [
    { label: "Items", value: counts.total },
    { label: "Found", value: counts.found },
    { label: "Missing", value: counts.missing, warn: counts.missing > 0 },
    { label: "Different holder", value: counts.differentHolder, warn: counts.differentHolder > 0 },
    { label: "Not counted", value: counts.notCounted },
  ];

  const buttonClass = "rounded-lg border px-3 py-1.5 text-xs font-medium";
  const inputClass =
    "h-9 rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:border-blue-500 focus:outline-none";

  return (
    <AppShell
      profile={profile}
      title={stocktake.name}
      subtitle={`${SEGMENTS.find((s) => s.value === stocktake.scope_segment)?.label ?? "All segments"} · started ${dateTimeLabel(stocktake.started_at)}${
        stocktake.completed_at ? ` · completed ${dateTimeLabel(stocktake.completed_at)}` : ""
      }`}
      actions={
        <>
          <Link
            href="/assets/stocktake"
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            ← All stocktakes
          </Link>
          <a
            href={`/api/assets/stocktake/${params.id}/export`}
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            Export CSV
          </a>
          <Link
            href={`/assets/stocktake/${params.id}/report`}
            className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            Print report
          </Link>
        </>
      }
    >
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

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-hairline bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${t.warn ? "text-amber-400" : "text-ink"}`}>{t.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v.value}
              href={href({ show: v.value })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                show === v.value
                  ? "border-blue-500 bg-blue-500/15 text-blue-400"
                  : "border-hairline text-ink-soft hover:bg-surface-2"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
        <form action={`/assets/stocktake/${params.id}`} className="ml-auto flex gap-2">
          {show !== (open ? "todo" : "all") && <input type="hidden" name="show" value={show} />}
          <input name="q" defaultValue={q} placeholder="Search tag, name, holder…" className={`${inputClass} w-60`} />
          <button type="submit" className={`${buttonClass} border-hairline text-ink-soft hover:bg-surface-2`}>
            Search
          </button>
        </form>
      </div>

      <ul className="space-y-3">
        {visible.map((i) => (
          <li key={i.id} id={`item-${i.id}`} className="rounded-xl border border-hairline bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {i.asset_id ? (
                    <Link href={`/assets/${i.asset_id}`} className="hover:underline">
                      {i.asset_tag}
                    </Link>
                  ) : (
                    i.asset_tag
                  )}
                  <span className="ml-2 font-normal text-ink-soft">{i.description || "—"}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Expected holder: {i.expected_custodian || "nobody recorded"}
                  {i.expected_department ? ` · ${i.expected_department}` : ""}
                </p>
              </div>
              {i.result && (
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${TONE[i.result] ?? ""}`}
                >
                  {stocktakeResultLabel(i.result)}
                </span>
              )}
            </div>

            {i.result && (i.actual_custodian || i.condition_note) && (
              <p className="mt-2 text-xs text-ink-soft">
                {i.actual_custodian ? `Held by: ${i.actual_custodian}. ` : ""}
                {i.condition_note ? `Note: ${i.condition_note}` : ""}
              </p>
            )}
            {i.checked_at && <p className="mt-1 text-xs text-slate-500">Counted {dateTimeLabel(i.checked_at)}</p>}

            {open && (
              <form action={recordCount.bind(null, params.id, i.id)} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="back" value={backValue} />
                <input
                  name="actual_custodian"
                  defaultValue={i.actual_custodian ?? ""}
                  placeholder="Who holds it now (Different holder)"
                  className={`${inputClass} w-64`}
                />
                <input
                  name="condition_note"
                  defaultValue={i.condition_note ?? ""}
                  placeholder="Condition note (optional)"
                  className={`${inputClass} w-64`}
                />
                <button
                  type="submit"
                  name="result"
                  value="found"
                  className={`${buttonClass} border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10`}
                >
                  Found
                </button>
                <button
                  type="submit"
                  name="result"
                  value="different_holder"
                  className={`${buttonClass} border-amber-500/40 text-amber-400 hover:bg-amber-500/10`}
                >
                  Different holder
                </button>
                <button
                  type="submit"
                  name="result"
                  value="missing"
                  className={`${buttonClass} border-red-500/40 text-red-400 hover:bg-red-500/10`}
                >
                  Missing
                </button>
                {i.result && (
                  <button
                    type="submit"
                    name="result"
                    value="reset"
                    className={`${buttonClass} border-hairline text-ink-soft hover:bg-surface-2`}
                  >
                    Clear
                  </button>
                )}
              </form>
            )}
          </li>
        ))}
        {visible.length === 0 && (
          <li className="rounded-xl border border-hairline bg-surface p-8 text-center text-sm text-slate-500">
            {q ? `Nothing matches "${q}".` : show === "todo" ? "Everything has been counted." : "Nothing here."}
          </li>
        )}
      </ul>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
        {open ? (
          <form action={completeStocktake.bind(null, params.id)}>
            <ConfirmButton
              message={
                counts.notCounted > 0
                  ? `${counts.notCounted} item${counts.notCounted === 1 ? " has" : "s have"} not been counted. Complete the stocktake anyway? Counts can't be changed afterwards.`
                  : "Complete the stocktake? Counts can't be changed afterwards."
              }
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              Complete stocktake
            </ConfirmButton>
          </form>
        ) : (
          <p className="text-sm text-slate-500">Completed. The register was not changed by this count.</p>
        )}
        <form action={deleteStocktake.bind(null, params.id)}>
          <ConfirmButton
            message={`Delete the stocktake "${stocktake.name}" and all its counts? This can't be undone.`}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10"
          >
            Delete stocktake
          </ConfirmButton>
        </form>
      </div>
    </AppShell>
  );
}
