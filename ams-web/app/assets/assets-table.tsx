"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import {
  SEGMENTS,
  VIEWS,
  internalAssetsHref,
  labelFor,
  type InternalFilters,
} from "@/lib/internal-equipment";
import { AssetRowActions } from "./asset-row-actions";
import { InternalStatusBadges } from "./internal-badges";
import { BulkEditBar } from "./bulk-edit-bar";

const EQUIPMENT_LABEL: Record<string, string> = {
  xray_screening: "X-ray Screening",
  people_threat_screening: "People/Threat Screening",
  water_generation: "Water Generation",
  pump: "Pump",
  other: "Other",
};

export type AssetRow = {
  id: string;
  asset_tag: string;
  serial_number: string | null;
  equipment_type: string;
  brand: string | null;
  model: string | null;
  status: string;
  site_address: string | null;
  organization_name: string | null;
  // Internal equipment only (schema_step46.sql); null on client assets.
  segment: string | null;
  asset_category: string | null;
  description: string | null;
  custodian: string | null;
  department: string | null;
  assignment_status: string | null;
  condition: string | null;
  warranty_end_date: string | null;
};

// Same pill-filter pattern as Tickets/Work Orders (tickets-table.tsx) —
// added per request so a client can quickly narrow their fleet view down
// to just what needs attention, instead of scrolling a flat list.
type FilterKey = "all" | "operational" | "attention" | "down" | "unserviceable";

const FILTERS: { key: FilterKey; label: string; dotClass?: string }[] = [
  { key: "all", label: "All" },
  { key: "operational", label: "Operational", dotClass: "bg-emerald-500" },
  { key: "attention", label: "Attention", dotClass: "bg-amber-500" },
  { key: "down", label: "Down", dotClass: "bg-orange-500" },
  { key: "unserviceable", label: "Unserviceable", dotClass: "bg-red-500" },
];

export function AssetsTable({
  assets,
  isStaff,
  internalView = false,
  orgId = "",
  q = "",
  filters,
  guardedDelete = false,
  emptyMessage,
}: {
  assets: AssetRow[];
  isStaff: boolean;
  // True when /assets is filtered to the internal organization: shows the
  // spec 7.2 columns and drops the NII-only ones.
  internalView?: boolean;
  // Internal view only: the status pills are links, because the filtering
  // happens server-side (page.tsx) and the URL is the state.
  orgId?: string;
  q?: string;
  filters?: InternalFilters;
  // HR & Admin preset: the server refuses a delete that would cascade.
  guardedDelete?: boolean;
  emptyMessage: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("all");
  // Internal view, staff: tick rows to edit several at once (BulkEditBar).
  const bulkEnabled = internalView && isStaff;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    if (internalView || filter === "all") return assets;
    return assets.filter((a) => a.status === filter);
  }, [assets, filter, internalView]);

  // Only rows still on screen count, so a changed filter cannot leave
  // invisible ticks behind.
  const selectedIds = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allTicked = rows.length > 0 && selectedIds.length === rows.length;
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allTicked ? new Set() : new Set(rows.map((r) => r.id)));
  }

  return (
    <div>
      {internalView && filters ? (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v.value}
              href={internalAssetsHref({ q, org: orgId }, { ...filters, view: v.value })}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium tracking-wide transition-colors ${
                filters.view === v.value
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                  : "border-hairline text-ink-soft hover:text-ink"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>
      ) : (
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium tracking-wide transition-colors ${
              filter === f.key
                ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                : "border-hairline text-ink-soft hover:text-ink"
            }`}
          >
            {f.dotClass && <span className={`h-2 w-2 rounded-full ${f.dotClass}`} />}
            {f.label}
          </button>
        ))}
      </div>
      )}

      {bulkEnabled && selectedIds.length > 0 && (
        <BulkEditBar ids={selectedIds} onClear={() => setSelected(new Set())} />
      )}

      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            {internalView ? (
              <tr>
                {bulkEnabled && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allTicked}
                      onChange={toggleAll}
                      aria-label="Select all shown items"
                    />
                  </th>
                )}
                <th className="px-4 py-3">Asset Tag</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Brand / Model</th>
                <th className="px-4 py-3">Serial</th>
                <th className="px-4 py-3">Custodian</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Segment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Warranty End</th>
                {isStaff && <th className="sticky right-0 bg-surface-2 px-4 py-3 text-right">Actions</th>}
              </tr>
            ) : (
            <tr>
              <th className="px-4 py-3">Serial Number</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Equipment Type</th>
              <th className="px-4 py-3">Brand / Model</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Site</th>
              {isStaff && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
            )}
          </thead>
          <tbody>
            {rows.map((asset) => internalView ? (
              <tr
                key={asset.id}
                onClick={() => router.push(`/assets/${asset.id}`)}
                className="cursor-pointer border-t border-hairline hover:bg-surface-2"
              >
                {bulkEnabled && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(asset.id)}
                      onChange={() => toggleOne(asset.id)}
                      aria-label={`Select ${asset.asset_tag}`}
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-medium text-ink">{asset.asset_tag}</td>
                <td className="px-4 py-3 text-ink-soft">{asset.asset_category ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{asset.description ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {[asset.brand, asset.model].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="px-4 py-3 text-ink-soft">{asset.serial_number ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{asset.custodian ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{asset.department ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{labelFor(SEGMENTS, asset.segment)}</td>
                <td className="px-4 py-3">
                  <InternalStatusBadges
                    assignmentStatus={asset.assignment_status}
                    condition={asset.condition}
                  />
                </td>
                <td className="px-4 py-3 text-ink-soft">{asset.warranty_end_date ?? "—"}</td>
                {isStaff && (
                  <td className="sticky right-0 bg-surface px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <AssetRowActions assetId={asset.id} assetTag={asset.asset_tag} guarded={guardedDelete} />
                  </td>
                )}
              </tr>
            ) : (
              <tr
                key={asset.id}
                onClick={() => router.push(`/assets/${asset.id}`)}
                className="cursor-pointer border-t border-hairline hover:bg-surface-2"
              >
                <td className="px-4 py-3 font-medium text-ink">
                  {asset.serial_number ? `SN ${asset.serial_number}` : asset.asset_tag}
                </td>
                <td className="px-4 py-3 text-ink-soft">{asset.organization_name ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {EQUIPMENT_LABEL[asset.equipment_type] ?? asset.equipment_type}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {[asset.brand, asset.model].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={asset.status} />
                </td>
                <td className="px-4 py-3 text-ink-soft">{asset.site_address ?? "—"}</td>
                {isStaff && (
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <AssetRowActions assetId={asset.id} assetTag={asset.asset_tag} />
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={internalView ? (isStaff ? 12 : 10) : isStaff ? 7 : 6} className="px-4 py-8 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
