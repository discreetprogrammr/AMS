import { createClient } from "@/lib/supabase/server";
import { excludeInternal, getInternalOrgIds } from "@/lib/internal-org";
import { getProfile, requireStaffOrViewer } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { SiteSurveyForm } from "./site-survey-form";

export default async function SiteSurveyReportPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireStaffOrViewer("/reports");
  const profile = await getProfile();

  const supabase = await createClient();
  // Internal equipment (organizations.is_internal) is never offered here — see lib/internal-org.ts.
  const internalOrgIds = await getInternalOrgIds(supabase);

  const [{ data: sites }, { data: assets }] = await Promise.all([
    excludeInternal(
      supabase.from("sites").select("id, address, organizations(name)").order("address"),
      internalOrgIds,
    ),
    excludeInternal(
      supabase
        .from("assets")
        .select("id, asset_tag, serial_number, site_id, sites(address), organizations(name)")
        .order("asset_tag"),
      internalOrgIds,
    ),
  ]);

  return (
    <AppShell
      profile={profile}
      title="Site Survey Report"
      subtitle="Pre-installation site assessment — can be filed before any equipment exists at the site."
    >
      <div>
        {searchParams?.error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}
        <SiteSurveyForm sites={sites ?? []} assets={assets ?? []} />
      </div>
    </AppShell>
  );
}
