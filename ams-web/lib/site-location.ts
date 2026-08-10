import type { createClient } from "@/lib/supabase/server";
import { matchKnownLocation } from "./ph-locations";
import { geocodeAddressPH } from "./geocode";

// Single entry point for "give this new site a location automatically."
// Tries the known-facility keyword match first (instant, no network,
// covers the airports/seaports/freeports PHTek actually deploys to), then
// falls back to live geocoding for anything else. Returns nulls (not an
// error) if neither resolves anything — a site without coordinates behaves
// exactly as it always has: it just doesn't show up on Fleet Map until
// someone sets a location for it manually.
export async function resolveSiteCoordinates(
  address: string,
): Promise<{ latitude: number | null; longitude: number | null }> {
  const known = matchKnownLocation(address);
  if (known) return known;

  const geocoded = await geocodeAddressPH(address);
  if (geocoded) return geocoded;

  return { latitude: null, longitude: null };
}

// Catches up any site that predates automatic geocoding, or that slipped
// through it (e.g. Nominatim was briefly unreachable when it was created).
// Called from the Fleet Map page itself on every load — cheap in the
// common case (nothing to do once everything's resolved), and turns "some
// sites are missing coordinates" from a standing manual chore into
// something that quietly fixes itself the next time someone opens the map.
// Only ever called for staff (RLS would block a client_viewer's UPDATE
// anyway, but the caller skips this entirely for them).
export async function backfillMissingSiteLocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  const { data: candidates } = await supabase
    .from("sites")
    .select("id, address, latitude, longitude")
    .not("address", "is", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const missing = (candidates ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any) => s.address && (s.latitude == null || s.longitude == null),
  );

  if (missing.length === 0) return 0;

  let resolvedCount = 0;

  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    missing.map(async (site: any) => {
      const { latitude, longitude } = await resolveSiteCoordinates(
        site.address,
      );
      if (latitude === null || longitude === null) return;

      const { error } = await supabase
        .from("sites")
        .update({ latitude, longitude })
        .eq("id", site.id);

      if (!error) resolvedCount += 1;
    }),
  );

  return resolvedCount;
}
