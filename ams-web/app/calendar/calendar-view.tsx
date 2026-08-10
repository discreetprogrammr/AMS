"use client";

import { useMemo, useState, useTransition } from "react";
import { markEventCompleted } from "./actions";

export type CalendarEventRow = {
  id: string;
  title: string;
  event_type: string;
  event_date: string; // ISO yyyy-mm-dd
  status: string;
  notes: string | null;
  asset_tag: string | null;
  organization_name: string | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "overdue" is computed for display rather than trusted from the stored
// status — a scheduled event just needs its date to pass, no separate job
// needs to flip a column for that to be true.
function effectiveStatus(ev: CalendarEventRow): "scheduled" | "completed" | "overdue" {
  if (ev.status === "completed") return "completed";
  return ev.event_date < toISO(new Date()) ? "overdue" : "scheduled";
}

const EVENT_TONE: Record<string, { ring: string; dot: string }> = {
  calibration: { ring: "bg-blue-500/20 text-blue-300 ring-1 ring-inset ring-blue-500/40", dot: "bg-blue-500" },
  maintenance: { ring: "bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-500/40", dot: "bg-emerald-500" },
  firmware: { ring: "bg-purple-500/20 text-purple-300 ring-1 ring-inset ring-purple-500/40", dot: "bg-purple-500" },
  inspection: { ring: "bg-amber-500/20 text-amber-300 ring-1 ring-inset ring-amber-500/40", dot: "bg-amber-500" },
  work_order: { ring: "bg-cyan-500/20 text-cyan-300 ring-1 ring-inset ring-cyan-500/40", dot: "bg-cyan-500" },
  other: { ring: "bg-slate-500/20 text-ink-soft ring-1 ring-inset ring-slate-500/40", dot: "bg-slate-500" },
};

function toneFor(ev: CalendarEventRow) {
  if (effectiveStatus(ev) === "overdue") {
    return {
      ring: "bg-red-500/20 text-red-300 ring-1 ring-inset ring-red-500/40",
      dot: "bg-red-500",
    };
  }
  return EVENT_TONE[ev.event_type] ?? EVENT_TONE.other;
}

export function CalendarView({
  events,
  isStaff,
}: {
  events: CalendarEventRow[];
  isStaff: boolean;
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const cells = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const list: { date: Date; inMonth: boolean }[] = [];
    for (let i = firstDow - 1; i >= 0; i--) {
      list.push({ date: new Date(year, month - 1, prevMonthDays - i), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (list.length < 42) {
      const last = list[list.length - 1].date;
      list.push({
        date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
        inMonth: false,
      });
    }
    return list;
  }, [year, month]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventRow[]>();
    for (const ev of events) {
      const list = map.get(ev.event_date) ?? [];
      list.push(ev);
      map.set(ev.event_date, list);
    }
    return map;
  }, [events]);

  const upcoming = useMemo(() => {
    const today = toISO(new Date());
    return events
      .filter((e) => e.event_date >= today && e.status !== "completed")
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
      .slice(0, 8);
  }, [events]);

  function handleComplete(id: string) {
    setPendingId(id);
    startTransition(async () => {
      try {
        await markEventCompleted(id);
      } finally {
        setPendingId(null);
      }
    });
  }

  const fmtShort = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
          <div className="font-semibold text-ink">
            {MONTHS[month]} {year}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="grid h-8 w-8 place-items-center rounded-md border border-hairline text-ink-soft hover:bg-surface-2"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              }}
              className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-soft hover:bg-surface-2"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="grid h-8 w-8 place-items-center rounded-md border border-hairline text-ink-soft hover:bg-surface-2"
            >
              ›
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-hairline">
          {DAYS.map((d) => (
            <div
              key={d}
              className="px-3 py-2 text-[10px] font-semibold tracking-widest text-slate-500"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const iso = toISO(cell.date);
            const dayEvents = eventsByDate.get(iso) ?? [];
            return (
              <div
                key={i}
                className={`min-h-[92px] border-b border-r border-hairline p-2 ${
                  cell.inMonth ? "" : "bg-surface-2/40"
                }`}
              >
                <div
                  className={`mb-1 text-xs font-medium ${
                    cell.inMonth ? "text-ink-soft" : "text-slate-600"
                  }`}
                >
                  {cell.date.getDate()}
                </div>
                <div className="space-y-1">
                  {dayEvents.map((ev) => {
                    const t = toneFor(ev);
                    return (
                      <div
                        key={ev.id}
                        title={`${ev.title}${ev.asset_tag ? ` · ${ev.asset_tag}` : ""}`}
                        className={`flex items-center gap-1 truncate rounded px-1.5 py-1 text-[10px] ${t.ring}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
                        <span className="truncate">
                          {ev.title}
                          {ev.asset_tag ? ` · ${ev.asset_tag}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="h-fit overflow-hidden rounded-xl border border-hairline bg-surface">
        <div className="border-b border-hairline px-6 py-4 font-semibold text-ink">
          Upcoming
        </div>
        <div className="divide-y divide-hairline">
          {upcoming.length === 0 && (
            <div className="px-6 py-6 text-sm text-slate-500">
              No upcoming events.
            </div>
          )}
          {upcoming.map((ev) => {
            const t = toneFor(ev);
            const busy = isPending && pendingId === ev.id;
            const parts = fmtShort(ev.event_date).split(" ");
            return (
              <div key={ev.id} className="flex gap-3 px-6 py-4">
                <div className="w-12 shrink-0">
                  <div className="text-[10px] font-semibold tracking-widest text-slate-500">
                    {parts[0]?.toUpperCase()}
                  </div>
                  <div className="text-lg font-semibold leading-tight text-ink">
                    {parts[1]}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                    <div className="truncate text-sm font-medium text-ink">
                      {ev.title}
                      {ev.event_type ? ` · ${ev.event_type.replace("_", " ")}` : ""}
                    </div>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {ev.asset_tag}
                    {ev.asset_tag && ev.organization_name ? " · " : ""}
                    {ev.organization_name}
                  </div>
                  {isStaff && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleComplete(ev.id)}
                      className="mt-1 text-xs text-blue-400 hover:underline disabled:opacity-50"
                    >
                      Mark Completed
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
