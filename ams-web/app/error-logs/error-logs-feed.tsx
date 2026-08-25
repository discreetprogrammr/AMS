"use client";

import { useMemo, useState, useTransition } from "react";
import { resolveErrorLog } from "./actions";

export type ErrorLogRow = {
  id: string;
  source: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

type FilterKey = "unresolved" | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "unresolved", label: "Unresolved" },
  { key: "all", label: "All" },
];

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

export function ErrorLogsFeed({ logs }: { logs: ErrorLogRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("unresolved");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (filter === "unresolved") return logs.filter((l) => !l.resolved);
    return logs;
  }, [logs, filter]);

  function handleResolve(id: string) {
    setPendingId(id);
    startTransition(async () => {
      try {
        await resolveErrorLog(id);
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
          {filter === "unresolved" ? "No unresolved errors — nothing outstanding." : "No errors logged yet."}
        </div>
      )}

      <ul className="space-y-3">
        {rows.map((l) => {
          const busy = isPending && pendingId === l.id;
          const expanded = expandedId === l.id;
          const hasDetail = Boolean(l.stack) || Boolean(l.context);
          return (
            <li
              key={l.id}
              className="relative overflow-hidden rounded-xl border border-hairline bg-surface"
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-red-500" />
              <div className="py-4 pl-6 pr-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-blue-400">
                      {l.source}
                    </code>
                    {l.resolved && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-400">
                        RESOLVED
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">
                    {timeAgo(l.created_at)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">{l.message}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {hasDetail && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : l.id)}
                      className="rounded-lg border border-hairline px-3 py-1 text-xs text-ink-soft hover:bg-surface-2"
                    >
                      {expanded ? "Hide Details" : "View Details"}
                    </button>
                  )}
                  {!l.resolved && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleResolve(l.id)}
                      className="rounded-lg border border-hairline px-3 py-1 text-xs text-ink-soft hover:bg-surface-2 disabled:opacity-50"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>

                {expanded && (
                  <div className="mt-3 space-y-2 rounded-lg border border-hairline bg-surface-2 p-3">
                    {l.stack && (
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Stack
                        </div>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-400">
                          {l.stack}
                        </pre>
                      </div>
                    )}
                    {l.context && (
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Context
                        </div>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-400">
                          {JSON.stringify(l.context, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
