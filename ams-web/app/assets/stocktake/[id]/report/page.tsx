import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { dateTimeLabel } from "@/lib/format";
import { SEGMENTS } from "@/lib/internal-equipment";
import { countStocktake, stocktakeResultLabel, type StocktakeItem } from "@/lib/stocktake";
import { PrintButton } from "@/components/print-button";

// Printable discrepancy report for one stocktake: what is missing, what is
// held by someone other than expected, what was not counted, and any
// condition notes. Standalone and always white, like the other printable
// documents. Reading it changes nothing in the register.
export default async function StocktakeReportPage({ params }: { params: { id: string } }) {
  await requireStaff();
  const supabase = await createClient();

  const { data: stocktake } = await supabase
    .from("equipment_stocktakes")
    .select("id, name, scope_segment, status, started_at, completed_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!stocktake) notFound();

  const { data: itemRows } = await supabase
    .from("equipment_stocktake_items")
    .select(
      "id, asset_id, asset_tag, description, expected_custodian, expected_department, result, actual_custodian, condition_note, checked_at",
    )
    .eq("stocktake_id", params.id)
    .order("asset_tag", { ascending: true });
  const items = (itemRows ?? []) as StocktakeItem[];
  const counts = countStocktake(items);

  const missing = items.filter((i) => i.result === "missing");
  const different = items.filter((i) => i.result === "different_holder");
  const notCounted = items.filter((i) => !i.result);
  const notes = items.filter((i) => i.result === "found" && i.condition_note);

  const summary: [string, number][] = [
    ["Items", counts.total],
    ["Found", counts.found],
    ["Missing", counts.missing],
    ["Different holder", counts.differentHolder],
    ["Not counted", counts.notCounted],
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="print:hidden flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
        <Link
          href={`/assets/stocktake/${params.id}`}
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
        >
          ← Back to stocktake
        </Link>
        <PrintButton label="Print report" />
      </div>

      <div className="mx-auto max-w-3xl px-8 py-10 print:max-w-none print:px-0 print:py-0">
        <div className="mb-6 flex items-center justify-between gap-6 border-b-2 border-slate-900 pb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pacific-horizon-tek-logo.png" alt="Pacific Horizon Tek Inc." className="h-14 w-auto" />
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Equipment Register</p>
            <h1 className="text-xl font-bold">Stocktake Report</h1>
            <p className="text-sm">{stocktake.name}</p>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          {SEGMENTS.find((s) => s.value === stocktake.scope_segment)?.label ?? "All segments"} · started{" "}
          {dateTimeLabel(stocktake.started_at)}
          {stocktake.completed_at
            ? ` · completed ${dateTimeLabel(stocktake.completed_at)}`
            : " · still open, figures are as of now"}
        </p>

        <div className="mt-4 grid grid-cols-5 gap-3 text-center text-sm">
          {summary.map(([label, value]) => (
            <div key={label} className="rounded border border-slate-300 px-2 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <Section
          title="Missing"
          rows={missing}
          empty="Nothing is missing."
          headers={["Asset No.", "Item", "Last recorded holder", "Note"]}
          cells={(i) => [i.asset_tag, i.description ?? "—", i.expected_custodian ?? "nobody recorded", i.condition_note ?? ""]}
        />
        <Section
          title="Held by someone else"
          rows={different}
          empty="No holder differences."
          headers={["Asset No.", "Item", "Recorded holder", "Actually held by"]}
          cells={(i) => [i.asset_tag, i.description ?? "—", i.expected_custodian ?? "nobody recorded", i.actual_custodian ?? "—"]}
        />
        <Section
          title="Condition notes on found items"
          rows={notes}
          empty="No notes."
          headers={["Asset No.", "Item", "Holder", "Note"]}
          cells={(i) => [i.asset_tag, i.description ?? "—", i.expected_custodian ?? "—", i.condition_note ?? ""]}
        />
        <Section
          title="Not counted"
          rows={notCounted}
          empty="Everything was counted."
          headers={["Asset No.", "Item", "Recorded holder", "Result"]}
          cells={(i) => [i.asset_tag, i.description ?? "—", i.expected_custodian ?? "nobody recorded", stocktakeResultLabel(i.result)]}
        />

        <div className="mt-12 grid grid-cols-2 gap-x-12 text-sm">
          {["Counted by (name, signature, date)", "Reviewed by (name, signature, date)"].map((label) => (
            <div key={label}>
              <div className="border-b border-slate-900 pt-10" />
              <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  rows,
  empty,
  headers,
  cells,
}: {
  title: string;
  rows: StocktakeItem[];
  empty: string;
  headers: string[];
  cells: (item: StocktakeItem) => string[];
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">
        {title} <span className="font-normal text-slate-500">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-400 text-[10px] uppercase tracking-wide text-slate-500">
              {headers.map((h) => (
                <th key={h} className="py-1 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="break-inside-avoid border-b border-slate-200 align-top">
                {cells(r).map((c, idx) => (
                  <td key={idx} className={`py-1 pr-3 ${idx === 0 ? "font-mono font-semibold" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
