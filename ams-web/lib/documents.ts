// Shared helpers for the per-asset document library (schema_step35.sql).
// No supabase import — safe to use from any client or server component.

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25MB — manuals/datasheets can run larger than a typical chat photo.

// What the upload form and action accept: Server Actions are capped at 4mb
// in next.config.mjs and Vercel caps a request body at 4.5 MB, so 25 MB can
// never work in production.
export const MAX_UPLOAD_BYTES = 4_000_000;

export const DOCUMENT_CATEGORIES = [
  { value: "manual", label: "Manual" },
  { value: "datasheet", label: "Datasheet" },
  { value: "compliance", label: "Compliance Paperwork" },
  { value: "other", label: "Other" },
] as const;

// Internal equipment (schema_step50.sql): what an office item needs on file.
export const INTERNAL_DOCUMENT_CATEGORIES = [
  { value: "photo", label: "Photo" },
  { value: "receipt", label: "Receipt / Invoice" },
  { value: "warranty", label: "Warranty" },
  { value: "manual", label: "Manual" },
  { value: "other", label: "Other" },
] as const;

export function categoryLabel(category: string): string {
  return (
    [...DOCUMENT_CATEGORIES, ...INTERNAL_DOCUMENT_CATEGORIES].find((c) => c.value === category)?.label ?? "Other"
  );
}

/** Image types the browser can show inline. SVG is left out on purpose: it can carry script. */
export const INLINE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function isInlineImage(mimeType: string | null | undefined): boolean {
  return !!mimeType && INLINE_IMAGE_TYPES.includes(mimeType.toLowerCase());
}

function randomId(): string {
  // Same secure-context caveat as lib/attachments.ts's randomId(): crypto
  // .randomUUID() is only available over HTTPS/localhost.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Storage object path convention: {assetId}/{random id}{.ext} — the asset id
// as the first path segment is what schema_step35.sql's storage RLS
// policies key off of via storage.foldername(name), same convention as
// chat-attachments' {ticketId}/... (lib/attachments.ts). The path never
// contains any part of the uploaded file's name except a short, lowercase,
// alphanumeric extension: names like "page.com%2F (1).png" (percent signs,
// spaces, brackets, non-ASCII) are exactly what makes object keys
// unreliable. The original name is kept for display in asset_documents.
export function makeDocumentPath(assetId: string, fileName: string): string {
  const ext = /\.([a-zA-Z0-9]{1,8})$/.exec(fileName.trim())?.[1]?.toLowerCase();
  return `${assetId}/${randomId()}${ext ? `.${ext}` : ""}`;
}

/** The name to show and store: control characters and path separators out, length capped. */
export function displayFileName(fileName: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = fileName.replace(/[\u0000-\u001f\u007f/\\]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(-150);
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
