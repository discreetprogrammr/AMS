"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { AssetDetailModal } from "@/app/assets/asset-detail-modal";

// Same 4-value scale as an asset's own status (assets.status, widened in
// schema_step15.sql) — a site's pin is just the worst status among the
// assets assigned to it. "no_data" is the one addition: a site with zero
// assets registered isn't any of those 4 states, so it stays its own
// case, styled distinctly and called out separately in the legend.
export type FleetSite = {
  id: string;
  address: string | null;
  organizationId: string | null;
  organizationName: string | null;
  latitude: number;
  longitude: number;
  status: "operational" | "attention" | "down" | "unserviceable" | "no_data";
  total: number;
  operational: number;
  attention: number;
  down: number;
  unserviceable: number;
  primaryAssetId: string | null;
};

const STATUS_STYLE: Record<
  FleetSite["status"],
  { dot: string; ring: string; pill: string; label: string }
> = {
  operational: {
    dot: "bg-emerald-500",
    ring: "bg-emerald-500/25",
    pill: "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/25",
    label: "Operational",
  },
  attention: {
    dot: "bg-amber-500",
    ring: "bg-amber-500/25",
    pill: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/25",
    label: "Attention",
  },
  down: {
    dot: "bg-orange-500",
    ring: "bg-orange-500/30",
    pill: "bg-orange-500/10 text-orange-300 ring-1 ring-inset ring-orange-500/25",
    label: "Down",
  },
  unserviceable: {
    dot: "bg-red-500",
    ring: "bg-red-500/30",
    pill: "bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/25",
    label: "Unserviceable",
  },
  no_data: {
    dot: "bg-slate-500",
    ring: "bg-slate-500/20",
    pill: "bg-slate-500/10 text-slate-300 ring-1 ring-inset ring-slate-500/20",
    label: "No Assets",
  },
};

// Philippines-wide default view, used before any per-site fitBounds runs
// (and as the "Reset view" target when there's more than one site spread
// far enough apart that re-fitting to a single site wouldn't make sense).
const PH_CENTER: [number, number] = [12.8, 121.8];
const PH_DEFAULT_ZOOM = 5.4;

// CartoDB's free "dark matter" basemap — built on OpenStreetMap data, same
// as plain OSM tiles, but dark-themed to match the rest of this app instead
// of the usual bright/colorful OSM style. No API key or account needed for
// this volume of traffic (a small internal/demo tool), unlike Mapbox or
// Google Maps. Swapping to Mapbox or Google later is a one-line change here
// if/when that becomes worth it.
const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function FleetMapView({ sites }: { sites: FleetSite[] }) {
  const mapRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<Record<string, L.Marker>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);

  // One L.DivIcon per status, built once — a plain colored dot with the
  // same pulse/ping ring the old hand-rolled SVG map used, just rendered as
  // real DOM (via a divIcon) instead of an SVG circle. Deliberately NOT
  // using Leaflet's default L.Icon/L.Marker icon: that default reaches for
  // marker-icon.png etc. from leaflet/dist/images, which is the classic
  // "broken marker image" issue under webpack/Next.js bundling. Passing an
  // explicit icon to every <Marker> sidesteps that entirely.
  const icons = useMemo(() => {
    const entries = (Object.keys(STATUS_STYLE) as FleetSite["status"][]).map((status) => {
      const st = STATUS_STYLE[status];
      const pulseClass =
        status === "down" || status === "unserviceable" ? "animate-ping" : "animate-pulse";
      const html = `
        <span class="relative flex h-7 w-7 items-center justify-center">
          <span class="absolute h-5 w-5 rounded-full ${st.ring} ${pulseClass}"></span>
          <span class="relative h-2.5 w-2.5 rounded-full ${st.dot} ring-2 ring-[#060b17]/80"></span>
        </span>`;
      const icon = L.divIcon({
        html,
        className: "",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14],
      });
      return [status, icon] as const;
    });
    return Object.fromEntries(entries) as Record<FleetSite["status"], L.DivIcon>;
  }, []);

  const sitesWithCoords = useMemo(
    () => sites.filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)),
    [sites],
  );

  // Auto-fit to wherever the actual sites are, once, on first load — an
  // improvement over the old fixed "fit the whole archipelago" behavior,
  // since it zooms straight to the data instead of a lot of empty ocean if
  // every site happens to be clustered in, say, Metro Manila.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || sitesWithCoords.length === 0) return;
    if (sitesWithCoords.length === 1) {
      const s = sitesWithCoords[0];
      map.setView([s.latitude, s.longitude], 12);
      return;
    }
    const bounds = L.latLngBounds(sitesWithCoords.map((s) => [s.latitude, s.longitude]));
    map.fitBounds(bounds, { padding: [48, 48] });
    // Only on mount — afterwards the user is in control of pan/zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function focusSite(site: FleetSite) {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([site.latitude, site.longitude], Math.max(map.getZoom(), 10), { duration: 0.6 });
    markerRefs.current[site.id]?.openPopup();
    setSelectedId(site.id);
  }

  function resetView() {
    const map = mapRef.current;
    if (!map) return;
    if (sitesWithCoords.length === 1) {
      const s = sitesWithCoords[0];
      map.setView([s.latitude, s.longitude], 12);
    } else if (sitesWithCoords.length > 1) {
      const bounds = L.latLngBounds(sitesWithCoords.map((s) => [s.latitude, s.longitude]));
      map.fitBounds(bounds, { padding: [48, 48] });
    } else {
      map.setView(PH_CENTER, PH_DEFAULT_ZOOM);
    }
  }

  const totals = {
    sites: sites.length,
    assets: sites.reduce((a, s) => a + s.total, 0),
    operational: sites.reduce((a, s) => a + s.operational, 0),
    down: sites.filter((s) => s.status === "down").length,
    unserviceable: sites.filter((s) => s.status === "unserviceable").length,
    noData: sites.filter((s) => s.status === "no_data").length,
    downAssets: sites.reduce((a, s) => a + s.down + s.unserviceable, 0),
  };

  if (sites.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-10 text-center">
        <p className="text-sm text-ink-soft">No sites yet.</p>
        <p className="mt-1 text-xs text-slate-500">
          Add a site from a client&apos;s page, or add an asset with a Site —
          its location is set automatically.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-[calc(100vh-14rem)] min-h-[520px] flex-col gap-4 xl:flex-row">
        {/* Map surface */}
        <div className="relative min-h-[380px] flex-1 overflow-hidden rounded-xl border border-hairline">
          <MapContainer
            ref={mapRef}
            center={PH_CENTER}
            zoom={PH_DEFAULT_ZOOM}
            zoomControl={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
            {sitesWithCoords.map((site) => (
              <Marker
                key={site.id}
                position={[site.latitude, site.longitude]}
                icon={icons[site.status]}
                ref={(m: L.Marker | null) => {
                  if (m) markerRefs.current[site.id] = m;
                }}
                eventHandlers={{
                  click: () => setSelectedId(site.id),
                  popupclose: () =>
                    setSelectedId((cur) => (cur === site.id ? null : cur)),
                }}
              >
                <Popup closeButton>
                  <div className="w-64 rounded-xl border border-hairline bg-surface/95 p-3 shadow-2xl shadow-black/50 backdrop-blur">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">
                          {site.address ?? "Site"}
                        </div>
                        {site.organizationName && (
                          <div className="truncate text-[10px] tracking-wide text-slate-500">
                            {site.organizationName}
                          </div>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[site.status].pill}`}
                      >
                        {STATUS_STYLE[site.status].label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                        <div className="text-slate-500">Assets</div>
                        <div className="mt-0.5 font-semibold text-ink">
                          {site.operational}/{site.total}
                        </div>
                      </div>
                      <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                        <div className="text-slate-500">Needs Attention</div>
                        <div className="mt-0.5 font-semibold text-ink">
                          {site.attention + site.down + site.unserviceable}
                        </div>
                      </div>
                    </div>
                    {site.primaryAssetId && (
                      <button
                        type="button"
                        onClick={() => setDetailAssetId(site.primaryAssetId)}
                        className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-500/15 text-xs font-medium text-blue-300 ring-1 ring-inset ring-blue-500/25 hover:bg-blue-500/25"
                      >
                        View Asset →
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Zoom controls — Leaflet's built-in zoomControl is disabled
              above so this can match the rest of the app's styling, and so
              "Reset view" (which Leaflet has no equivalent for) can sit
              alongside +/-. */}
          <div className="absolute right-3 top-3 z-[500] flex flex-col gap-1.5">
            <MapBtn label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
              +
            </MapBtn>
            <MapBtn label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
              −
            </MapBtn>
            <MapBtn label="Reset view" onClick={resetView}>
              ⟲
            </MapBtn>
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-[500] rounded-xl border border-hairline bg-surface/90 px-3 py-2.5 backdrop-blur">
            <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-slate-500">
              LEGEND
            </div>
            <ul className="space-y-1">
              {(
                [
                  "operational",
                  "attention",
                  "down",
                  "unserviceable",
                  "no_data",
                ] as const
              ).map((s) => (
                <li key={s} className="flex items-center gap-2 text-xs text-ink-soft">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLE[s].dot}`} />
                  {STATUS_STYLE[s].label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Side panel */}
        <aside className="shrink-0 overflow-auto rounded-xl border border-hairline bg-surface p-4 xl:w-80">
          <h2 className="text-sm font-semibold text-ink">Deployment Readiness</h2>
          <p className="mt-1 text-xs text-slate-500">
            {totals.sites} sites · {totals.operational}/{totals.assets} assets operational
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Sites down" value={totals.down} tone="text-orange-400" />
            <Stat
              label="Sites unserviceable"
              value={totals.unserviceable}
              tone="text-red-400"
            />
            <Stat label="No assets" value={totals.noData} tone="text-slate-400" />
            <Stat label="Units down" value={totals.downAssets} tone="text-amber-400" />
          </div>

          <div className="mt-5 text-[10px] font-semibold tracking-widest text-slate-500">
            SITES
          </div>
          <ul className="mt-2 space-y-1.5">
            {sites.map((site) => {
              const st = STATUS_STYLE[site.status];
              const selected = selectedId === site.id;
              return (
                <li key={site.id}>
                  <button
                    type="button"
                    onClick={() => focusSite(site)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      selected ? "bg-surface-2" : "hover:bg-surface-2"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                      <span className="truncate text-ink-soft">
                        {site.address ?? "Site"}
                      </span>
                    </span>
                    <span className="shrink-0 text-slate-500">
                      {site.operational}/{site.total}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {detailAssetId && (
        <AssetDetailModal assetId={detailAssetId} onClose={() => setDetailAssetId(null)} />
      )}
    </div>
  );
}

function MapBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg border border-hairline bg-surface/90 text-sm font-semibold text-ink-soft backdrop-blur hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 px-2 py-2 text-center">
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  );
}
