"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/status-badge";
import { ticketRef, dateTimeLabel } from "@/lib/format";

const EQUIPMENT_LABEL: Record<string, string> = {
  xray_screening: "X-ray Screening",
  people_threat_screening: "People/Threat Screening",
  water_generation: "Water Generation",
  pump: "Pump",
  other: "Other",
};

type AssetDetail = {
  id: string;
  asset_tag: string;
  equipment_type: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  status: string;
  install_date: string | null;
  warranty_end_date: string | null;
  next_service_due: string | null;
  sites: { address: string | null } | null;
  organizations: { name: string | null } | null;
};

type LatestTicket = {
  id: string;
  description: string | null;
  status: string;
  created_at: string;
};

// Quick-preview summary popup — currently opened from the Fleet Map tab's
// "View Asset" button (fleet-map-view.tsx), as an overlay on top of the
// map rather than navigating away from it. Fetches its own data
// client-side so it only needs an assetId, not the full row data. Anything
// not covered here (edit, raise a ticket, full certificate/service
// history) is one click away via "View Full Details", which does a real
// navigation to the dedicated /assets/[id] page. `onClose` is left to the
// caller so each entry point can decide what "close" means (e.g. clear
// local state vs. navigate back).
export function AssetDetailModal({
  assetId,
  onClose,
}: {
  assetId: string;
  onClose: () => void;
}) {
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [latestTicket, setLatestTicket] = useState<LatestTicket | null>(null);
  const [notFoundOrDenied, setNotFoundOrDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    setAsset(null);
    setLatestTicket(null);
    setNotFoundOrDenied(false);

    supabase
      .from("assets")
      .select(
        "id, asset_tag, equipment_type, brand, model, serial_number, status, install_date, warranty_end_date, next_service_due, sites(address), organizations(name)",
      )
      .eq("id", assetId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setNotFoundOrDenied(true);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAsset(data as any);
      });

    supabase
      .from("service_tickets")
      .select("id, description, status, created_at")
      .eq("asset_id", assetId)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setLatestTicket((data?.[0] as LatestTicket) ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-hairline bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <h2 className="text-base font-semibold text-ink">
            {asset ? (asset.serial_number ? `SN ${asset.serial_number}` : asset.asset_tag) : "Asset"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-surface-2 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {notFoundOrDenied && (
            <p className="text-sm text-slate-500">
              This asset isn't available — it may not exist, or you may not have access to it.
            </p>
          )}
          {!asset && !notFoundOrDenied && <p className="text-sm text-slate-500">Loading…</p>}

          {asset && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={asset.status} />
                <span className="text-ink-soft">
                  {EQUIPMENT_LABEL[asset.equipment_type] ?? asset.equipment_type}
                  {[asset.brand, asset.model].filter(Boolean).length
                    ? ` — ${[asset.brand, asset.model].filter(Boolean).join(" / ")}`
                    : ""}
                </span>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Site / Location</p>
                <p className="text-ink-soft">
                  {asset.sites?.address ?? "—"}
                  {asset.organizations?.name ? ` — ${asset.organizations.name}` : ""}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Date Installed</p>
                  <p className="text-ink-soft">{asset.install_date ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Next PM Schedule</p>
                  <p className="text-ink-soft">{asset.next_service_due ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Warranty End</p>
                  <p className="text-ink-soft">{asset.warranty_end_date ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Serial Number</p>
                  <p className="text-ink-soft">{asset.serial_number ?? "—"}</p>
                </div>
              </div>

              <div className="border-t border-hairline pt-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Latest Service Ticket
                </p>
                {latestTicket ? (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{ticketRef(latestTicket.id)}</span>
                      <StatusBadge status={latestTicket.status} />
                    </div>
                    <p className="mt-0.5 truncate text-ink-soft">{latestTicket.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">Raised {dateTimeLabel(latestTicket.created_at)}</p>
                  </div>
                ) : (
                  <p className="text-slate-500">No service tickets on file.</p>
                )}
              </div>

              <Link
                href={`/assets/${asset.id}`}
                className="inline-block pt-2 text-blue-400 hover:underline"
              >
                View Full Details →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
