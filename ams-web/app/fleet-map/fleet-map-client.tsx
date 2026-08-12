"use client";

import dynamic from "next/dynamic";
import type { FleetSite } from "./fleet-map-view";

// Leaflet touches `window`/`document` as soon as its module loads, which
// crashes during Next.js's server-side render pass. `ssr: false` skips that
// entirely and renders this only in the browser — but `next/dynamic` with
// `ssr: false` is only allowed from a Client Component, not the Server
// Component that fetches the sites (fleet-map/page.tsx), hence this tiny
// wrapper file existing at all.
const FleetMapView = dynamic(
  () => import("./fleet-map-view").then((m) => m.FleetMapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-14rem)] min-h-[520px] items-center justify-center rounded-xl border border-hairline bg-surface text-sm text-slate-500">
        Loading map…
      </div>
    ),
  },
);

export function FleetMapClient({ sites }: { sites: FleetSite[] }) {
  return <FleetMapView sites={sites} />;
}
