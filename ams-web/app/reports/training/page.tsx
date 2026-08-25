import { createClient } from "@/lib/supabase/server";
import { getProfile, requireStaff } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { TrainingForm } from "./training-form";

export default async function TrainingReportPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaff("/reports");
  const profile = await getProfile();

  const supabase = await createClient();

  const [{ data: sites }, { data: assets }] = await Promise.all([
    supabase.from("sites").select("id, address, organizations(name)").order("address"),
    supabase
      .from("assets")
      .select("id, asset_tag, serial_number, site_id, sites(address), organizations(name)")
      .order("asset_tag"),
  ]);

  return (
    <AppShell
      profile={profile}
      title="Training Report"
      subtitle="Client staff training / orientation — creates a service record on submit."
    >
      <div>
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        <TrainingForm sites={sites ?? []} assets={assets ?? []} />
      </div>
    </AppShell>
  );
}
