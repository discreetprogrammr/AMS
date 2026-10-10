import { deleteDocument } from "./documents-actions";
import { UploadDocumentButton } from "./upload-document-button";
import { ConfirmButton } from "../stocktake/confirm-button";
import { categoryLabel, formatFileSize, isInlineImage } from "@/lib/documents";

type Doc = {
  id: string;
  category: string;
  title: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
};

// Photos and documents of one internal item: a thumbnail grid for photos,
// a list for everything else (receipt, warranty card, manual). Staff only;
// internal equipment only. Files stay in the private asset-documents bucket
// and are served through /api/documents/<id>/download (?inline=1 for the
// thumbnails), which checks the signed-in user on every request.
export function InternalDocumentsCard({
  assetId,
  documents,
  canEdit,
}: {
  assetId: string;
  documents: Doc[];
  canEdit: boolean;
}) {
  const photos = documents.filter((d) => isInlineImage(d.mime_type));
  const others = documents.filter((d) => !isInlineImage(d.mime_type));

  const remove = (d: Doc) =>
    canEdit ? (
      <form action={deleteDocument.bind(null, assetId, d.id)}>
        <ConfirmButton
          message={`Delete "${d.title}"? This can't be undone.`}
          className="whitespace-nowrap text-xs text-slate-500 underline hover:text-red-400"
        >
          Delete
        </ConfirmButton>
      </form>
    ) : null;

  return (
    <div className="mt-6 rounded-xl border border-hairline bg-surface p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Photos &amp; Documents</h2>
        {canEdit && <UploadDocumentButton assetId={assetId} internal />}
      </div>

      {documents.length === 0 && (
        <p className="text-sm text-slate-500">
          Nothing on file yet. Add a photo of the item and its receipt or warranty card.
        </p>
      )}

      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((d) => (
            <li key={d.id} className="overflow-hidden rounded-lg border border-hairline bg-surface-2">
              <a href={`/api/documents/${d.id}/download`} title="Download">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/documents/${d.id}/download?inline=1`}
                  alt={d.title}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </a>
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <p className="min-w-0 truncate text-xs text-ink-soft">{d.title}</p>
                {remove(d)}
              </div>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <ul className={`divide-y divide-hairline text-sm ${photos.length > 0 ? "mt-4" : ""}`}>
          {others.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <a href={`/api/documents/${d.id}/download`} className="font-medium text-ink hover:underline">
                  {d.title}
                </a>
                <p className="text-xs text-slate-500">
                  {categoryLabel(d.category)}
                  {d.file_size ? ` · ${formatFileSize(d.file_size)}` : ""}
                </p>
              </div>
              {remove(d)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
