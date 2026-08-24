import { redirect } from "next/navigation";
import { createClient } from "./server";
import { isStaffRole, isSuperAdminRole, type Role } from "./roles";

export type Profile = {
  id: string;
  full_name: string | null;
  role: Role;
  organization_id: string | null;
  avatar_url: string | null;
};

// Re-exported so existing server-side imports (`from "@/lib/supabase/profile"`)
// keep working unchanged. Client components should import these two directly
// from "./roles" instead — see the comment in roles.ts for why.
export { isStaffRole, isSuperAdminRole };

// Fetches the signed-in user's profile row, which carries their role and
// (for client viewers) the organization they're scoped to. Pages use this
// to decide what to render — actual data access is still enforced by RLS
// regardless of what the UI shows, so this is a UX layer, not the security
// boundary.
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, organization_id, avatar_url")
    .eq("id", user.id)
    .single();

  return (profile as Profile) ?? null;
}

// Defense-in-depth check for pages AND server actions. RLS in the database
// is the real security boundary (it blocks the write either way), but
// without this, a non-staff user hitting a staff-only action directly would
// either get a confusing raw Postgres error or, worse, an UPDATE that
// silently matches zero rows with no error at all. This gives a clean
// redirect instead, before the query even runs.
export async function requireStaff(redirectTo = "/assets"): Promise<Profile> {
  const profile = await getProfile();
  if (!isStaffRole(profile?.role)) {
    redirect(redirectTo);
  }
  return profile as Profile;
}

// Same idea as requireStaff(), but for the Audit Log page specifically —
// Admins see every other tab, but Audit Log is Super Admin-only.
export async function requireSuperAdmin(redirectTo = "/dashboard"): Promise<Profile> {
  const profile = await getProfile();
  if (!isSuperAdminRole(profile?.role)) {
    redirect(redirectTo);
  }
  return profile as Profile;
}
