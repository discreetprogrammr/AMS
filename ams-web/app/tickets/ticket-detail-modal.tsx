"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/status-badge";
import { ticketRef, woRef, reportRef, dateTimeLabel } from "@/lib/format";
import { updateTicketStatus } from "@/app/assets/tickets-actions";
import type { TicketRow } from "./tickets-table";

type LinkedReport = {
  id: string;
  service_type: string;
  date_performed: string;
  result: string;
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "parts_pending", label: "Parts Pending" },
  { value: "closed", label: "Closed" },
];

// Staff-only ticket detail view — opened by clicking a row in
// tickets-table.tsx. Shows everything at a glance (site/serial, raised/
// resolved timestamps, work order, linked PM/CM report) plus lets staff
// change the status directly instead of navigating to the asset page.
// Status changes go out over supabase_realtime (schema_step28.sql), so
// they show up live in the client's own Tickets view too, not just here.
export function TicketDetailModal({
  ticket,
  onClose,
  onStatusChange,
}: {
  ticket: TicketRow;
  onClose: () => void;
  onStatusChange: (ticketId: string, status: string, resolvedAt: string | null) => void;
}) {
  const [reports, setReports] = useState<LinkedReport[] | null>(null);
  const [status, setStatus] = useState(ticket.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(ticket.status);
  }, [ticket.status]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("service_records")
      .select("id, service_type, date_performed, result")
      .eq("ticket_id", ticket.id)
      .order("date_performed", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setReports((data as LinkedReport[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [ticket.id]);

  async function handleStatusChange(next: string) {
    const prev = status;
    setStatus(next);
    setSaving(true);
    setError(null);
    try {
      await updateTicketStatus(ticket.id, next);
      onStatusChange(ticket.id, next, next === "closed" ? new Date().toISOString() : ticket.resolved_at);
    } catch (err) {
      setStatus(prev);
      setError(err instanceof Error ? err.message : "Couldn't update status.");
    } finally {
      setSaving(false);
    }
  }

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
          <div>
            <h2 className="text-base font-semibold text-ink">{ticketRef(ticket.id)}</h2>
            <p className="text-xs text-slate-500">
              {ticket.site_address ?? "—"}
              {ticket.serial_number ? ` · SN ${ticket.serial_number}` : ""}
            </p>
          </div>
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

        <div className="space-y-5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
              <select
                value={status}
                disabled={saving}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-sm text-ink focus:border-blue-500 focus:outline-none disabled:opacity-50"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Priority</p>
              <StatusBadge status={ticket.priority} />
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Description</p>
            <p className="whitespace-pre-wrap text-sm text-ink-soft">{ticket.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Raised</p>
              <p className="text-ink-soft">{dateTimeLabel(ticket.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Resolved</p>
              <p className="text-ink-soft">{dateTimeLabel(ticket.resolved_at)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <Link href={`/assets/${ticket.asset_id}`} className="text-blue-400 hover:underline">
              View Asset →
            </Link>
            <Link href={`/messages/${ticket.id}`} className="text-blue-400 hover:underline">
              Message →
            </Link>
            {ticket.work_order_id ? (
              <Link href="/work-orders" className="text-blue-400 hover:underline">
                {woRef(ticket.work_order_id)} →
              </Link>
            ) : (
              status !== "closed" && (
                <Link
                  href={`/work-orders/new?ticket_id=${ticket.id}`}
                  className="text-blue-400 hover:underline"
                >
                  + Create Work Order
                </Link>
              )
            )}
          </div>

          <div className="border-t border-hairline pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              PM / CM Report
            </p>
            {reports === null && <p className="text-sm text-slate-500">Loading…</p>}
            {reports?.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">No report has been logged for this ticket yet.</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <Link
                    href={`/reports/preventive-checklist?ticket_id=${ticket.id}`}
                    className="text-blue-400 hover:underline"
                  >
                    Log PM Report →
                  </Link>
                  <Link
                    href={`/reports/corrective-checklist?ticket_id=${ticket.id}`}
                    className="text-blue-400 hover:underline"
                  >
                    Log CM Report →
                  </Link>
                </div>
              </div>
            )}
            {reports && reports.length > 0 && (
              <ul className="divide-y divide-hairline text-sm">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <a
                        href={`/api/reports/service-records/${r.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-400 hover:underline"
                      >
                        {reportRef(r.id, r.service_type === "preventive_maintenance" ? "PM" : "CM")}
                      </a>
                      <p className="text-xs text-slate-500">{r.date_performed}</p>
                    </div>
                    <StatusBadge status={r.result} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
