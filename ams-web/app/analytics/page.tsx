import type { ReactNode } from "react";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { SLA_RESOLUTION_TARGET_HOURS } from "@/lib/sla";
import { getAnalytics, type MonthlyAnalytics } from "@/lib/analytics";

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function uptimeTone(pct: number | null): string {
  if (pct === null) return "bg-surface-2";
  if (pct >= 98) return "bg-emerald-400";
  if (pct >= 90) return "bg-amber-400";
  return "bg-red-400";
}

function mttrTone(hours: number | null): string {
  if (hours === null) return "bg-surface-2";
  return hours <= SLA_RESOLUTION_TARGET_HOURS ? "bg-emerald-400" : "bg-red-400";
}

export default async function AnalyticsPage() {
  const profile = await getProfile();
  const isStaff = isStaffRole(profile?.role);
  const { months, totals } = await getAnalytics();

  return (
    <AppShell
      profile={profile}
      title="Trends & Analytics"
      subtitle={
        isStaff
          ? "Fleet-wide uptime, ticket volume, and repair time — the numbers a client's management sees."
          : "Your fleet's uptime, ticket volume, and repair time — for referencing against the service contract."
      }
      actions={
        <a
          href="/api/reports/analytics/export"
          className="whitespace-nowrap rounded-lg border border-hairline bg-surface-2 px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          Export CSV
        </a>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Avg Uptime"
          value={totals.avgUptimePct === null ? "—" : `${totals.avgUptimePct}%`}
          tone="good"
        />
        <KpiCard label="Tickets — 6 mo" value={totals.ticketsOpened} />
        <KpiCard label="Tickets Resolved" value={totals.ticketsResolved} />
        <KpiCard label="Avg Repair Time" value={formatHours(totals.avgMttrHours)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <UptimeChart months={months} />
        <TicketVolumeChart months={months} />
        <MttrChart months={months} />
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Uptime is reconstructed from each asset&apos;s status history and
        reflects the share of assets recorded as operational at the end of
        each month. Repair time is the average from ticket opened to
        resolved, for tickets closed in that month. Six-month trailing
        window.
      </p>
    </AppShell>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good";
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold ${tone === "good" ? "text-emerald-400" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          {title}
        </h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function MonthAxis({ months }: { months: MonthlyAnalytics[] }) {
  return (
    <div className="mt-2 flex gap-2">
      {months.map((m) => (
        <span key={m.label} className="flex-1 text-center text-[11px] text-slate-500">
          {m.label}
        </span>
      ))}
    </div>
  );
}

function UptimeChart({ months }: { months: MonthlyAnalytics[] }) {
  const hasData = months.some((m) => m.uptimePct !== null);
  return (
    <ChartCard title="Uptime %" subtitle="Assets operational, month-end snapshot">
      {!hasData && (
        <p className="mb-3 text-xs text-slate-500">
          No confirmed status history yet — this fills in as assets pick up
          audit history.
        </p>
      )}
      <div className="flex h-40 items-end gap-2 border-b border-hairline pb-2">
        {months.map((m) => (
          <div key={m.label} className="flex flex-1 flex-col items-center justify-end gap-2">
            <span className="text-xs font-medium text-ink-soft">
              {m.uptimePct === null ? "—" : `${m.uptimePct}%`}
            </span>
            <div className="flex h-28 w-full items-end">
              <div
                className={`w-full rounded-t ${uptimeTone(m.uptimePct)}`}
                style={{ height: `${m.uptimePct === null ? 4 : Math.max(m.uptimePct, 4)}%` }}
                title={
                  m.uptimePct === null
                    ? "No confirmed status this month"
                    : `${m.uptimePct}% of ${m.assetsTracked} assets operational`
                }
              />
            </div>
          </div>
        ))}
      </div>
      <MonthAxis months={months} />
    </ChartCard>
  );
}

function TicketVolumeChart({ months }: { months: MonthlyAnalytics[] }) {
  const max = Math.max(1, ...months.map((m) => Math.max(m.ticketsOpened, m.ticketsResolved)));
  return (
    <ChartCard title="Ticket Volume" subtitle="Opened vs resolved, per month">
      <div className="flex h-40 items-end gap-2 border-b border-hairline pb-2">
        {months.map((m) => (
          <div key={m.label} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-medium text-ink-soft">
              {m.ticketsOpened}/{m.ticketsResolved}
            </span>
            <div className="flex h-28 w-full items-end justify-center gap-1">
              <div
                className="w-2.5 rounded-t bg-blue-400"
                style={{ height: `${Math.max((m.ticketsOpened / max) * 100, m.ticketsOpened ? 4 : 0)}%` }}
                title={`${m.ticketsOpened} opened`}
              />
              <div
                className="w-2.5 rounded-t bg-emerald-400"
                style={{ height: `${Math.max((m.ticketsResolved / max) * 100, m.ticketsResolved ? 4 : 0)}%` }}
                title={`${m.ticketsResolved} resolved`}
              />
            </div>
          </div>
        ))}
      </div>
      <MonthAxis months={months} />
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-blue-400" /> Opened
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-400" /> Resolved
        </span>
      </div>
    </ChartCard>
  );
}

function MttrChart({ months }: { months: MonthlyAnalytics[] }) {
  const max = Math.max(1, ...months.map((m) => m.mttrHours ?? 0));
  return (
    <ChartCard
      title="Mean Time to Repair"
      subtitle={`Avg hours open to resolved · target ${SLA_RESOLUTION_TARGET_HOURS}h`}
    >
      <div className="flex h-40 items-end gap-2 border-b border-hairline pb-2">
        {months.map((m) => (
          <div key={m.label} className="flex flex-1 flex-col items-center justify-end gap-2">
            <span className="text-xs font-medium text-ink-soft">
              {formatHours(m.mttrHours)}
            </span>
            <div className="flex h-28 w-full items-end">
              <div
                className={`w-full rounded-t ${mttrTone(m.mttrHours)}`}
                style={{
                  height: `${m.mttrHours === null ? 4 : Math.max((m.mttrHours / max) * 100, 4)}%`,
                }}
                title={
                  m.mttrHours === null
                    ? "No tickets resolved this month"
                    : `${m.mttrHours.toFixed(1)}h avg (${m.ticketsResolved} resolved)`
                }
              />
            </div>
          </div>
        ))}
      </div>
      <MonthAxis months={months} />
    </ChartCard>
  );
}
