// Shared helpers for the per-asset document library (schema_step35.sql).
// No supabase import — safe to use from any client or server component.

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25MB — manuals/datasheets can run larger than a typical chat photo.

export const DOCUMENT_CATEGORIES = [
  { value: "manual", label: "Manual" },
  { value: "datasheet", label: "Datasheet" },
  { value: "compliance", label: "Compliance Paperwork" },
  { value: "other", label: "Other" },
] as const;

export function categoryLabel(category: string): string {
  return DOCUMENT_CATEGORIES.find((c) => c.value === category)?.label ?? "Other";
}

function randomId(): string {
  // Same secure-context caveat as lib/attachments.ts's randomId(): crypto
  // .randomUUID() is only available over HTTPS/localhost.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Storage object path convention: {assetId}/{random}-{safe filename} — the
// asset id as the first path segment is what schema_step35.sql's storage
// RLS policies key off of via storage.foldername(name), same convention as
// chat-attachments' {ticketId}/... (lib/attachments.ts).
export function makeDocumentPath(assetId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  return `${assetId}/${randomId()}-${safeName}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
