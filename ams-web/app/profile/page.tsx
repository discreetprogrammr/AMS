import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { isSuperAdminRole, isStaffRole } from "@/lib/supabase/roles";
import { AppShell } from "@/components/app-shell";
import { updateDisplayName, updatePassword } from "./actions";

// My Profile — self-service display name + password change, reachable from
// the sidebar's bottom user card (sidebar.tsx). Everything else about the
// account (email, role, org) is read-only here: email/password live in
// Supabase Auth (not editable via this form's own action, password has its
// own form below), and role/organization_id are staff-managed elsewhere —
// schema_step37.sql's column-level GRANT means an UPDATE touching those two
// columns is rejected outright regardless of what a form or a raw client
// call sends.
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { error?: string; updated?: string };
}) {
  const profile = await getProfile();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roleLabel = isSuperAdminRole(profile?.role)
    ? "Super Admin"
    : isStaffRole(profile?.role)
      ? "Admin"
      : "Client";

  return (
    <AppShell
      profile={profile}
      title="My Profile"
      subtitle="Update your display name and password."
    >
      <div className="mx-auto max-w-xl space-y-6">
        {searchParams?.error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        {searchParams?.updated === "name" && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            Display name updated.
          </p>
        )}
        {searchParams?.updated === "password" && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            Password updated.
          </p>
        )}

        <div className="rounded-xl border border-hairline bg-surface p-6">
          <h2 className="text-sm font-semibold text-ink">Account</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Email
              </p>
              <p className="truncate text-ink-soft">{user?.email ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Role
              </p>
              <p className="text-ink-soft">{roleLabel}</p>
            </div>
          </div>
        </div>

        <form
          action={updateDisplayName}
          className="space-y-4 rounded-xl border border-hairline bg-surface p-6"
        >
          <h2 className="text-sm font-semibold text-ink">Display Name</h2>
          <div>
            <label className="block text-sm font-medium text-ink-soft">
              Full Name
            </label>
            <input
              type="text"
              name="full_name"
              required
              defaultValue={profile?.full_name ?? ""}
              placeholder="Your name"
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              Shown in the sidebar, and on tickets/reports you raise or work on.
            </p>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
          >
            Save Name
          </button>
        </form>

        <form
          action={updatePassword}
          className="space-y-4 rounded-xl border border-hairline bg-surface p-6"
        >
          <h2 className="text-sm font-semibold text-ink">Change Password</h2>
          <div>
            <label className="block text-sm font-medium text-ink-soft">
              New Password
            </label>
            <input
              type="password"
              name="new_password"
              required
              minLength={6}
              placeholder="At least 6 characters"
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-soft">
              Confirm New Password
            </label>
            <input
              type="password"
              name="confirm_password"
              required
              minLength={6}
              placeholder="Re-enter new password"
              className="mt-1 w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-ink hover:bg-blue-500"
          >
            Update Password
          </button>
        </form>
      </div>
    </AppShell>
  );
}
