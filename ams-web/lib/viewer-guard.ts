import { getProfile } from "@/lib/supabase/profile";
import { isViewerRole } from "@/lib/supabase/roles";

// The shared guards for the read-only "viewer" account (schema_step54.sql).
// The database refuses every viewer write regardless (restrictive RLS
// policies); these give a clear refusal earlier, and stop the downloads
// (exports, PDFs, document files), which are reads the viewer must not make.
// Everything is a no-op for any other role.

export const VIEW_ONLY_MESSAGE = "This is a view-only account. Nothing can be changed.";

/** For server actions that do not already gate on requireStaff() / requireSuperAdmin(): throws for a viewer. */
export async function assertNotViewer(): Promise<void> {
  const profile = await getProfile();
  if (isViewerRole(profile?.role)) throw new Error(VIEW_ONLY_MESSAGE);
}

/** For route handlers: a 403 Response for a viewer, otherwise null. */
export async function forbidViewer(): Promise<Response | null> {
  const profile = await getProfile();
  if (isViewerRole(profile?.role)) return new Response(VIEW_ONLY_MESSAGE, { status: 403 });
  return null;
}
