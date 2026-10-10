"use client";

import { deleteAsset } from "./actions";

// Delete button for the edit page, the same server action and wording as
// the row menu on /assets (asset-row-actions.tsx). The confirm names the
// asset tag; `guarded` (HR & Admin preset) means the server refuses a delete
// that would take linked records with it, so the dialog does not promise a
// cascade.
export function DeleteAssetButton({
  assetId,
  assetTag,
  guarded = false,
}: {
  assetId: string;
  assetTag: string;
  guarded?: boolean;
}) {
  return (
    <form
      action={deleteAsset.bind(null, assetId)}
      onSubmit={(e) => {
        const ok = window.confirm(
          guarded
            ? `Delete asset ${assetTag}? This can't be undone.`
            : `Delete asset ${assetTag}? This also removes its service records, tickets, and other linked history. This can't be undone.`,
        );
        if (!ok) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10"
      >
        Delete {assetTag}
      </button>
    </form>
  );
}
