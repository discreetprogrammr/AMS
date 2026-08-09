"use client";

import { useMemo, useState, useTransition } from "react";
import { StatusBadge } from "@/components/status-badge";
import { woRef } from "@/lib/format";
import { updateWorkOrderStatus } from "./actions";

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
  asset_tag: string | null;
  organization_name: string | null;
};

type FilterKey = "all_open" | "high" | "in_progress" | "completed";

const FILTERS: { key: FilterKey; label: string; dotClass?: string }[] = [
  { key: "all_open", label: "All Open" },
  { key: "high", label: "High Priority", dotClass: "bg-red-500" },
  { key: "in_progress", label: "In Progress", dotClass: "bg-amber-500" },
  { key: "completed", label: "Completed", dotClass: "bg-emerald-500" },
];

export function WorkOrdersTable({
  workOrders,
}: {
  workOrders: WorkOrderRow[];
}) {
  const [filter, setFilter] = useState<FilterKey>("all_open");
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    return workOrders.filter((w) => {
      switch (filter) {
        case "high":
          return w.priority === "high";
        case "in_progress":
          return w.status === "in_progress";
        case "completed":
          return w.status === "completed";
        case "all_open":
        default:
          return w.status !== "completed";
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

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Work Order</th>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Task</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Due</th>
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
                  {w.asset_tag ?? "—"}
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
                    <option value="completed">Completed</option>
                  </select>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                  {w.due_date
                    ? new Date(w.due_date).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No work orders match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
