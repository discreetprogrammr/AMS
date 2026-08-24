// Shared helpers for profile pictures (schema_step38.sql). No supabase
// import — safe to use from any client or server component, same as
// lib/documents.ts.

// Profile pictures render at a small fixed size everywhere (a 9x9 circle in
// the sidebar, a bit larger on My Profile) — 5MB is generous headroom for a
// photo without letting someone park a huge file behind an avatar. No
// client- or server-side resizing/compression is done; the browser just
// crops it to a circle via CSS, deliberately kept simple for this feature's
// scope.
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function randomId(): string {
  // Same secure-context caveat as lib/documents.ts's randomId(): crypto
  // .randomUUID() is only available over HTTPS/localhost.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Storage object path convention: {userId}/{random}-{safe filename} — the
// user id as the first path segment is what schema_step38.sql's storage RLS
// policies key off of via storage.foldername(name), same convention as
// asset-documents' {assetId}/... (lib/documents.ts).
export function makeAvatarPath(userId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  return `${userId}/${randomId()}-${safeName}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
