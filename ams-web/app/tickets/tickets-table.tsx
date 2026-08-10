"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { ticketRef, woRef } from "@/lib/format";

export type TicketRow = {
  id: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  work_order_id: string | null;
  asset_id: string | null;
  site_address: string | null;
  organization_name: string | null;
};

// Same filter set as the Work Orders table (work-orders-table.tsx) — kept
// in sync on purpose, since schema_step21.sql unified ticket_status and
// work_order_status onto the same Open/In Progress/Parts Pending/Closed
// vocabulary. Defaults to "all" so nothing (closed tickets included) is
// ever hidden unless the user deliberately filters.
type FilterKey =
  | "all"
  | "open"
  | "in_progress"
  | "parts_pending"
  | "closed"
  | "high";

const FILTERS: { key: FilterKey; label: string; dotClass?: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open", dotClass: "bg-blue-500" },
  { key: "in_progress", label: "In Progress", dotClass: "bg-amber-500" },
  { key: "parts_pending", label: "Parts Pending", dotClass: "bg-orange-500" },
  { key: "closed", label: "Closed", dotClass: "bg-emerald-500" },
  { key: "high", label: "High Priority", dotClass: "bg-red-500" },
];

export function TicketsTable({
  tickets,
  isStaff,
}: {
  tickets: TicketRow[];
  isStaff: boolean;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const rows = useMemo(() => {
    return tickets.filter((t) => {
      switch (filter) {
        case "high":
          return t.priority === "high";
        case "open":
          return t.status === "open";
        case "in_progress":
          return t.status === "in_progress";
        case "parts_pending":
          return t.status === "parts_pending";
        case "closed":
          return t.status === "closed";
        case "all":
        default:
          return true;
      }
    });
  }, [tickets, filter]);

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
              <th className="px-4 py-3">Ticket</th>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Work Order</th>
              <th className="px-4 py-3">Raised</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr
                key={t.id}
                className="border-t border-hairline hover:bg-surface-2"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/assets/${t.asset_id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {ticketRef(t.id)}
                  </Link>
                  <div className="mt-0.5 max-w-xs truncate text-xs text-slate-500">
                    {t.description}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {t.site_address ?? "—"}
                  {t.organization_name && (
                    <div className="text-xs text-slate-500">
                      {t.organization_name}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={t.priority} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {t.work_order_id ? (
                    isStaff ? (
                      <Link
                        href="/work-orders"
                        className="text-blue-400 hover:underline"
                      >
                        {woRef(t.work_order_id)} →
                      </Link>
                    ) : (
                      <span className="text-ink-soft">
                        {woRef(t.work_order_id)}
                      </span>
                    )
                  ) : isStaff && t.status !== "closed" ? (
                    <Link
                      href={`/work-orders/new?ticket_id=${t.id}`}
                      className="text-ink-soft hover:text-ink hover:underline"
                    >
                      + Create
                    </Link>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No service tickets match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
