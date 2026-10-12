import { createClient } from "@/lib/supabase/server";
import { excludeInternal, getInternalOrgIds } from "@/lib/internal-org";
import { getProfile, requireStaffOrViewer } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { RadiationSurveyForm } from "./radiation-survey-form";

export default async function RadiationSurveyReportPage({
  searchParams,
}: {
  searchParams: { error?: string; asset_id?: string };
}) {
  await requireStaffOrViewer("/reports");
  const profile = await getProfile();

  const supabase = await createClient();
  // Internal equipment (organizations.is_internal) is never offered here — see lib/internal-org.ts.
  const internalOrgIds = await getInternalOrgIds(supabase);

  const { data: assets } = await excludeInternal(
    supabase
      .from("assets")
      .select("id, asset_tag, serial_number, sites(address), organizations(name)")
      .order("asset_tag"),
    internalOrgIds,
  );

  return (
    <AppShell
      profile={profile}
      title="Radiation Survey Test Report"
      subtitle="PNRI compliance survey — accompanies every PM visit on X-ray/radiation-emitting equipment."
    >
      <div>
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        <RadiationSurveyForm assets={assets ?? []} prefilledAssetId={searchParams?.asset_id ?? null} />
      </div>
    </AppShell>
  );
}
