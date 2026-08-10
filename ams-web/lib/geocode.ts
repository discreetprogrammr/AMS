// Free-text address → lat/lng, scoped to the Philippines, via OpenStreetMap's
// Nominatim search API (no API key required). This is a fallback for
// addresses that don't match a known facility in ph-locations.ts — most
// exact deployment sites (airports, seaports, freeports) resolve locally
// without ever hitting the network; this only runs for the long tail (a
// specific building, a less common city, etc).
//
// Nominatim's usage policy requires a real identifying User-Agent and caps
// usage at ~1 request/sec for the public instance — fine for how rarely new
// sites get created here. Never throws: any failure (timeout, no results,
// network unreachable) just returns null, and the caller falls back to
// leaving the site's coordinates blank (same as before this feature
// existed — staff can still set them manually from the Clients page).
export async function geocodeAddressPH(
  address: string,
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const url =
      "https://nominatim.openstreetmap.org/search" +
      `?format=jsonv2&limit=1&countrycodes=ph&q=${encodeURIComponent(address)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "HorizonCare360-AssetManagement/1.0 (Pacific Horizon Tek internal tool)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return null;

    const results = (await res.json()) as Array<{ lat: string; lon: string }>;
    const first = results?.[0];
    if (!first) return null;

    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
  } catch {
    return null;
  }
}
