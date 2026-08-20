"use client";

import { useState } from "react";
import { ReceiveStockModal } from "./receive-stock-modal";

// Small client wrapper so the Server Component detail page (app/parts/[id]/
// page.tsx) can still offer the same "Receive Stock" action the parts list
// has, without the whole page needing to become a client component just to
// hold the modal's open/closed state.
export function ReceiveStockButton({
  partId,
  partName,
  currentQuantity,
  unit,
}: {
  partId: string;
  partName: string;
  currentQuantity: number;
  unit: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
      >
        Receive Stock
      </button>
      {open && (
        <ReceiveStockModal
          partId={partId}
          partName={partName}
          currentQuantity={currentQuantity}
          unit={unit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
