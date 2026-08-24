import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { ImportAssetsForm } from "./import-assets-form";

// Bulk Asset Import — onboarding a new client's whole fleet used to mean
// adding assets one at a time through /assets/new. Staff-only, same
// reasoning as every other write path on Assets.
export default async function ImportAssetsPage() {
  await requireStaff();
  const profile = await getProfile();

  return (
    <AppShell
      profile={profile}
      title="Import Assets"
      subtitle="Bulk-add assets from a CSV file instead of one at a time."
    >
      <div className="mx-auto max-w-2xl">
        <ImportAssetsForm />
      </div>
    </AppShell>
  );
}
