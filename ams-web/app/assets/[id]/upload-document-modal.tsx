"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "./documents-actions";
import { DOCUMENT_CATEGORIES } from "@/lib/documents";

// Opened from a "Upload Document" button on the asset detail page's
// Documents card — mirrors app/parts/receive-stock-modal.tsx's shape
// (client-invoked throw-on-error action, router.refresh() + close on
// success), the established pattern for a small modal action on this page.
export function UploadDocumentModal({
  assetId,
  onClose,
}: {
  assetId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<string>("manual");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please choose a file.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await uploadDocument(assetId, category, title.trim(), file);
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
        <h2 className="mb-1 text-base font-semibold text-ink">Upload Document</h2>
        <p className="mb-4 text-xs text-slate-500">
          Manuals, datasheets, or compliance paperwork for this asset — visible to
          the client for self-service.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-ink-soft">File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-surface"
            />
            <p className="mt-1 text-[11px] text-slate-500">Max 25MB.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
            >
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft">
              Title <span className="text-slate-500">(optional — defaults to file name)</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. PNRI License Certificate"
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500 disabled:opacity-50"
            >
              {submitting ? "Uploading…" : "Upload"}
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
