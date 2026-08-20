import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { woRef, dateTimeLabel } from "@/lib/format";
import { updatePart } from "../actions";
import { ReceiveStockButton } from "../receive-stock-button";

const inputClass =
  "mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";
const labelClass = "block text-sm font-medium text-ink-soft";

function stockStatus(quantityOnHand: number, reorderLevel: number): "in_stock" | "low_stock" | "out_of_stock" {
  if (quantityOnHand <= 0) return "out_of_stock";
  if (reorderLevel > 0 && quantityOnHand <= reorderLevel) return "low_stock";
  return "in_stock";
}

export default async function PartDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; saved?: string };
}) {
  await requireStaff("/parts");
  const profile = await getProfile();

  const supabase = await createClient();

  const [{ data: part }, { data: usage }, { data: receipts }] = await Promise.all([
    supabase.from("parts").select("*").eq("id", params.id).single(),
    // Reverse embed — work_order_parts.part_id is the FK pointing here, so
    // this comes back as a plain list, most recent use first. This is the
    // traceability the flat "quantity_on_hand number" alone can't give you:
    // which work orders actually consumed this part, and when.
    supabase
      .from("work_order_parts")
      .select("id, quantity_used, created_at, work_orders(id, task_title)")
      .eq("part_id", params.id)
      .order("created_at", { ascending: false })
      .limit(25),
    // The "In" side, schema_step32.sql — merged with the usage rows above
    // into one chronological Stock History further down.
    supabase
      .from("part_receipts")
      .select("id, quantity_received, supplier, reference_number, created_at")
      .eq("part_id", params.id)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (!part) notFound();

  const boundUpdate = updatePart.bind(null, params.id);
  const status = stockStatus(part.quantity_on_hand, part.reorder_level);

  // Supabase's inferred type for this embed comes back as an array even
  // though work_order_parts.work_order_id is a single FK — same pattern as
  // work-orders/page.tsx's service_tickets?.[0] handling. Normalized here
  // rather than inline in the JSX below.
  type HistoryEntry = {
    id: string;
    created_at: string;
    direction: "in" | "out";
    quantity: number;
    label: ReactNode;
  };

  const outEntries: HistoryEntry[] = (usage ?? []).map((u) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wo = (Array.isArray(u.work_orders) ? u.work_orders[0] : u.work_orders) as any;
    return {
      id: `out-${u.id}`,
      created_at: u.created_at,
      direction: "out",
      quantity: u.quantity_used,
      label: (
        <>
          used on{" "}
          {wo?.id ? (
            <Link href="/work-orders" className="text-blue-400 hover:underline">
              {woRef(wo.id)} — {wo.task_title}
            </Link>
          ) : (
            "a since-deleted work order"
          )}
        </>
      ),
    };
  });

  const inEntries: HistoryEntry[] = (receipts ?? []).map((r) => ({
    id: `in-${r.id}`,
    created_at: r.created_at,
    direction: "in",
    quantity: r.quantity_received,
    label: (
      <>
        received{r.supplier ? ` from ${r.supplier}` : ""}
        {r.reference_number ? ` (${r.reference_number})` : ""}
      </>
    ),
  }));

  const history = [...outEntries, ...inEntries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <AppShell
      profile={profile}
      title={`Part — ${part.name}`}
      actions={
        <Link
          href="/parts"
          className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
        >
          ← Back to Parts
        </Link>
      }
    >
      <div className="mx-auto max-w-2xl">
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        {searchParams?.saved === "1" && (
          <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            Changes saved.
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            <span className="text-sm text-ink-soft">
              {part.quantity_on_hand} {part.unit} on hand
              {part.reorder_level > 0 ? ` · reorder at ${part.reorder_level} ${part.unit}` : ""}
            </span>
          </div>
          <ReceiveStockButton
            partId={part.id}
            partName={part.name}
            currentQuantity={part.quantity_on_hand}
            unit={part.unit}
          />
        </div>

        <form
          action={boundUpdate}
          className="space-y-5 rounded-xl border border-hairline bg-surface p-6"
        >
          <div>
            <label className={labelClass}>Part Name</label>
            <input name="name" required defaultValue={part.name} className={inputClass} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>SKU / Part Number</label>
              <input name="sku" defaultValue={part.sku ?? ""} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <input name="category" defaultValue={part.category ?? ""} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Quantity on Hand</label>
              <input
                name="quantity_on_hand"
                type="number"
                defaultValue={part.quantity_on_hand}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Reorder At</label>
              <input
                name="reorder_level"
                type="number"
                min="0"
                defaultValue={part.reorder_level}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Unit</label>
              <input name="unit" defaultValue={part.unit} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Unit Cost (₱)</label>
            <input
              name="unit_cost"
              type="number"
              min="0"
              step="0.01"
              defaultValue={part.unit_cost ?? ""}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea name="notes" rows={3} defaultValue={part.notes ?? ""} className={inputClass} />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
          >
            Save Changes
          </button>
        </form>

        <div className="mt-6 rounded-xl border border-hairline bg-surface p-6">
          <h2 className="mb-3 text-sm font-semibold text-ink">Stock History</h2>
          <p className="mb-3 text-xs text-slate-500">
            Every delivery received and every use logged against a work order, most recent
            first.
          </p>
          {history.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between border-b border-hairline pb-2 last:border-b-0 last:pb-0"
                >
                  <div>
                    <span
                      className={`font-medium ${h.direction === "in" ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {h.direction === "in" ? "+" : "−"}
                      {h.quantity} {part.unit}
                    </span>{" "}
                    <span className="text-ink-soft">{h.label}</span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-500">
                    {dateTimeLabel(h.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No stock movement logged yet — this fills in once a delivery is received or a
              use is logged against a work order.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
