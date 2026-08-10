import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { PreventiveChecklistForm } from "./preventive-form";

export default async function PreventiveChecklistPage({
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
      title="Preventive Maintenance Checklist"
      subtitle="Standard PM report — creates a service record on submit."
    >
      <div>
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        <PreventiveChecklistForm assets={assets ?? []} />
      </div>
    </AppShell>
  );
}
