"use client";

import { StatusBadge } from "@/components/status-badge";
import { assetLabel } from "@/lib/format";
import { effectiveStatus, type CalendarEventRow } from "./calendar-view";

const EVENT_TYPE_LABEL: Record<string, string> = {
  calibration: "Calibration",
  maintenance: "Maintenance",
  firmware: "Firmware",
  inspection: "Inspection",
  work_order: "Work Order",
  other: "Other",
};

// Click-through summary for a single calendar entry (item 9) — shows the
// REAL Open/In Progress/Parts Pending/Closed status for anything spawned
// from an actual work order (schema_step17.sql's work_order_id), since
// that's the vocabulary that matters operationally; falls back to the
// calendar event's own generic scheduled/completed/overdue for entries
// that were never tied to a work order (e.g. a manually scheduled
// calibration reminder).
export function CalendarEventModal({
  event,
  onClose,
}: {
  event: CalendarEventRow;
  onClose: () => void;
}) {
  const label = assetLabel({
    serial_number: event.serial_number,
    sites: { address: event.site_address },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-hairline bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{event.title}</h2>
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

        <div className="space-y-4 px-5 py-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
              <StatusBadge status={event.work_order ? event.work_order.status : effectiveStatus(event)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Type</p>
              <span className="text-ink-soft">{EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}</span>
            </div>
            {event.work_order && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Priority</p>
                <StatusBadge status={event.work_order.priority} />
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Date</p>
            <p className="text-ink-soft">{event.event_date}</p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Site / Equipment</p>
            <p className="text-ink-soft">
              {event.site_address ? label : "—"}
              {event.organization_name ? ` — ${event.organization_name}` : ""}
            </p>
          </div>

          {event.work_order?.lead_technician && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lead Technician</p>
              <p className="text-ink-soft">{event.work_order.lead_technician}</p>
            </div>
          )}

          {(event.work_order?.description || event.notes) && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
              <p className="whitespace-pre-wrap text-ink-soft">
                {event.work_order?.description || event.notes}
              </p>
            </div>
          )}

          {event.asset_id && (
            <a
              href={`/assets/${event.asset_id}`}
              className="inline-block text-blue-400 hover:underline"
            >
              View Asset →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
