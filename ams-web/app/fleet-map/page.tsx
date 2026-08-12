import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { backfillMissingSiteLocations } from "@/lib/site-location";
import { FleetMapClient } from "./fleet-map-client";
import type { FleetSite } from "./fleet-map-view";

export default async function FleetMapPage() {
  const supabase = await createClient();
  const profile = await getProfile();

  // No requireStaff() gate — Fleet Map is client-visible in the reference
  // (not in its clientHidden nav list, same check done before Calendar and
  // Reports). RLS on sites/assets already scopes a client_viewer to their
  // own org's data.

  // Self-healing: any site that predates automatic geocoding (or slipped
  // through it) gets resolved right here before the map renders, so
  // there's never a standing "N sites missing coordinates" notice to act
  // on — it just quietly catches up. Staff-only (RLS would block a
  // client_viewer's UPDATE anyway; this just skips the wasted attempt).
  if (isStaffRole(profile?.role)) {
    await backfillMissingSiteLocations(supabase);
  }

  const [{ data: sites }, { data: assets }] = await Promise.all([
    supabase
      .from("sites")
      .select("id, address, latitude, longitude, organization_id, organizations(name)"),
    supabase.from("assets").select("id, site_id, status"),
  ]);

  const allSites = sites ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sitesWithCoords = allSites.filter(
    (s: any) => s.latitude != null && s.longitude != null,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fleetSites: FleetSite[] = sitesWithCoords.map((s: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mine = (assets ?? []).filter((a: any) => a.site_id === s.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unserviceable = mine.filter(
      (a: any) => a.status === "unserviceable",
    ).length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const down = mine.filter((a: any) => a.status === "down").length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attention = mine.filter((a: any) => a.status === "attention").length;
    const total = mine.length;
    const operational = total - unserviceable - down - attention;

    // A site's pin takes on the worst status of any asset assigned to it —
    // same 4-value scale as an individual asset's status, so the map and
    // the Assets page always speak the same language. Sites with zero
    // assets registered stay a separate "no_data" case (nothing to roll
    // up), shown on the map but called out separately in the legend.
    let status: FleetSite["status"];
    if (total === 0) status = "no_data";
    else if (unserviceable > 0) status = "unserviceable";
    else if (down > 0) status = "down";
    else if (attention > 0) status = "attention";
    else status = "operational";

    return {
      id: s.id,
      address: s.address,
      organizationId: s.organization_id,
      organizationName: s.organizations?.name ?? null,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      status,
      total,
      operational,
      attention,
      down,
      unserviceable,
      // Used by "View Client" (fleet-map-view.tsx) to jump straight into
      // that asset's detail popup on the Assets page instead of the org
      // page — just the first asset at the site when there's more than
      // one; there's no single "primary" one to prefer.
      primaryAssetId: mine[0]?.id ?? null,
    };
  });

  return (
    <AppShell
      profile={profile}
      title="Live Fleet Map"
      subtitle="Geo-spatial readiness across every client site."
    >
      <FleetMapClient sites={fleetSites} />
    </AppShell>
  );
}
