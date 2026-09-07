"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { ticketRef, dateTimeLabel } from "@/lib/format";

export type MessageRow = {
  id: string;
  description: string | null;
  status: string;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  latest: any;
  unread: boolean;
};

// Same status vocabulary/filter set as the Tickets and Work Orders tables
// (tickets-table.tsx, work-orders-table.tsx) — kept in sync on purpose so
// "Open" means the same thing everywhere in the app. "Unread" is specific
// to this inbox view (computed server-side from message_reads) and isn't a
// ticket_status value, so it's handled as its own predicate below rather
// than folded into the status switch.
type FilterKey = "all" | "open" | "in_progress" | "parts_pending" | "closed" | "unread";

const FILTERS: { key: FilterKey; label: string; dotClass?: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread", dotClass: "bg-red-500" },
  { key: "open", label: "Open", dotClass: "bg-blue-500" },
  { key: "in_progress", label: "In Progress", dotClass: "bg-amber-500" },
  { key: "parts_pending", label: "Parts Pending", dotClass: "bg-orange-500" },
  { key: "closed", label: "Closed", dotClass: "bg-emerald-500" },
];

export function MessagesList({ rows }: { rows: MessageRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    return rows.filter((t) => {
      switch (filter) {
        case "unread":
          return t.unread;
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
  }, [rows, filter]);

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

      <div className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
        {filtered.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            {rows.length === 0
              ? "No tickets to message about yet."
              : "No conversations match this filter."}
          </p>
        )}
        {filtered.map((t) => (
          <Link
            key={t.id}
            href={`/messages/${t.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-2"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{ticketRef(t.id)}</span>
                <StatusBadge status={t.status} />
                {t.unread && (
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
                    New
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-base font-semibold text-ink">
                {t.description || "No description provided."}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {t.assets?.sites?.address ?? "—"}
                {t.assets?.organizations?.name ? ` — ${t.assets.organizations.name}` : ""}
              </p>
              <p className={`mt-1 truncate text-sm ${t.unread ? "font-semibold text-ink" : "text-slate-500"}`}>
                {previewText(t.latest)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Started {dateTimeLabel(t.created_at)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {t.unread && <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-label="Unread" />}
              <span className="whitespace-nowrap text-xs text-slate-500">
                Updated {dateTimeLabel(t.latest?.created_at ?? t.created_at)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function previewText(m: any): string {
  if (!m) return "No messages yet — say hello.";
  const kindLabel = m.call_kind === "video" ? "Video" : "Voice";
  switch (m.message_type) {
    case "text":
      if (m.body) return m.body;
      if (m.attachment_name) {
        const isImage = (m.attachment_mime as string | null)?.startsWith("image/");
        return `📎 ${isImage ? "Photo" : m.attachment_name}`;
      }
      return "";
    case "call_started":
      return `${kindLabel} call`;
    case "call_ended":
      return `${kindLabel} call ended`;
    case "call_missed":
      return `Missed ${kindLabel.toLowerCase()} call`;
    case "call_declined":
      return `Declined ${kindLabel.toLowerCase()} call`;
    default:
      return "";
  }
}
