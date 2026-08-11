// Shared helpers for chat file/photo attachments (schema_step27.sql).
// No supabase import — safe to use from any client component.

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB

function randomId(): string {
  // Same secure-context caveat as use-call.ts's makeCallId(): crypto
  // .randomUUID() is only available over HTTPS/localhost, so this needs a
  // fallback for local-network mobile testing too.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Storage object path convention: {ticketId}/{random}-{safe filename} — the
// ticket id as the first path segment is what schema_step27.sql's storage
// RLS policies key off of via storage.foldername(name).
export function makeAttachmentPath(ticketId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  return `${ticketId}/${randomId()}-${safeName}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}
