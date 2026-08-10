"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "./status-badge";

export type BellAlert = {
  id: string;
  title: string;
  severity: string;
  is_read: boolean;
  created_at: string;
};

export type BellActivity = {
  id: string | number;
  label: string;
  sub: string;
  when: string;
  href?: string;
};

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

// Bell with a small red dot when there's something unread (real unread-
// Alerts count — see dashboard/page.tsx), and now a click-to-open dropdown
// previewing the latest Alerts and Recent Activity so you don't have to
// leave the page just to see what's new. "View all alerts" at the bottom
// still goes to /alerts (staff-only — a client_viewer lands on /assets
// instead via the existing requireStaff() redirect there).
export function NotificationBell({
  href,
  count,
  alerts,
  activities,
}: {
  href: string;
  count: number;
  alerts: BellAlert[];
  activities: BellActivity[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title={
          count > 0
            ? `${count} unread alert${count === 1 ? "" : "s"}`
            : "No new alerts"
        }
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-hairline text-ink-soft hover:bg-surface-2"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-surface" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-40 w-80 overflow-hidden rounded-xl border border-hairline bg-surface shadow-2xl shadow-black/40">
          <div className="border-b border-hairline px-4 py-3">
            <h3 className="text-sm font-semibold text-ink">Notifications</h3>
          </div>

          <div className="max-h-80 overflow-y-auto">
            <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Alerts
            </p>
            {alerts.length > 0 ? (
              <ul className="divide-y divide-hairline">
                {alerts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-surface-2"
                    >
                      <div className="min-w-0">
                        <p
                          className={`truncate text-sm ${a.is_read ? "text-ink-soft" : "font-medium text-ink"}`}
                        >
                          {a.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {timeAgo(a.created_at)}
                        </p>
                      </div>
                      <StatusBadge status={a.severity} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-slate-500">
                No alerts yet.
              </p>
            )}

            <p className="px-4 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Recent Activity
            </p>
            {activities.length > 0 ? (
              <ul className="divide-y divide-hairline">
                {activities.map((item) => {
                  const content = (
                    <>
                      <p className="truncate text-sm text-ink">
                        {item.label}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {item.sub} · {timeAgo(item.when)}
                      </p>
                    </>
                  );
                  return (
                    <li key={item.id}>
                      {item.href ? (
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="block px-4 py-2.5 hover:bg-surface-2"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div className="px-4 py-2.5">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-slate-500">
                No recent activity.
              </p>
            )}
          </div>

          <Link
            href={href}
            onClick={() => setOpen(false)}
            className="block border-t border-hairline px-4 py-2.5 text-center text-sm text-blue-400 hover:bg-surface-2"
          >
            View all alerts →
          </Link>
        </div>
      )}
    </div>
  );
}
