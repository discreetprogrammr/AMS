"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logPartUsage } from "./actions";

export type PartOption = {
  id: string;
  name: string;
  unit: string;
  quantity_on_hand: number;
};

// Opened from a "Log Parts" button on a work order row (work-orders-table.tsx)
// — lets staff record a part consumed against that specific work order
// without needing a full work-order detail page (which doesn't exist yet;
// same reasoning the module's original build note gives for not having
// one). Submitting inserts into work_order_parts, which decrements the
// part's stock via a database trigger (schema_step31.sql) — this modal
// doesn't touch stock directly, it just logs the use.
export function LogPartsModal({
  workOrderId,
  woRefLabel,
  parts,
  onClose,
}: {
  workOrderId: string;
  woRefLabel: string;
  parts: PartOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPart = parts.find((p) => p.id === partId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!partId) {
      setError("Pick a part first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await logPartUsage(workOrderId, partId, quantity);
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-hairline bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-semibold text-ink">Log Parts Used</h2>
        <p className="mb-4 text-xs text-slate-500">Against {woRefLabel}</p>

        {parts.length === 0 ? (
          <p className="text-sm text-slate-500">
            No parts in the catalog yet — add one on the Parts tab first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-ink-soft">Part</label>
              <select
                value={partId}
                onChange={(e) => setPartId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
              >
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.quantity_on_hand} {p.unit} on hand)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-soft">Quantity Used</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
              />
              {selectedPart && quantity > selectedPart.quantity_on_hand && (
                <p className="mt-1 text-xs text-amber-400">
                  This will take stock below zero ({selectedPart.quantity_on_hand}{" "}
                  {selectedPart.unit} currently on hand) — still allowed, just flagging it.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500 disabled:opacity-50"
              >
                {submitting ? "Logging…" : "Log Usage"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-surface-2"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
