"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { AssetRowActions } from "./asset-row-actions";
import { AssetDetailModal } from "./asset-detail-modal";

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
  emptyMessage,
  selectedAssetId,
}: {
  assets: AssetRow[];
  isStaff: boolean;
  emptyMessage: string;
  // Read server-side from ?asset=<id> (page.tsx) rather than via
  // useSearchParams() client-side — avoids needing a <Suspense> boundary
  // just for this, since the page already has the value at render time.
  selectedAssetId?: string | null;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const rows = useMemo(() => {
    if (filter === "all") return assets;
    return assets.filter((a) => a.status === filter);
  }, [assets, filter]);

  return (
    <div>
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

      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Serial Number</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Equipment Type</th>
              <th className="px-4 py-3">Brand / Model</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Site</th>
              {isStaff && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((asset) => (
              <tr key={asset.id} className="border-t border-hairline hover:bg-surface-2">
                <td className="px-4 py-3">
                  <Link
                    href={`/assets?asset=${asset.id}`}
                    scroll={false}
                    className="font-medium text-ink hover:underline"
                  >
                    {asset.serial_number ? `SN ${asset.serial_number}` : asset.asset_tag}
                  </Link>
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
                  <td className="px-4 py-3 text-right">
                    <AssetRowActions assetId={asset.id} assetTag={asset.asset_tag} />
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={isStaff ? 7 : 6} className="px-4 py-8 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedAssetId && <AssetDetailModal assetId={selectedAssetId} />}
    </div>
  );
}
