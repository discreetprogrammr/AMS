"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "./documents-actions";
import { DOCUMENT_CATEGORIES, INTERNAL_DOCUMENT_CATEGORIES, MAX_UPLOAD_BYTES } from "@/lib/documents";

// Phone photos are several MB each. Internal equipment photos are shrunk in
// the browser before upload (longest side 1600px, JPEG) unless they are
// already small. Anything that is not a JPEG / PNG / WebP, or any failure,
// uploads the original untouched.
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// Opened from a "Upload Document" button on the asset detail page's
// Documents card — mirrors app/parts/receive-stock-modal.tsx's shape
// (client-invoked throw-on-error action, router.refresh() + close on
// success), the established pattern for a small modal action on this page.
export function UploadDocumentModal({
  assetId,
  internal = false,
  onClose,
}: {
  assetId: string;
  // Internal equipment: its own categories and wording (photo, receipt,
  // warranty), and photos are shrunk before upload.
  internal?: boolean;
  onClose: () => void;
}) {
  const categories = internal ? INTERNAL_DOCUMENT_CATEGORIES : DOCUMENT_CATEGORIES;
  const router = useRouter();
  const [category, setCategory] = useState<string>(internal ? "photo" : "manual");
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
      const toSend = internal ? await shrinkImage(file) : file;
      // The server accepts 4 MB (next.config.mjs, Vercel's request cap).
      if (toSend.size > MAX_UPLOAD_BYTES) {
        setError("That file is over 4 MB. Photos are shrunk automatically; compress a large PDF first.");
        return;
      }
      const formData = new FormData();
      formData.set("file", toSend);
      formData.set("category", category);
      // Internal equipment has no Title field: the server uses the file name.
      if (!internal) formData.set("title", title.trim());
      const result = await uploadDocument(assetId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    } catch (err) {
      // Reached only if the request itself failed (offline, body over the
      // framework limit); the action reports its own failures as a result.
      console.error("[UploadDocumentModal] upload threw:", err);
      setError("The upload could not be completed. Check your connection and that the file is under 4 MB, then try again.");
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
        <h2 className="mb-1 text-base font-semibold text-ink">
          {internal ? "Add Photo / Document" : "Upload Document"}
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          {internal
            ? "A photo of the item, the purchase receipt or invoice, the warranty card, or a manual. Only staff can see these."
            : "Manuals, datasheets, or compliance paperwork for this asset — visible to the client for self-service."}
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
            <p className="mt-1 text-[11px] text-slate-500">Max 4MB{internal ? "; photos are shrunk automatically" : ""}.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink focus:border-blue-500 focus:outline-none"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {!internal && (
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
          )}

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
