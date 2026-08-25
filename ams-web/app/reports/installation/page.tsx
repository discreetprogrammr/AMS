import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { InstallationForm } from "./installation-form";

export default async function InstallationReportPage({
  searchParams,
}: {
  searchParams: { error?: string; asset_id?: string };
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
      title="Installation Report"
      subtitle="New equipment commissioning — creates a service record on submit."
    >
      <div>
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        <InstallationForm assets={assets ?? []} prefilledAssetId={searchParams?.asset_id ?? null} />
      </div>
    </AppShell>
  );
}
