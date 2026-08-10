// Real published coordinates for the major Philippine airports, seaports,
// and freeport zones where PHTek deployments actually cluster — the same
// facilities the reference app's fleet map used (SITE_DEFS in
// src/routes/fleet-map.tsx), just repurposed here as a keyword matcher
// instead of a fixed list of pins. This is public-domain geography (real
// GPS coordinates of real infrastructure), not fictional demo data, so
// reusing it is the same call already made for lib/philippines-geo.ts.
//
// Order matters: more specific entries (e.g. "micp") must come before
// broader catch-alls (e.g. generic "manila") so a specific facility name
// wins over a same-city generic match.
export type KnownLocation = {
  label: string;
  keywords: string[];
  latitude: number;
  longitude: number;
};

export const PH_KNOWN_LOCATIONS: KnownLocation[] = [
  {
    label: "NAIA (Ninoy Aquino International Airport)",
    keywords: ["naia", "ninoy aquino"],
    latitude: 14.5086,
    longitude: 121.0068,
  },
  {
    label: "Manila International Container Port (MICP)",
    keywords: ["micp", "manila international container port"],
    latitude: 14.6063,
    longitude: 120.949,
  },
  {
    label: "Port of Manila",
    keywords: ["port of manila"],
    latitude: 14.5939,
    longitude: 120.9631,
  },
  {
    label: "Subic Bay Freeport",
    keywords: ["subic"],
    latitude: 14.8222,
    longitude: 120.2792,
  },
  {
    label: "Clark International Airport",
    keywords: ["clark"],
    latitude: 15.1858,
    longitude: 120.5599,
  },
  {
    label: "Baguio",
    keywords: ["baguio"],
    latitude: 16.4023,
    longitude: 120.596,
  },
  {
    label: "Laoag International Airport",
    keywords: ["laoag"],
    latitude: 18.1778,
    longitude: 120.5317,
  },
  {
    label: "Cagayan North International Airport",
    keywords: ["cagayan north", "cnia"],
    latitude: 18.1834,
    longitude: 121.7371,
  },
  {
    label: "Bicol International Airport",
    keywords: ["bicol"],
    latitude: 13.1517,
    longitude: 123.6844,
  },
  {
    label: "Puerto Princesa International Airport",
    keywords: ["puerto princesa"],
    latitude: 9.7386,
    longitude: 118.7516,
  },
  {
    label: "Mactan-Cebu International Airport / Port of Cebu",
    keywords: ["mactan", "cebu"],
    latitude: 10.3157,
    longitude: 123.9777,
  },
  {
    label: "Boracay (Caticlan) Airport",
    keywords: ["boracay", "caticlan"],
    latitude: 11.9243,
    longitude: 121.9515,
  },
  {
    label: "Kalibo International Airport",
    keywords: ["kalibo"],
    latitude: 11.6796,
    longitude: 122.378,
  },
  {
    label: "Iloilo International Airport",
    keywords: ["iloilo"],
    latitude: 10.8329,
    longitude: 122.4933,
  },
  {
    label: "Bohol-Panglao International Airport",
    keywords: ["panglao", "bohol"],
    latitude: 9.5668,
    longitude: 123.7656,
  },
  {
    label: "Port of Davao",
    keywords: ["davao"],
    latitude: 7.1264,
    longitude: 125.6601,
  },
  {
    label: "Zamboanga",
    keywords: ["zamboanga"],
    latitude: 6.9214,
    longitude: 122.0621,
  },
  // Broad catch-all for anything else clearly in Metro Manila that didn't
  // match a specific facility above.
  {
    label: "Metro Manila",
    keywords: [
      "manila",
      "makati",
      "quezon city",
      "pasay",
      "taguig",
      "mandaluyong",
      "pasig",
      "paranaque",
      "parañaque",
    ],
    latitude: 14.5995,
    longitude: 120.9842,
  },
];

export function matchKnownLocation(
  address: string,
): { latitude: number; longitude: number } | null {
  const lower = address.toLowerCase();
  for (const loc of PH_KNOWN_LOCATIONS) {
    if (loc.keywords.some((k) => lower.includes(k))) {
      return { latitude: loc.latitude, longitude: loc.longitude };
    }
  }
  return null;
}
