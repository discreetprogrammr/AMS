"use client";

// Dashboard widget cards (schema_step45.sql follow-up). Moved here from
// app/dashboard/page.tsx and marked "use client" specifically so each
// card can react to its OWN size preset (chosen live via
// dashboard-grid.tsx's size picker, client-side state) and show more or
// less detail accordingly — a Server Component's output is already
// "baked" by the time it reaches the browser, so reacting to a size that
// changes after the initial render requires these to actually run on the
// client. All the data these take in (counts, arrays, strings) is still
// computed server-side in page.tsx exactly as before; only the rendering
// moved.
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { assetLabel } from "@/lib/format";
import type { WidgetSize } from "./actions";

export type { WidgetSize };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "warn" | "good";
}) {
  return (
    <div className="flex h-full flex-col justify-center rounded-xl border border-hairline bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === "warn" ? "text-amber-400" : tone === "good" ? "text-emerald-400" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V8Z" />
    </svg>
  );
}

export function ActiveTicketsCard({
  openCount,
  inProgressCount,
  partsPendingCount,
  resolvedCount,
  size,
}: {
  openCount: number;
  inProgressCount: number;
  partsPendingCount: number;
  resolvedCount: number;
  size: WidgetSize;
}) {
  const activeCount = openCount + inProgressCount + partsPendingCount;

  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span className="text-blue-400">
          <TicketIcon />
        </span>
        Active Support Tickets
      </h2>

      <p className="text-3xl font-semibold text-ink">
        {activeCount}
        <span className="ml-2 text-sm font-normal text-slate-500">active</span>
      </p>

      {size !== "sm" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-400">
            {openCount} Open
          </span>
          <span className="inline-flex items-center rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-semibold text-blue-400">
            {inProgressCount} In Progress
          </span>
          <span className="inline-flex items-center rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-400">
            {partsPendingCount} Parts Pending
          </span>
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            {resolvedCount} Closed
          </span>
        </div>
      )}

      {size === "lg" && (
        <Link href="/tickets" className="mt-4 inline-block text-sm text-blue-400 hover:underline">
          View ticket queue
        </Link>
      )}
    </div>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

export function EquipmentHealthCard({
  totalAssets,
  operationalCount,
  attentionCount,
  downCount,
  unserviceableCount,
  size,
}: {
  totalAssets: number;
  operationalCount: number;
  attentionCount: number;
  downCount: number;
  unserviceableCount: number;
  size: WidgetSize;
}) {
  const needsAttention = attentionCount + downCount + unserviceableCount;
  const operationalPct = totalAssets ? Math.round((operationalCount / totalAssets) * 100) : 0;
  const healthy = needsAttention === 0;

  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span className="text-emerald-400">
          <PulseIcon />
        </span>
        System & Equipment Health
      </h2>

      <p className="flex items-center gap-2 text-lg font-semibold text-ink">
        <span className={`h-2.5 w-2.5 rounded-full ${healthy ? "bg-emerald-400" : "bg-amber-400"}`} />
        {healthy ? "All units operational" : `${needsAttention} unit${needsAttention === 1 ? "" : "s"} needs attention`}
      </p>

      {size !== "sm" && (
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${healthy ? "bg-emerald-400" : "bg-amber-400"}`}
            style={{ width: `${operationalPct}%` }}
          />
        </div>
      )}

      {size === "lg" && (
        <p className="mt-2 text-sm text-slate-500">
          {operationalCount} of {totalAssets} units reporting operational
        </p>
      )}
    </div>
  );
}

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  return `${hours.toFixed(1)}h`;
}

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm0-6-4-4" />
    </svg>
  );
}

export function SlaPerformanceCard({
  slaPct,
  avgResponseHours,
  avgResolutionHours,
  measuredCount,
  responseTargetHours,
  resolutionTargetHours,
  size,
}: {
  slaPct: number | null;
  avgResponseHours: number | null;
  avgResolutionHours: number | null;
  measuredCount: number;
  responseTargetHours: number;
  resolutionTargetHours: number;
  size: WidgetSize;
}) {
  const pct = slaPct ?? 0;
  const circumference = 2 * Math.PI * 34;
  const offset = circumference * (1 - pct / 100);
  const ringColor =
    slaPct === null ? "stroke-slate-600" : slaPct >= 80 ? "stroke-emerald-400" : slaPct >= 50 ? "stroke-amber-400" : "stroke-red-400";

  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span className="text-blue-400">
          <GaugeIcon />
        </span>
        SLA Performance
      </h2>

      <div className="flex items-center gap-5">
        <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90">
          <circle cx="40" cy="40" r="34" fill="none" strokeWidth="8" className="stroke-surface-2" />
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={ringColor}
          />
        </svg>
        <div>
          <p className="text-2xl font-semibold text-ink">{slaPct === null ? "—" : `${slaPct}%`}</p>
          <p className="text-xs text-slate-500">resolved within {resolutionTargetHours}h target</p>
        </div>
      </div>

      {size !== "sm" && (
        <dl className="mt-4 space-y-1.5 border-t border-hairline pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Avg First Response</dt>
            <dd className="font-medium text-ink">{formatHours(avgResponseHours)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Avg Resolution</dt>
            <dd className="font-medium text-ink">{formatHours(avgResolutionHours)}</dd>
          </div>
        </dl>
      )}

      {size === "lg" && (
        <p className="mt-3 text-xs text-slate-500">
          {measuredCount} ticket{measuredCount === 1 ? "" : "s"} resolved · last 30 days · target {responseTargetHours}h
          response / {resolutionTargetHours}h resolution
        </p>
      )}
    </div>
  );
}

function TrendUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="m22 7-8.5 8.5-5-5L2 17M22 7h-6M22 7v6" />
    </svg>
  );
}

function barTone(pct: number | null): string {
  if (pct === null) return "bg-surface-2";
  if (pct >= 80) return "bg-emerald-400";
  if (pct >= 50) return "bg-amber-400";
  return "bg-red-400";
}

export function SlaHistoryCard({
  history,
  resolutionTargetHours,
  size,
}: {
  history: { label: string; pct: number | null; count: number }[];
  resolutionTargetHours: number;
  size: WidgetSize;
}) {
  const hasAnyData = history.some((week) => week.count > 0);
  const latest = history[history.length - 1];

  if (size === "sm") {
    return (
      <div className="flex h-full flex-col justify-center rounded-xl border border-hairline bg-surface p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
          <span className="text-blue-400">
            <TrendUpIcon />
          </span>
          SLA This Week
        </h2>
        <p className="text-2xl font-semibold text-ink">{latest?.pct === null || latest === undefined ? "—" : `${latest.pct}%`}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
          <span className="text-blue-400">
            <TrendUpIcon />
          </span>
          SLA Historical Performance
        </h2>
        {size === "lg" && (
          <span className="text-xs text-slate-500">Weekly compliance vs {resolutionTargetHours}h resolution target</span>
        )}
      </div>

      {!hasAnyData && size === "lg" && (
        <p className="mb-3 text-xs text-slate-500">
          No resolved tickets in the last 5 weeks yet — the chart will fill in as tickets get resolved.
        </p>
      )}

      <div className="flex h-28 items-end gap-3 border-b border-hairline pb-2">
        {history.map((week) => (
          <div key={week.label} className="flex flex-1 flex-col items-center justify-end gap-2">
            <span className="text-xs font-medium text-ink-soft">{week.pct === null ? "—" : `${week.pct}%`}</span>
            <div className="flex h-20 w-full items-end">
              <div
                className={`w-full rounded-t ${barTone(week.pct)}`}
                style={{ height: `${week.pct === null ? 4 : Math.max(week.pct, 4)}%` }}
                title={week.count ? `${week.pct}% of ${week.count} resolved` : "No tickets resolved this week"}
              />
            </div>
          </div>
        ))}
      </div>
      {size === "lg" && (
        <div className="mt-2 flex gap-3">
          {history.map((week) => (
            <span key={week.label} className="flex-1 text-center text-xs text-slate-500">
              {week.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h4M9 11V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4m-6 0h6m-6 0v11m6-11v11m0-11h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4" />
    </svg>
  );
}

export type ActivityItem = {
  id: number;
  label: string;
  sub: string;
  status?: string;
  href?: string;
  when: string;
  who: string;
};

const ROWS_BY_SIZE: Record<WidgetSize, number> = { sm: 2, md: 4, lg: 8 };

export function RecentActivityCard({ items, size }: { items: ActivityItem[]; size: WidgetSize }) {
  const shown = items.slice(0, ROWS_BY_SIZE[size]);
  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span className="text-emerald-400">
          <ActivityIcon />
        </span>
        Recent Activity
      </h2>

      {shown.length ? (
        <ul className="divide-y divide-hairline text-sm">
          {shown.map((item) => {
            const inner = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{item.label}</span>
                  <span className="whitespace-nowrap text-xs text-slate-500">
                    {new Date(item.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                {size !== "sm" && (
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <span>{item.sub}</span>
                    {item.status && <StatusBadge status={item.status} />}
                  </div>
                )}
              </>
            );
            return (
              <li key={item.id} className="py-2.5">
                {item.href ? (
                  <Link href={item.href} className="block hover:text-ink">
                    {inner}
                  </Link>
                ) : (
                  <div>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No activity recorded yet.</p>
      )}
    </div>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="m14.7 6.3 3 3L19 8l1-1a4 4 0 0 0-5-5l-1 1 .7 .7ZM14.7 6.3 5 16l-1 4 4-1L17.7 9.3" />
    </svg>
  );
}

function TicketQueueIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8.1 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

export function QuickActionCenterCard({ size }: { size: WidgetSize }) {
  const actions = [
    { href: "/tickets/new", label: "Request New Service", icon: <WrenchIcon />, primary: true },
    { href: "/tickets", label: "Open Support Ticket", icon: <TicketQueueIcon />, primary: false },
    { href: "/messages", label: "Chat / Start Live Call", icon: <PhoneIcon />, primary: false },
  ];
  const shown = size === "sm" ? actions.slice(0, 1) : size === "md" ? actions.slice(0, 2) : actions;

  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span className="text-purple-400">
          <WrenchIcon />
        </span>
        Quick Action Center
      </h2>

      <div className="flex flex-col gap-2.5">
        {shown.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={
              a.primary
                ? "flex items-center gap-2 rounded-lg bg-blue-600/90 px-4 py-2.5 text-sm font-medium text-ink hover:bg-blue-500"
                : "flex items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface"
            }
          >
            {a.icon}
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function EquipmentAlertsCard({
  assets,
  size,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets: any[];
  size: WidgetSize;
}) {
  const shown = assets.slice(0, ROWS_BY_SIZE[size]);
  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">Equipment Needing Attention</h2>
      {shown.length ? (
        <ul className="divide-y divide-hairline text-sm">
          {shown.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <Link href={`/assets/${a.id}`} className="truncate font-medium text-ink hover:underline">
                  {assetLabel(a)}
                </Link>
              </div>
              <StatusBadge status={a.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">All your equipment is operational.</p>
      )}
    </div>
  );
}

export function ServiceDueCard({
  assets,
  size,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets: any[];
  size: WidgetSize;
}) {
  const shown = assets.slice(0, ROWS_BY_SIZE[size]);
  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">Service Due — Next 30 Days</h2>
      {shown.length ? (
        <ul className="divide-y divide-hairline text-sm">
          {shown.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2">
              <Link href={`/assets/${a.id}`} className="font-medium text-ink hover:underline">
                {assetLabel(a)}
              </Link>
              <span className={a.next_service_due < today() ? "font-medium text-red-400" : "text-slate-500"}>
                {a.next_service_due}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nothing due in the next 30 days.</p>
      )}
    </div>
  );
}

export type ComplianceItem = { key: string; assetLabel: string; label: string; date: string };

export function ComplianceWarrantyCard({ items, size }: { items: ComplianceItem[]; size: WidgetSize }) {
  const shown = items.slice(0, ROWS_BY_SIZE[size]);
  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">Compliance & Warranty — Next 30 Days</h2>
      {shown.length ? (
        <ul className="divide-y divide-hairline text-sm">
          {shown.map((item) => (
            <li key={item.key} className="flex items-center justify-between py-2">
              <span className="text-ink-soft">
                {item.assetLabel} — {item.label}
              </span>
              <span
                className={
                  item.date < today()
                    ? "font-medium text-red-400"
                    : item.date <= daysFromNow(7)
                      ? "font-medium text-amber-400"
                      : "text-slate-500"
                }
              >
                {item.date}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No certificates or warranties expiring soon.</p>
      )}
    </div>
  );
}
