import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { NotificationBell } from "@/components/notification-bell";
import { SearchBar } from "@/components/search-bar";
import { ticketRef } from "@/lib/format";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// SLA targets — not a contractual figure yet, just the working target we're
// building the dashboard against until a real client SLA is signed.
const SLA_RESPONSE_TARGET_HOURS = 8;
const SLA_RESOLUTION_TARGET_HOURS = 48;

function hoursBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const profile = await getProfile();
  const isStaff = isStaffRole(profile?.role);

  const [
    { count: totalAssets },
    { count: operationalCount },
    { count: attentionCount },
    { count: downCount },
    { count: unserviceableCount },
    { data: expiringCerts, count: expiringCertsCount },
    { data: dueAssets },
    { count: openTicketsCount },
    { count: inProgressTicketsCount },
    { count: partsPendingTicketsCount },
    { count: resolvedTicketsCount },
    { data: slaTickets },
    { data: slaHistoryTickets },
    { data: recentActivity },
    { count: unreadAlertsCount },
    { data: latestAlerts },
  ] = await Promise.all([
    supabase.from("assets").select("*", { count: "exact", head: true }),
    supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("status", "operational"),
    supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("status", "attention"),
    supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("status", "down"),
    supabase
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("status", "unserviceable"),
    supabase
      .from("compliance_certificates")
      .select("id, certificate_type, expiry_date, assets(asset_tag)", {
        count: "exact",
      })
      .lte("expiry_date", daysFromNow(30))
      .order("expiry_date", { ascending: true }),
    supabase
      .from("assets")
      .select("id, asset_tag, next_service_due")
      .not("next_service_due", "is", null)
      .lte("next_service_due", daysFromNow(30))
      .order("next_service_due", { ascending: true }),
    supabase
      .from("service_tickets")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("service_tickets")
      .select("*", { count: "exact", head: true })
      .eq("status", "in_progress"),
    supabase
      .from("service_tickets")
      .select("*", { count: "exact", head: true })
      .eq("status", "parts_pending"),
    supabase
      .from("service_tickets")
      .select("*", { count: "exact", head: true })
      .eq("status", "closed"),
    supabase
      .from("service_tickets")
      .select("id, created_at, first_response_at, resolved_at")
      .gte("created_at", daysAgo(30)),
    supabase
      .from("service_tickets")
      .select("id, created_at, resolved_at")
      .not("resolved_at", "is", null)
      .gte("resolved_at", daysAgo(35)),
    // RLS restricts this to staff only — a client_viewer's query just comes
    // back empty, no error, so it's safe to always run this. new_data is a
    // full row snapshot (see log_audit() in schema.sql), so table-specific
    // fields like an asset's asset_tag are already right there — no extra
    // join needed for most rows.
    supabase
      .from("audit_log")
      .select(
        "id, table_name, record_id, action, changed_at, old_data, new_data, profiles(full_name)",
      )
      .order("changed_at", { ascending: false })
      .limit(8),
    // Same RLS note as audit_log above — alerts is staff-only (Step 10), so
    // a client_viewer's query just comes back with count 0, no error.
    supabase
      .from("alerts")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false),
    // Feeds the bell's dropdown — same RLS note applies (staff-only table,
    // client_viewer just gets an empty array back).
    supabase
      .from("alerts")
      .select("id, title, severity, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const operationalPct = totalAssets
    ? Math.round(((operationalCount ?? 0) / totalAssets) * 100)
    : 0;

  const respondedTickets = (slaTickets ?? []).filter(
    (t) => t.first_response_at,
  );
  const avgResponseHours = respondedTickets.length
    ? respondedTickets.reduce(
        (sum, t) => sum + hoursBetween(t.created_at, t.first_response_at!),
        0,
      ) / respondedTickets.length
    : null;

  const resolvedInPeriod = (slaTickets ?? []).filter((t) => t.resolved_at);
  const avgResolutionHours = resolvedInPeriod.length
    ? resolvedInPeriod.reduce(
        (sum, t) => sum + hoursBetween(t.created_at, t.resolved_at!),
        0,
      ) / resolvedInPeriod.length
    : null;
  const metResolutionTarget = resolvedInPeriod.filter(
    (t) => hoursBetween(t.created_at, t.resolved_at!) <= SLA_RESOLUTION_TARGET_HOURS,
  ).length;
  const slaPct = resolvedInPeriod.length
    ? Math.round((metResolutionTarget / resolvedInPeriod.length) * 100)
    : null;

  // Last 5 rolling 7-day windows, oldest first, matching the reference
  // chart's W-4/W-3/W-2/W-1/This wk axis. Bucketed by resolved_at, since
  // that's the natural axis for "how did we perform closing tickets that
  // week" — a week with zero resolutions shows as no data, not a fake 0%.
  const weekBuckets = Array.from({ length: 5 }, (_, i) => {
    const weeksFromNow = 4 - i;
    const end = new Date();
    end.setDate(end.getDate() - weeksFromNow * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return {
      label: weeksFromNow === 0 ? "This wk" : `W-${weeksFromNow}`,
      start,
      end,
    };
  });

  const slaHistory = weekBuckets.map((bucket) => {
    const ticketsInWeek = (slaHistoryTickets ?? []).filter((t) => {
      const resolvedAt = new Date(t.resolved_at!);
      return resolvedAt >= bucket.start && resolvedAt < bucket.end;
    });
    const met = ticketsInWeek.filter(
      (t) =>
        hoursBetween(t.created_at, t.resolved_at!) <=
        SLA_RESOLUTION_TARGET_HOURS,
    ).length;
    return {
      label: bucket.label,
      pct: ticketsInWeek.length
        ? Math.round((met / ticketsInWeek.length) * 100)
        : null,
      count: ticketsInWeek.length,
    };
  });

  // audit_log rows only carry a generic record_id — for ticket rows that
  // means an asset_id but not the asset's tag/org, so do one small
  // follow-up lookup for whatever assets this page of activity touches.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditRows = (recentActivity ?? []) as any[];
  const ticketAssetIds = Array.from(
    new Set(
      auditRows
        .filter((row) => row.table_name === "service_tickets")
        .map((row) => row.new_data?.asset_id ?? row.old_data?.asset_id)
        .filter(Boolean),
    ),
  );
  const { data: activityAssets } = ticketAssetIds.length
    ? await supabase
        .from("assets")
        .select("id, asset_tag, organizations(name)")
        .in("id", ticketAssetIds)
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ data: [] as any[] } as { data: any[] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetById = new Map((activityAssets ?? []).map((a: any) => [a.id, a]));

  const activityItems = auditRows.map((row) => {
    const data = row.new_data ?? row.old_data ?? {};
    const who = row.profiles?.full_name ?? "System";
    const base = { id: row.id, when: row.changed_at, who };

    if (row.table_name === "assets") {
      const verb =
        row.action === "INSERT"
          ? "Asset Added"
          : row.action === "DELETE"
            ? "Asset Removed"
            : "Asset Updated";
      return {
        ...base,
        label: verb,
        sub: data.asset_tag ?? "—",
        status: data.status as string | undefined,
        href: `/assets/${row.record_id}`,
      };
    }

    if (row.table_name === "service_tickets") {
      const asset = assetById.get(data.asset_id);
      const verb =
        row.action === "INSERT"
          ? "Ticket Opened"
          : data.status === "closed"
            ? "Ticket Closed"
            : data.status === "parts_pending"
              ? "Ticket Parts Pending"
              : data.status === "in_progress"
                ? "Ticket In Progress"
                : "Ticket Updated";
      return {
        ...base,
        label: `${verb} — ${ticketRef(row.record_id)}`,
        sub: asset
          ? `${asset.asset_tag}${asset.organizations?.name ? " — " + asset.organizations.name : ""}`
          : "—",
        status: data.status as string | undefined,
        href: asset ? `/assets/${asset.id}` : undefined,
      };
    }

    if (row.table_name === "inventory_cycles") {
      const verb =
        row.action === "INSERT"
          ? "Inventory Cycle Started"
          : data.status === "completed"
            ? "Inventory Cycle Completed"
            : "Inventory Cycle Updated";
      return {
        ...base,
        label: verb,
        sub: data.label ?? "—",
        status: data.status as string | undefined,
        href: `/inventory/${row.record_id}`,
      };
    }

    // service_records or anything else logged in the future — generic
    // fallback so a new audited table doesn't just disappear from the feed.
    return {
      ...base,
      label: `${row.table_name} ${String(row.action).toLowerCase()}`,
      sub: "—",
      status: undefined,
      href: undefined,
    };
  });

  return (
    <AppShell
      profile={profile}
      title={isStaff ? "Operations Control Center" : "Fleet Overview"}
      subtitle={
        isStaff
          ? "Fleet-wide oversight across clients, machines, and tickets."
          : "Your fleet's health, support tickets, and SLA performance."
      }
      actions={
        <>
          <SearchBar action="/assets" placeholder="Search assets…" />
          <NotificationBell
            href="/alerts"
            count={unreadAlertsCount ?? 0}
            alerts={latestAlerts ?? []}
            activities={activityItems.slice(0, 5)}
          />
        </>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total Assets" value={totalAssets ?? 0} />
        <KpiCard label="% Operational" value={`${operationalPct}%`} tone="good" />
        <KpiCard label="Attention" value={attentionCount ?? 0} />
        <KpiCard
          label="Down"
          value={downCount ?? 0}
          tone={downCount ? "warn" : undefined}
        />
        <KpiCard
          label="Unserviceable"
          value={unserviceableCount ?? 0}
          tone={unserviceableCount ? "warn" : undefined}
        />
        <KpiCard
          label="Certs Expiring <30d"
          value={expiringCertsCount ?? 0}
          tone={expiringCertsCount ? "warn" : undefined}
        />
      </div>

      {/* Active Support Tickets + SLA Performance are client-visible too —
          RLS already scopes every underlying query to just their own org,
          so this is a pure UI-gating decision, not a data one. Equipment
          Health just repeats the top KPI row (staff-only, not worth the
          duplication for clients), and Quick Action Center's "Request New
          Service" link goes to the staff-only global ticket form, so both
          stay staff-only. */}
      <div
        className={`mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 ${
          isStaff ? "lg:grid-cols-4" : "lg:grid-cols-2"
        }`}
      >
        <ActiveTicketsCard
          openCount={openTicketsCount ?? 0}
          inProgressCount={inProgressTicketsCount ?? 0}
          partsPendingCount={partsPendingTicketsCount ?? 0}
          resolvedCount={resolvedTicketsCount ?? 0}
        />
        <SlaPerformanceCard
          slaPct={slaPct}
          avgResponseHours={avgResponseHours}
          avgResolutionHours={avgResolutionHours}
          measuredCount={resolvedInPeriod.length}
        />
        {isStaff && (
          <EquipmentHealthCard
            totalAssets={totalAssets ?? 0}
            operationalCount={operationalCount ?? 0}
            attentionCount={attentionCount ?? 0}
            downCount={downCount ?? 0}
            unserviceableCount={unserviceableCount ?? 0}
          />
        )}
        {isStaff && <QuickActionCenterCard />}
      </div>

      {/* SLA Historical Performance is client-visible too, for the same
          reason as above — Recent Activity reads the audit trail
          (schema_step22b.sql restricted that to Super Admin), which isn't
          appropriate to show an external client regardless. */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className={isStaff ? "lg:col-span-2" : "lg:col-span-3"}>
          <SlaHistoryCard history={slaHistory} />
        </div>
        {isStaff && <RecentActivityCard items={activityItems} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Service Due — Next 30 Days
          </h2>
          {dueAssets?.length ? (
            <ul className="divide-y divide-hairline text-sm">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {dueAssets.map((a: any) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between py-2"
                >
                  <Link
                    href={`/assets/${a.id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {a.asset_tag}
                  </Link>
                  <span
                    className={
                      a.next_service_due < today()
                        ? "font-medium text-red-400"
                        : "text-slate-500"
                    }
                  >
                    {a.next_service_due}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              Nothing due in the next 30 days.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Certificates Expiring — Next 30 Days
          </h2>
          {expiringCerts?.length ? (
            <ul className="divide-y divide-hairline text-sm">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {expiringCerts.map((c: any) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-ink-soft">
                    {c.assets?.asset_tag ?? "—"} — {c.certificate_type}
                  </span>
                  <span
                    className={
                      c.expiry_date < today()
                        ? "font-medium text-red-400"
                        : "text-slate-500"
                    }
                  >
                    {c.expiry_date}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No certificates expiring soon.
            </p>
          )}
        </div>
      </div>
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
  tone?: "warn" | "good";
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === "warn"
            ? "text-amber-400"
            : tone === "good"
              ? "text-emerald-400"
              : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TicketIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V8Z" />
    </svg>
  );
}

function ActiveTicketsCard({
  openCount,
  inProgressCount,
  partsPendingCount,
  resolvedCount,
}: {
  openCount: number;
  inProgressCount: number;
  partsPendingCount: number;
  resolvedCount: number;
}) {
  const activeCount = openCount + inProgressCount + partsPendingCount;

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
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

      <Link
        href="/tickets"
        className="mt-4 inline-block text-sm text-blue-400 hover:underline"
      >
        View ticket queue
      </Link>
    </div>
  );
}

function PulseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function EquipmentHealthCard({
  totalAssets,
  operationalCount,
  attentionCount,
  downCount,
  unserviceableCount,
}: {
  totalAssets: number;
  operationalCount: number;
  attentionCount: number;
  downCount: number;
  unserviceableCount: number;
}) {
  const needsAttention = attentionCount + downCount + unserviceableCount;
  const operationalPct = totalAssets
    ? Math.round((operationalCount / totalAssets) * 100)
    : 0;
  const healthy = needsAttention === 0;

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span className="text-emerald-400">
          <PulseIcon />
        </span>
        System & Equipment Health
      </h2>

      <p className="flex items-center gap-2 text-lg font-semibold text-ink">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            healthy ? "bg-emerald-400" : "bg-amber-400"
          }`}
        />
        {healthy
          ? "All units operational"
          : `${needsAttention} unit${needsAttention === 1 ? "" : "s"} needs attention`}
      </p>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${healthy ? "bg-emerald-400" : "bg-amber-400"}`}
          style={{ width: `${operationalPct}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-slate-500">
        {operationalCount} of {totalAssets} units reporting operational
      </p>
    </div>
  );
}

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  return `${hours.toFixed(1)}h`;
}

function GaugeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm0-6-4-4" />
    </svg>
  );
}

function SlaPerformanceCard({
  slaPct,
  avgResponseHours,
  avgResolutionHours,
  measuredCount,
}: {
  slaPct: number | null;
  avgResponseHours: number | null;
  avgResolutionHours: number | null;
  measuredCount: number;
}) {
  const pct = slaPct ?? 0;
  const circumference = 2 * Math.PI * 34;
  const offset = circumference * (1 - pct / 100);
  const ringColor =
    slaPct === null
      ? "stroke-slate-600"
      : slaPct >= 80
        ? "stroke-emerald-400"
        : slaPct >= 50
          ? "stroke-amber-400"
          : "stroke-red-400";

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span className="text-blue-400">
          <GaugeIcon />
        </span>
        SLA Performance
      </h2>

      <div className="flex items-center gap-5">
        <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90">
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            strokeWidth="8"
            className="stroke-surface-2"
          />
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
          <p className="text-2xl font-semibold text-ink">
            {slaPct === null ? "—" : `${slaPct}%`}
          </p>
          <p className="text-xs text-slate-500">
            resolved within {SLA_RESOLUTION_TARGET_HOURS}h target
          </p>
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 border-t border-hairline pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Avg First Response</dt>
          <dd className="font-medium text-ink">
            {formatHours(avgResponseHours)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Avg Resolution</dt>
          <dd className="font-medium text-ink">
            {formatHours(avgResolutionHours)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-slate-500">
        {measuredCount} ticket{measuredCount === 1 ? "" : "s"} resolved · last
        30 days · target {SLA_RESPONSE_TARGET_HOURS}h response /{" "}
        {SLA_RESOLUTION_TARGET_HOURS}h resolution
      </p>
    </div>
  );
}

function WrenchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="m14.7 6.3 3 3L19 8l1-1a4 4 0 0 0-5-5l-1 1 .7 .7ZM14.7 6.3 5 16l-1 4 4-1L17.7 9.3" />
    </svg>
  );
}

function TrendUpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
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

function SlaHistoryCard({
  history,
}: {
  history: { label: string; pct: number | null; count: number }[];
}) {
  const hasAnyData = history.some((week) => week.count > 0);

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
          <span className="text-blue-400">
            <TrendUpIcon />
          </span>
          SLA Historical Performance
        </h2>
        <span className="text-xs text-slate-500">
          Weekly compliance vs {SLA_RESOLUTION_TARGET_HOURS}h resolution target
        </span>
      </div>

      {!hasAnyData && (
        <p className="mb-3 text-xs text-slate-500">
          No resolved tickets in the last 5 weeks yet — SLA tracking only
          started with this widget, so the chart will fill in as tickets get
          resolved.
        </p>
      )}

      <div className="flex h-40 items-end gap-4 border-b border-hairline pb-2">
        {history.map((week) => (
          <div
            key={week.label}
            className="flex flex-1 flex-col items-center justify-end gap-2"
          >
            <span className="text-xs font-medium text-ink-soft">
              {week.pct === null ? "—" : `${week.pct}%`}
            </span>
            <div className="flex h-28 w-full items-end">
              <div
                className={`w-full rounded-t ${barTone(week.pct)}`}
                style={{ height: `${week.pct === null ? 4 : Math.max(week.pct, 4)}%` }}
                title={
                  week.count
                    ? `${week.pct}% of ${week.count} resolved`
                    : "No tickets resolved this week"
                }
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4">
        {history.map((week) => (
          <span
            key={week.label}
            className="flex-1 text-center text-xs text-slate-500"
          >
            {week.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActivityIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h4M9 11V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4m-6 0h6m-6 0v11m6-11v11m0-11h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4" />
    </svg>
  );
}

type ActivityItem = {
  id: number;
  label: string;
  sub: string;
  status?: string;
  href?: string;
  when: string;
  who: string;
};

function RecentActivityCard({ items }: { items: ActivityItem[] }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span className="text-emerald-400">
          <ActivityIcon />
        </span>
        Recent Activity
      </h2>

      {items.length ? (
        <ul className="divide-y divide-hairline text-sm">
          {items.map((item) => {
            const inner = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">
                    {item.label}
                  </span>
                  <span className="whitespace-nowrap text-xs text-slate-500">
                    {new Date(item.when).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <span>{item.sub}</span>
                  {item.status && <StatusBadge status={item.status} />}
                </div>
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

function TicketQueueIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8.1 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

function QuickActionCenterCard() {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        <span className="text-purple-400">
          <WrenchIcon />
        </span>
        Quick Action Center
      </h2>

      <div className="flex flex-col gap-2.5">
        <Link
          href="/tickets/new"
          className="flex items-center gap-2 rounded-lg bg-blue-600/90 px-4 py-2.5 text-sm font-medium text-ink hover:bg-blue-500"
        >
          <WrenchIcon />
          Request New Service
        </Link>
        <Link
          href="/tickets"
          className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface"
        >
          <TicketQueueIcon />
          Open Support Ticket
        </Link>
        <div
          title="Coming soon — live chat/call support isn't built yet"
          className="flex cursor-not-allowed items-center justify-between gap-2 rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-slate-600"
        >
          <span className="flex items-center gap-2">
            <PhoneIcon />
            Start Live Call
          </span>
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
            Soon
          </span>
        </div>
      </div>
    </div>
  );
}
