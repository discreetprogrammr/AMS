"use client";

import { useMemo, useState, useTransition } from "react";
import { markAlertRead, resolveAlert } from "./actions";
import { assetLabel } from "@/lib/format";

export type AlertRow = {
  id: string;
  title: string;
  description: string | null;
  severity: "critical" | "caution" | "info";
  is_read: boolean;
  resolved_at: string | null;
  created_at: string;
  site_address: string | null;
  serial_number: string | null;
  organization_name: string | null;
};

type FilterKey = "all" | "unread" | "critical" | "caution";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "critical", label: "Critical" },
  { key: "caution", label: "Caution" },
];

const TONE = {
  critical: {
    bar: "bg-red-500",
    iconBg: "bg-red-500/15",
    iconText: "text-red-400",
    pill: "bg-red-500/15 text-red-400",
    label: "CRITICAL",
  },
  caution: {
    bar: "bg-amber-500",
    iconBg: "bg-amber-500/15",
    iconText: "text-amber-400",
    pill: "bg-amber-500/15 text-amber-400",
    label: "CAUTION",
  },
  info: {
    bar: "bg-blue-500",
    iconBg: "bg-blue-500/15",
    iconText: "text-blue-400",
    pill: "bg-blue-500/15 text-blue-400",
    label: "INFO",
  },
} as const;

function SeverityIcon({ severity }: { severity: keyof typeof TONE }) {
  const d =
    severity === "critical"
      ? "M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
      : severity === "caution"
        ? "M12 9v4m0 4h.01M12 3l9 16H3L12 3Z"
        : "M12 16v-4m0-4h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d={d} />
    </svg>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function AlertsFeed({ alerts }: { alerts: AlertRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    return alerts.filter((a) => {
      switch (filter) {
        case "unread":
          return !a.is_read;
        case "critical":
          return a.severity === "critical";
        case "caution":
          return a.severity === "caution";
        case "all":
        default:
          return true;
      }
    });
  }, [alerts, filter]);

  function handleMarkRead(id: string) {
    setPendingId(id);
    startTransition(async () => {
      try {
        await markAlertRead(id);
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleResolve(id: string) {
    setPendingId(id);
    startTransition(async () => {
      try {
        await resolveAlert(id);
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
            className={`inline-flex h-9 items-center rounded-full border px-3.5 text-xs font-medium tracking-wide transition-colors ${
              filter === f.key
                ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                : "border-hairline text-ink-soft hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="rounded-xl border border-hairline bg-surface p-10 text-center text-sm text-slate-500">
          No alerts match this filter.
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((a) => {
          const t = TONE[a.severity];
          const busy = isPending && pendingId === a.id;
          return (
            <li
              key={a.id}
              className="relative overflow-hidden rounded-xl border border-hairline bg-surface"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} />
              <div className="flex items-start gap-4 py-4 pl-6 pr-5">
                <div
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${t.iconBg} ${t.iconText}`}
                >
                  <SeverityIcon severity={a.severity} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                      <h3
                        className={`truncate text-sm font-semibold ${a.is_read ? "text-ink-soft" : "text-ink"}`}
                      >
                        {a.title}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider ${t.pill}`}
                      >
                        {t.label}
                      </span>
                      {a.resolved_at && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-400">
                          RESOLVED
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">
                      {timeAgo(a.created_at)}
                    </span>
                  </div>
                  {a.description && (
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      {a.description}
                    </p>
                  )}
                  {(a.site_address || a.organization_name) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {a.site_address ? assetLabel({ serial_number: a.serial_number, sites: { address: a.site_address } }) : ""}
                      {a.site_address && a.organization_name ? " · " : ""}
                      {a.organization_name}
                    </p>
                  )}

                  {!a.resolved_at && (
                    <div className="mt-3 flex gap-2">
                      {!a.is_read && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleMarkRead(a.id)}
                          className="rounded-lg border border-hairline px-3 py-1 text-xs text-ink-soft hover:bg-surface-2 disabled:opacity-50"
                        >
                          Mark Read
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleResolve(a.id)}
                        className="rounded-lg border border-hairline px-3 py-1 text-xs text-ink-soft hover:bg-surface-2 disabled:opacity-50"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
