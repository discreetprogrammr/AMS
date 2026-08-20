"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { receiveStock } from "./actions";

// Opened from a "Receive Stock" button on a part's row (parts-table.tsx) —
// the "In" side of stock tracking, mirroring how log-parts-modal.tsx
// (app/work-orders) handles the "Out" side. Submitting inserts into
// part_receipts, which increments the part's stock via a database trigger
// (schema_step32.sql) — this modal doesn't touch stock directly, just logs
// the delivery.
export function ReceiveStockModal({
  partId,
  partName,
  currentQuantity,
  unit,
  onClose,
}: {
  partId: string;
  partName: string;
  currentQuantity: number;
  unit: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [supplier, setSupplier] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await receiveStock(
        partId,
        quantity,
        supplier.trim(),
        referenceNumber.trim(),
        unitCost.trim() ? Number(unitCost) : null,
        notes.trim(),
      );
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
        <h2 className="mb-1 text-base font-semibold text-ink">Receive Stock</h2>
        <p className="mb-4 text-xs text-slate-500">
          {partName} — {currentQuantity} {unit} currently on hand
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-ink-soft">Quantity Received</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink-soft">
                Supplier <span className="text-slate-500">(optional)</span>
              </label>
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="e.g. Rapiscan Philippines"
                className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft">
                PO / Ref # <span className="text-slate-500">(optional)</span>
              </label>
              <input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. PO-2026-0143"
                className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft">
              Unit Cost this delivery (₱, optional)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="e.g. 1500.00"
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft">
              Notes <span className="text-slate-500">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-ink hover:bg-emerald-500 disabled:opacity-50"
            >
              {submitting ? "Logging…" : "Receive Stock"}
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
      </div>
    </div>
  );
}
