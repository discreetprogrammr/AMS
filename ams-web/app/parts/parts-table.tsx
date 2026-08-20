"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { dateTimeLabel } from "@/lib/format";
import { ReceiveStockModal } from "./receive-stock-modal";

export type PartRow = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  unit_cost: number | null;
  updated_at: string;
};

type FilterKey = "all" | "low_stock" | "out_of_stock";

const FILTERS: { key: FilterKey; label: string; dotClass?: string }[] = [
  { key: "all", label: "All" },
  { key: "low_stock", label: "Low Stock", dotClass: "bg-amber-500" },
  { key: "out_of_stock", label: "Out of Stock", dotClass: "bg-red-500" },
];

// 0 reorder_level means "no threshold set" — never flags Low Stock on its
// own, only Out of Stock once it actually hits zero (or goes negative from
// over-logged usage — see decrement_part_stock in schema_step31.sql).
function stockStatus(p: PartRow): "in_stock" | "low_stock" | "out_of_stock" {
  if (p.quantity_on_hand <= 0) return "out_of_stock";
  if (p.reorder_level > 0 && p.quantity_on_hand <= p.reorder_level) return "low_stock";
  return "in_stock";
}

// Whole-row click navigates to the part's detail/edit page — same pattern
// as assets-table.tsx.
export function PartsTable({ parts }: { parts: PartRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [receiveFor, setReceiveFor] = useState<PartRow | null>(null);

  const rows = useMemo(() => {
    return parts.filter((p) => {
      const status = stockStatus(p);
      switch (filter) {
        case "low_stock":
          return status === "low_stock";
        case "out_of_stock":
          return status === "out_of_stock";
        case "all":
        default:
          return true;
      }
    });
  }, [parts, filter]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium tracking-wide transition-colors ${
              filter === f.key
                ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                : "border-hairline text-ink-soft hover:text-ink"
            }`}
          >
            {f.dotClass && <span className={`h-2 w-2 rounded-full ${f.dotClass}`} />}
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Part</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">On Hand</th>
              <th className="px-4 py-3">Reorder At</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                onClick={() => router.push(`/parts/${p.id}`)}
                className="cursor-pointer border-t border-hairline hover:bg-surface-2"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{p.name}</div>
                  {p.sku && <div className="text-xs text-slate-500">SKU {p.sku}</div>}
                </td>
                <td className="px-4 py-3 text-ink-soft">{p.category ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {p.quantity_on_hand} {p.unit}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {p.reorder_level > 0 ? `${p.reorder_level} ${p.unit}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={stockStatus(p)} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                  {dateTimeLabel(p.updated_at)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReceiveFor(p);
                    }}
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    Receive Stock
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No parts match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {receiveFor && (
        <ReceiveStockModal
          partId={receiveFor.id}
          partName={receiveFor.name}
          currentQuantity={receiveFor.quantity_on_hand}
          unit={receiveFor.unit}
          onClose={() => setReceiveFor(null)}
        />
      )}
    </div>
  );
}
