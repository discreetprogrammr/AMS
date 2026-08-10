import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { CorrectiveChecklistForm } from "./corrective-form";

export default async function CorrectiveChecklistPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff("/reports");
  const profile = await getProfile();

  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("assets")
    .select("id, asset_tag, serial_number, sites(address), organizations(name)")
    .order("asset_tag");

  return (
    <AppShell
      profile={profile}
      title="Corrective Maintenance Report"
      subtitle="Fault response / repair record — creates a service record on submit."
    >
      <div>
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        <CorrectiveChecklistForm assets={assets ?? []} />
      </div>
    </AppShell>
  );
}
