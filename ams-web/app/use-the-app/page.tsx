import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/profile";
import { isFieldEngineerRole } from "@/lib/supabase/roles";
import { logout } from "../login/actions";

// Where a field engineer lands on the web app (components/app-shell.tsx sends
// them here from every page). They work from the HorizonCare360 Assist mobile
// app; a limited web view for them comes later. Anyone else who opens this
// address is sent to the dashboard, so it is never a dead end.
export default async function UseTheAppPage() {
  const profile = await getProfile();
  if (!profile || !isFieldEngineerRole(profile.role)) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Please use the HorizonCare360 Assist app</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your account is set up for the mobile app: tickets, calls and your assigned jobs are all there. The web app
          is for the office team.
        </p>
        <form action={logout} className="mt-5">
          <button
            type="submit"
            className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
