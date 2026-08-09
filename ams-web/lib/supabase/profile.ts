import { createClient } from "./server";

export type Profile = {
  id: string;
  full_name: string | null;
  role: "internal_staff" | "client_viewer";
  organization_id: string | null;
};

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
    .select("id, full_name, role, organization_id")
    .eq("id", user.id)
    .single();

  return (profile as Profile) ?? null;
}
