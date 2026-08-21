"use client";

import { useState } from "react";
import { UploadDocumentModal } from "./upload-document-modal";

// Small client wrapper so the Server Component detail page (page.tsx) can
// offer this action without the whole page needing to become a client
// component just to hold the modal's open/closed state — same reasoning as
// app/parts/receive-stock-button.tsx.
export function UploadDocumentButton({ assetId }: { assetId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/20"
      >
        Upload Document
      </button>
      {open && (
        <UploadDocumentModal assetId={assetId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
