"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { StatusBadge } from "@/components/status-badge";
import { ticketRef, woRef, dateTimeLabel } from "@/lib/format";
import { updateWorkOrderStatus } from "./actions";
import { LogPartsModal, type PartOption } from "./log-parts-modal";

export type WorkOrderRow = {
  id: string;
  task_title: string;
  description: string | null;
  work_type: string;
  priority: string;
  status: string;
  lead_technician: string | null;
  due_date: string | null;
  created_at: string;
  closed_at: string | null;
  site_name: string | null;
  organization_name: string | null;
  from_ticket_id: string | null;
  parts_used: { quantity_used: number; part_name_snapshot: string }[];
};

type FilterKey =
  | "all"
  | "open"
  | "in_progress"
  | "parts_pending"
  | "closed"
  | "high";

// Default is "all" — a closed work order stays in the table for record,
// it just no longer shows up under the "Open" / "In Progress" / "Parts
// Pending" filters. Previously the default filter hid completed work
// orders entirely, which made them look like they'd disappeared.
const FILTERS: { key: FilterKey; label: string; dotClass?: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open", dotClass: "bg-blue-500" },
  { key: "in_progress", label: "In Progress", dotClass: "bg-amber-500" },
  { key: "parts_pending", label: "Parts Pending", dotClass: "bg-orange-500" },
  { key: "closed", label: "Closed", dotClass: "bg-emerald-500" },
  { key: "high", label: "High Priority", dotClass: "bg-red-500" },
];

export function WorkOrdersTable({
  workOrders,
  parts,
}: {
  workOrders: WorkOrderRow[];
  parts: PartOption[];
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [logPartsFor, setLogPartsFor] = useState<WorkOrderRow | null>(null);

  const rows = useMemo(() => {
    return workOrders.filter((w) => {
      switch (filter) {
        case "high":
          return w.priority === "high";
        case "open":
          return w.status === "open";
        case "in_progress":
          return w.status === "in_progress";
        case "parts_pending":
          return w.status === "parts_pending";
        case "closed":
          return w.status === "closed";
        case "all":
        default:
          return true;
      }
    });
  }, [workOrders, filter]);

  function handleStatusChange(id: string, status: string) {
    setPendingId(id);
    startTransition(async () => {
      try {
        await updateWorkOrderStatus(id, status);
      } finally {
        setPendingId(null);
      }
    });
  }

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
            {f.dotClass && (
              <span className={`h-2 w-2 rounded-full ${f.dotClass}`} />
            )}
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Work Order</th>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Task</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Closed</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr
                key={w.id}
                className="border-t border-hairline hover:bg-surface-2"
              >
                <td className="px-4 py-3 font-medium text-ink">
                  {woRef(w.id)}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {w.site_name ?? "—"}
                  {w.organization_name && (
                    <div className="text-xs text-slate-500">
                      {w.organization_name}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-xs truncate text-ink">
                    {w.task_title}
                  </div>
                  <div className="text-xs capitalize text-slate-500">
                    {w.work_type}
                    {w.lead_technician ? ` · ${w.lead_technician}` : ""}
                  </div>
                  {w.from_ticket_id && (
                    <Link
                      href="/tickets"
                      className="mt-0.5 inline-block text-xs normal-case text-blue-400 hover:underline"
                    >
                      From {ticketRef(w.from_ticket_id)}
                    </Link>
                  )}
                  {w.parts_used.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {w.parts_used.map((p, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] normal-case text-ink-soft"
                        >
                          {p.quantity_used}× {p.part_name_snapshot}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={w.priority} />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={w.status}
                    disabled={isPending && pendingId === w.id}
                    onChange={(e) => handleStatusChange(w.id, e.target.value)}
                    className="rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-xs text-ink focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="parts_pending">Parts Pending</option>
                    <option value="closed">Closed</option>
                  </select>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                  {w.due_date
                    ? new Date(w.due_date).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                  {dateTimeLabel(w.created_at)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                  {dateTimeLabel(w.closed_at)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => setLogPartsFor(w)}
                    className="text-xs text-blue-400 hover:underline"
                  >
                    Log Parts
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No work orders match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {logPartsFor && (
        <LogPartsModal
          workOrderId={logPartsFor.id}
          woRefLabel={`${woRef(logPartsFor.id)} — ${logPartsFor.task_title}`}
          parts={parts}
          onClose={() => setLogPartsFor(null)}
        />
      )}
    </div>
  );
}
