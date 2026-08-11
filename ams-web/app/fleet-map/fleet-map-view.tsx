"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PH_COASTLINE_PATHS } from "@/lib/philippines-geo";
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
  { dot: string; ring: string; text: string; pill: string; label: string }
> = {
  operational: {
    dot: "bg-emerald-500",
    ring: "bg-emerald-500/25",
    text: "text-emerald-300",
    pill: "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/25",
    label: "Operational",
  },
  attention: {
    dot: "bg-amber-500",
    ring: "bg-amber-500/25",
    text: "text-amber-300",
    pill: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/25",
    label: "Attention",
  },
  down: {
    dot: "bg-orange-500",
    ring: "bg-orange-500/30",
    text: "text-orange-300",
    pill: "bg-orange-500/10 text-orange-300 ring-1 ring-inset ring-orange-500/25",
    label: "Down",
  },
  unserviceable: {
    dot: "bg-red-500",
    ring: "bg-red-500/30",
    text: "text-red-300",
    pill: "bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/25",
    label: "Unserviceable",
  },
  no_data: {
    dot: "bg-slate-500",
    ring: "bg-slate-500/20",
    text: "text-slate-300",
    pill: "bg-slate-500/10 text-slate-300 ring-1 ring-inset ring-slate-500/20",
    label: "No Assets",
  },
};

// Philippines archipelago bounding box (degrees) — matches the projection
// the coastline path data (lib/philippines-geo.ts) was generated against.
const LNG_MIN = 116.4;
const LNG_MAX = 127.2;
const LAT_MIN = 4.3;
const LAT_MAX = 21.4;
const SPAN_LNG = LNG_MAX - LNG_MIN;
const SPAN_LAT = LAT_MAX - LAT_MIN;

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 12;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function FleetMapView({ sites }: { sites: FleetSite[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  // "View Asset" used to navigate to /assets?asset=<id>, leaving the map —
  // now it opens the same summary popup right on top of the map instead.
  // "View Full Details" inside that popup is still a real navigation, to
  // the dedicated /assets/[id] page.
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Uniform (non-distorting) fit of the archipelago inside the container.
  const fit = useMemo(() => {
    const scale = Math.min(size.w / SPAN_LNG, size.h / SPAN_LAT);
    return {
      scale,
      padX: (size.w - SPAN_LNG * scale) / 2,
      padY: (size.h - SPAN_LAT * scale) / 2,
    };
  }, [size.w, size.h]);

  const project = useCallback(
    (lat: number, lng: number) => ({
      x: (lng - LNG_MIN) * fit.scale + fit.padX,
      y: (LAT_MAX - lat) * fit.scale + fit.padY,
    }),
    [fit],
  );

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setZoom((z) => {
      const next = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
      const k = next / z;
      setOffset((o) => ({ x: px - (px - o.x) * k, y: py - (py - o.y) * k }));
      return next;
    });
  }, []);

  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const rect = el.getBoundingClientRect();
      zoomAtRef.current(
        Math.exp(-dy * 0.0018),
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const shownId = pinnedId ?? activeId;
  const shown = sites.find((s) => s.id === shownId) ?? null;

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
        <div
          ref={containerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`relative min-h-[380px] flex-1 overflow-hidden rounded-xl border border-hairline bg-[#060b17] ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          style={{ touchAction: "none" }}
        >
          <div
            className="absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(148,163,184,.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,.28) 1px, transparent 1px)",
              backgroundSize: `${48 * zoom}px ${48 * zoom}px`,
              backgroundPosition: `${offset.x}px ${offset.y}px`,
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.14),transparent_72%)]" />

          <svg
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
            shapeRendering="geometricPrecision"
          >
            <g
              transform={
                `translate(${offset.x} ${offset.y}) scale(${zoom}) ` +
                `translate(${fit.padX} ${fit.padY}) scale(${fit.scale}) ` +
                `translate(${-LNG_MIN} ${LAT_MAX})`
              }
            >
              {PH_COASTLINE_PATHS.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="#16233d"
                  stroke="rgba(96,165,250,0.55)"
                  strokeWidth={1}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          </svg>

          {sites.map((site) => {
            const base = project(site.latitude, site.longitude);
            const x = offset.x + base.x * zoom;
            const y = offset.y + base.y * zoom;
            if (x < -40 || y < -40 || x > size.w + 40 || y > size.h + 40) return null;
            const st = STATUS_STYLE[site.status];
            const isActive = shownId === site.id;
            return (
              <button
                key={site.id}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseEnter={() => setActiveId(site.id)}
                onMouseLeave={() => setActiveId((cur) => (cur === site.id ? null : cur))}
                onClick={() => setPinnedId((cur) => (cur === site.id ? null : site.id))}
                aria-label={`${site.address ?? "Site"} — ${st.label}`}
                className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                style={{ left: x, top: y, zIndex: isActive ? 15 : 10 }}
              >
                <span
                  className={`absolute h-5 w-5 rounded-full ${st.ring} ${
                    site.status === "down" || site.status === "unserviceable"
                      ? "animate-ping"
                      : "animate-pulse"
                  }`}
                />
                <span
                  className={`relative h-2.5 w-2.5 rounded-full ${st.dot} ring-2 ring-[#060b17]/80 ${
                    isActive ? "scale-150" : ""
                  } transition-transform`}
                />
              </button>
            );
          })}

          {shown && (
            <div
              className="absolute z-20 w-64"
              style={{
                left: clamp(
                  offset.x + project(shown.latitude, shown.longitude).x * zoom + 18,
                  12,
                  Math.max(12, size.w - 272),
                ),
                top: clamp(
                  offset.y + project(shown.latitude, shown.longitude).y * zoom - 60,
                  12,
                  Math.max(12, size.h - 200),
                ),
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="rounded-xl border border-hairline bg-surface/95 p-3 shadow-2xl shadow-black/50 backdrop-blur">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">
                      {shown.address ?? "Site"}
                    </div>
                    {shown.organizationName && (
                      <div className="truncate text-[10px] tracking-wide text-slate-500">
                        {shown.organizationName}
                      </div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[shown.status].pill}`}
                  >
                    {STATUS_STYLE[shown.status].label}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                    <div className="text-slate-500">Assets</div>
                    <div className="mt-0.5 font-semibold text-ink">
                      {shown.operational}/{shown.total}
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface-2 px-2.5 py-2">
                    <div className="text-slate-500">Needs Attention</div>
                    <div className="mt-0.5 font-semibold text-ink">
                      {shown.attention + shown.down + shown.unserviceable}
                    </div>
                  </div>
                </div>
                {shown.primaryAssetId && (
                  <button
                    type="button"
                    onClick={() => setDetailAssetId(shown.primaryAssetId)}
                    className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-500/15 text-xs font-medium text-blue-300 ring-1 ring-inset ring-blue-500/25 hover:bg-blue-500/25"
                  >
                    View Asset →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Zoom controls */}
          <div className="absolute right-3 top-3 z-30 flex flex-col gap-1.5">
            <MapBtn label="Zoom in" onClick={() => zoomAt(1.4, size.w / 2, size.h / 2)}>
              +
            </MapBtn>
            <MapBtn label="Zoom out" onClick={() => zoomAt(1 / 1.4, size.w / 2, size.h / 2)}>
              −
            </MapBtn>
            <MapBtn label="Reset view" onClick={reset}>
              ⟲
            </MapBtn>
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-30 rounded-xl border border-hairline bg-surface/90 px-3 py-2.5 backdrop-blur">
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

          <div className="absolute bottom-3 right-3 z-30 text-[10px] text-slate-500">
            Scroll to zoom · drag to pan · {Math.round(zoom * 100)}%
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
              const selected = shownId === site.id;
              return (
                <li key={site.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveId(site.id)}
                    onMouseLeave={() => setActiveId((cur) => (cur === site.id ? null : cur))}
                    onClick={() => setPinnedId((cur) => (cur === site.id ? null : site.id))}
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
