import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getProfile, requireSuperAdmin } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { UserAccessList, type UserAccessRow } from "./user-access-list";

// User Access (schema_step44.sql) — Super Admin-only, lets you pick which
// sidebar modules any individual staff or client account sees, on top of
// their role's default access. Super Admin accounts are excluded from the
// list entirely: there's normally only one, and letting a Super Admin
// hide modules from themselves (or another Super Admin) risks locking
// someone out of the very page that would let them undo it.
export default async function UserAccessPage() {
  await requireSuperAdmin();
  const profile = await getProfile();

  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, organization_id, hidden_modules, organizations(name)")
    .neq("role", "super_admin")
    .order("role", { ascending: true });

  // Email lives in auth.users, not profiles — service-role listUsers() is
  // the bulk-lookup equivalent of what lib/notify.ts already does per-user
  // with auth.admin.getUserById() for ticket status emails.
  const serviceRole = createServiceRoleClient();
  const { data: authUsers } = await serviceRole.auth.admin.listUsers();
  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? null]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: UserAccessRow[] = (profiles ?? []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    email: emailById.get(p.id) ?? null,
    role: p.role,
    organization_name: p.organizations?.name ?? null,
    hidden_modules: p.hidden_modules ?? [],
  }));

  return (
    <AppShell
      profile={profile}
      title="User Access"
      subtitle="Choose which sidebar modules each staff or client account can see."
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error.message}
        </p>
      )}
      <UserAccessList rows={rows} />
    </AppShell>
  );
}
