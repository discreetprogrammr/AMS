"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { addInternalCustodian } from "@/app/assets/custodian-actions";

// "+ Add custodian" on the Custodians tab: name only, saved through the same
// action as the asset form's dialog, then straight to the person's page to
// fill in their details.
export function AddCustodianButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await addInternalCustodian(name);
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    setName("");
    router.push(`/custodians/view?name=${encodeURIComponent(result.name)}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
      >
        + Add custodian
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/70 p-4" role="dialog" aria-modal="true" aria-label="Add custodian">
          <div className="w-full max-w-sm rounded-xl border border-hairline-strong bg-surface p-5 shadow-xl">
            <h3 className="mb-3 text-sm font-semibold text-ink">Add custodian</h3>
            <input
              autoFocus
              value={name}
              maxLength={100}
              placeholder="Full name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) void save();
              }}
              className="h-10 w-full rounded-lg border border-hairline bg-surface-2 px-3 text-sm text-ink focus:border-blue-500 focus:outline-none"
            />
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
