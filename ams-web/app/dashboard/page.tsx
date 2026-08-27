import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { NotificationBell } from "@/components/notification-bell";
import { SearchBar } from "@/components/search-bar";
import { ticketRef, assetLabel } from "@/lib/format";
import { hoursBetween, getSlaPolicyMap, resolveSlaTargets } from "@/lib/sla";
import { timed } from "@/lib/supabase/timed";
import { DashboardGrid, type DashboardWidget } from "./dashboard-grid";
import type { LayoutItem } from "./actions";
import {
  KpiCard,
  ActiveTicketsCard,
  SlaPerformanceCard,
  EquipmentHealthCard,
  SlaHistoryCard,
  RecentActivityCard,
  QuickActionCenterCard,
  EquipmentAlertsCard,
  ServiceDueCard,
  ComplianceWarrantyCard,
  type ActivityItem,
  type ComplianceItem,
} from "./widget-cards";

// TEMPORARY — see the diagnostic split near the bottom of DashboardPage.
// true = plain static grid (known-good rollback), false = DashboardGrid.
// Static grid just confirmed fast + reliable across two reloads — flipping
// back to false to confirm the hang reproduces specifically with
// DashboardGrid, isolating it definitively before digging into why.
const DEBUG_STATIC_GRID = false;

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { access_denied?: string };
}) {
  // TEMPORARY — pins down which package versions actually shipped in this
  // deployment (the SDK upgrade meant to fix the Supabase auth-js lock
  // deadlock had no observed effect on the 300s /dashboard hang, so this
  // confirms whether it was even installed before chasing further theories).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const supabaseJsPkg = require("@supabase/supabase-js/package.json");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ssrPkg = require("@supabase/ssr/package.json");
    // eslint-disable-next-line no-console
    console.log(
      `[timing] versions supabase-js=${supabaseJsPkg.version} ssr=${ssrPkg.version}`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log("[timing] version check failed", err);
  }

  const supabase = await createClient();
  const profile = await timed("dashboard.getProfile", getProfile());
  const isStaff = isStaffRole(profile?.role);

  // Editable/movable/resizable widgets (schema_step45.sql). Fetched
  // separately from getProfile()'s own select rather than widening the
  // Profile type everyone else reads too — this jsonb blob is only ever
  // relevant on this one page.
  const { data: layoutRow } = profile
    ? await timed(
        "dashboard.layoutRowSelect",
        supabase.from("profiles").select("dashboard_layout").eq("id", profile.id).single(),
      )
    : { data: null };
  const savedLayout = (layoutRow?.dashboard_layout ?? null) as LayoutItem[] | null;

  // Staff see the global default (a fleet-wide view spans multiple orgs,
  // which could each have their own override — blending those into one
  // number wouldn't have an obviously-correct meaning, so this
  // intentionally doesn't try). A client_viewer sees their own org's
  // override if one's been set, same target lib/sla-escalation.ts actually
  // escalates their tickets against (schema_step40.sql).
  const slaPolicyMap = await timed("dashboard.getSlaPolicyMap", getSlaPolicyMap(supabase));
  const slaTargets = resolveSlaTargets(slaPolicyMap, isStaff ? null : (profile?.organization_id ?? null));

  const [
    { count: totalAssets },
    { count: operationalCount },
    { count: attentionCount },
    { count: downCount },
    { count: unserviceableCount },
    { data: expiringCerts, count: expiringCertsCount },
    { data: expiringWarranties, count: expiringWarrantiesCount },
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
    { data: attentionAssets },
  ] = await Promise.all([
    timed("q.totalAssets", supabase.from("assets").select("*", { count: "exact", head: true })),
    timed(
      "q.operationalCount",
      supabase.from("assets").select("*", { count: "exact", head: true }).eq("status", "operational"),
    ),
    timed(
      "q.attentionCount",
      supabase.from("assets").select("*", { count: "exact", head: true }).eq("status", "attention"),
    ),
    timed(
      "q.downCount",
      supabase.from("assets").select("*", { count: "exact", head: true }).eq("status", "down"),
    ),
    timed(
      "q.unserviceableCount",
      supabase.from("assets").select("*", { count: "exact", head: true }).eq("status", "unserviceable"),
    ),
    timed(
      "q.expiringCerts",
      supabase
        .from("compliance_certificates")
        .select("id, certificate_type, expiry_date, assets(asset_tag, serial_number, sites(address))", {
          count: "exact",
        })
        .lte("expiry_date", daysFromNow(30))
        .order("expiry_date", { ascending: true }),
    ),
    // Warranty half of the same "Compliance & Warranty" panel below —
    // assets.warranty_end_date already existed but had never been
    // surfaced anywhere in the app until now. RLS ("read own org assets
    // or all if staff") scopes this the same way every other assets query
    // already does.
    timed(
      "q.expiringWarranties",
      supabase
        .from("assets")
        .select("id, asset_tag, serial_number, warranty_end_date, sites(address)", {
          count: "exact",
        })
        .not("warranty_end_date", "is", null)
        .lte("warranty_end_date", daysFromNow(30))
        .order("warranty_end_date", { ascending: true }),
    ),
    timed(
      "q.dueAssets",
      supabase
        .from("assets")
        .select("id, asset_tag, serial_number, next_service_due, sites(address)")
        .not("next_service_due", "is", null)
        .lte("next_service_due", daysFromNow(30))
        .order("next_service_due", { ascending: true }),
    ),
    timed(
      "q.openTicketsCount",
      supabase.from("service_tickets").select("*", { count: "exact", head: true }).eq("status", "open"),
    ),
    timed(
      "q.inProgressTicketsCount",
      supabase
        .from("service_tickets")
        .select("*", { count: "exact", head: true })
        .eq("status", "in_progress"),
    ),
    timed(
      "q.partsPendingTicketsCount",
      supabase
        .from("service_tickets")
        .select("*", { count: "exact", head: true })
        .eq("status", "parts_pending"),
    ),
    timed(
      "q.resolvedTicketsCount",
      supabase.from("service_tickets").select("*", { count: "exact", head: true }).eq("status", "closed"),
    ),
    timed(
      "q.slaTickets",
      supabase
        .from("service_tickets")
        .select("id, created_at, first_response_at, resolved_at")
        .gte("created_at", daysAgo(30)),
    ),
    timed(
      "q.slaHistoryTickets",
      supabase
        .from("service_tickets")
        .select("id, created_at, resolved_at")
        .not("resolved_at", "is", null)
        .gte("resolved_at", daysAgo(35)),
    ),
    // RLS restricts this to staff only — a client_viewer's query just comes
    // back empty, no error, so it's safe to always run this. new_data is a
    // full row snapshot (see log_audit() in schema.sql), so table-specific
    // fields like an asset's asset_tag are already right there — no extra
    // join needed for most rows.
    timed(
      "q.recentActivity",
      supabase
        .from("audit_log")
        .select(
          "id, table_name, record_id, action, changed_at, old_data, new_data, profiles(full_name)",
        )
        .order("changed_at", { ascending: false })
        .limit(8),
    ),
    // Same RLS note as audit_log above — alerts is staff-only (Step 10), so
    // a client_viewer's query just comes back with count 0, no error.
    timed(
      "q.unreadAlertsCount",
      supabase.from("alerts").select("*", { count: "exact", head: true }).eq("is_read", false),
    ),
    // Feeds the bell's dropdown — same RLS note applies (staff-only table,
    // client_viewer just gets an empty array back).
    timed(
      "q.latestAlerts",
      supabase
        .from("alerts")
        .select("id, title, severity, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ),
    // Client-facing "Equipment Alerts" card — unlike the `alerts` table
    // above (staff-only, manually raised triage alerts), this is derived
    // straight from asset status, which a client can already see on
    // /assets. RLS ("read own org assets or all if staff") scopes this to
    // just the signed-in org for a client; only rendered for clients
    // below, so the fleet-wide result for staff is simply unused.
    timed(
      "q.attentionAssets",
      supabase
        .from("assets")
        .select("id, asset_tag, serial_number, status, sites(address)")
        .in("status", ["down", "attention"])
        .order("status"),
    ),
  ]);

  const operationalPct = totalAssets
    ? Math.round(((operationalCount ?? 0) / totalAssets) * 100)
    : 0;

  // Merges the two "expiring in <30 days" queries above into one
  // chronological list — a client shouldn't have to mentally combine two
  // separate panels to know everything coming due on their equipment.
  const complianceItems = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(expiringCerts ?? []).map((c: any) => ({
      key: `cert-${c.id}`,
      assetLabel: assetLabel(c.assets),
      label: c.certificate_type ?? "Certificate",
      date: c.expiry_date as string,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(expiringWarranties ?? []).map((a: any) => ({
      key: `warranty-${a.id}`,
      assetLabel: assetLabel(a),
      label: "Warranty",
      date: a.warranty_end_date as string,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const complianceCount = (expiringCertsCount ?? 0) + (expiringWarrantiesCount ?? 0);

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
    (t) => hoursBetween(t.created_at, t.resolved_at!) <= slaTargets.resolutionTargetHours,
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
        slaTargets.resolutionTargetHours,
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
    ? await timed(
        "q.activityAssets",
        supabase.from("assets").select("id, asset_tag, organizations(name)").in("id", ticketAssetIds),
      )
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

  // Editable/movable/resizable widgets (schema_step45.sql), each with a
  // uniform S/M/L size preset (dashboard-grid.tsx's SIZE_DIMENSIONS) —
  // every widget below is one grid entry, positioned on a 12-col grid.
  // The 6 KPI tiles used to be one combined "kpi-summary" widget; split
  // into individually movable/resizable cards per your request. A saved
  // dashboard_layout always takes over from these defaults once one
  // exists — role-conditional membership below is the only thing that
  // still varies by who's signed in.
  const widgets: DashboardWidget[] = [
    {
      id: "kpi-total-assets",
      defaultSize: "sm",
      defaultPosition: { x: 0, y: 0 },
      content: <KpiCard label="Total Assets" value={totalAssets ?? 0} />,
    },
    {
      id: "kpi-operational-pct",
      defaultSize: "sm",
      defaultPosition: { x: 3, y: 0 },
      content: <KpiCard label="% Operational" value={`${operationalPct}%`} tone="good" />,
    },
    {
      id: "kpi-attention",
      defaultSize: "sm",
      defaultPosition: { x: 6, y: 0 },
      content: <KpiCard label="Attention" value={attentionCount ?? 0} />,
    },
    {
      id: "kpi-down",
      defaultSize: "sm",
      defaultPosition: { x: 9, y: 0 },
      content: <KpiCard label="Down" value={downCount ?? 0} tone={downCount ? "warn" : undefined} />,
    },
    {
      id: "kpi-unserviceable",
      defaultSize: "sm",
      defaultPosition: { x: 0, y: 6 },
      content: (
        <KpiCard
          label="Unserviceable"
          value={unserviceableCount ?? 0}
          tone={unserviceableCount ? "warn" : undefined}
        />
      ),
    },
    {
      id: "kpi-compliance",
      defaultSize: "sm",
      defaultPosition: { x: 3, y: 6 },
      content: (
        <KpiCard
          label="Compliance <30d"
          value={complianceCount}
          tone={complianceCount ? "warn" : undefined}
        />
      ),
    },
    {
      id: "active-tickets",
      defaultSize: "md",
      defaultPosition: { x: 0, y: 12 },
      content: (
        <ActiveTicketsCard
          openCount={openTicketsCount ?? 0}
          inProgressCount={inProgressTicketsCount ?? 0}
          partsPendingCount={partsPendingTicketsCount ?? 0}
          resolvedCount={resolvedTicketsCount ?? 0}
          size="md"
        />
      ),
    },
    {
      id: "sla-performance",
      defaultSize: "md",
      defaultPosition: { x: 4, y: 12 },
      content: (
        <SlaPerformanceCard
          slaPct={slaPct}
          avgResponseHours={avgResponseHours}
          avgResolutionHours={avgResolutionHours}
          measuredCount={resolvedInPeriod.length}
          responseTargetHours={slaTargets.responseTargetHours}
          resolutionTargetHours={slaTargets.resolutionTargetHours}
          size="md"
        />
      ),
    },
    // Equipment Health repeats the top KPI row and stays staff-only for
    // the same reason it always was; Quick Action Center is the client's
    // fastest path to "get help" (staff already have the full sidebar).
    ...(isStaff
      ? [
          {
            id: "equipment-health",
            defaultSize: "md" as const,
            defaultPosition: { x: 8, y: 12 },
            content: (
              <EquipmentHealthCard
                totalAssets={totalAssets ?? 0}
                operationalCount={operationalCount ?? 0}
                attentionCount={attentionCount ?? 0}
                downCount={downCount ?? 0}
                unserviceableCount={unserviceableCount ?? 0}
                size="md"
              />
            ),
          },
        ]
      : [
          {
            id: "quick-actions",
            defaultSize: "md" as const,
            defaultPosition: { x: 8, y: 12 },
            content: <QuickActionCenterCard size="md" />,
          },
        ]),
    {
      id: "sla-history",
      defaultSize: "lg",
      defaultPosition: { x: 0, y: 21 },
      content: (
        <SlaHistoryCard history={slaHistory} resolutionTargetHours={slaTargets.resolutionTargetHours} size="lg" />
      ),
    },
    // Recent Activity reads the audit trail (Super Admin-only data), so it
    // stays staff-only; Equipment Alerts is the client-facing equivalent,
    // derived straight from asset status a client can already see.
    ...(isStaff
      ? [
          {
            id: "recent-activity",
            defaultSize: "md" as const,
            defaultPosition: { x: 6, y: 21 },
            content: <RecentActivityCard items={activityItems} size="md" />,
          },
        ]
      : [
          {
            id: "equipment-alerts",
            defaultSize: "md" as const,
            defaultPosition: { x: 6, y: 21 },
            content: <EquipmentAlertsCard assets={attentionAssets ?? []} size="md" />,
          },
        ]),
    {
      id: "service-due",
      defaultSize: "md",
      defaultPosition: { x: 0, y: 33 },
      content: <ServiceDueCard assets={dueAssets ?? []} size="md" />,
    },
    {
      id: "compliance-warranty",
      defaultSize: "md",
      defaultPosition: { x: 4, y: 33 },
      content: <ComplianceWarrantyCard items={complianceItems} size="md" />,
    },
  ];

  // eslint-disable-next-line no-console
  console.log("[timing] dashboard.reachedReturn");

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
          {!isStaff && (
            <Link
              href="/tickets/new"
              className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
            >
              + Request Service
            </Link>
          )}
          <NotificationBell
            href="/alerts"
            count={unreadAlertsCount ?? 0}
            alerts={latestAlerts ?? []}
            activities={activityItems.slice(0, 5)}
          />
        </>
      }
    >
      {searchParams?.access_denied === "1" && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          You don&apos;t have access to that page. Contact your Super Admin if you think this is wrong.
        </p>
      )}
      {/* TEMPORARY diagnostic split — every Supabase query on this page
          confirmed fast (all ~450ms) via [timing] logs, yet /dashboard still
          hangs the full 300s and times out. This isolates whether the hang
          is inside DashboardGrid's render/serialization specifically, or
          somewhere else (Next.js still has to serialize this same widgets
          array either way, so a static grid ruling it out points at
          DashboardGrid/react-grid-layout itself; still hanging with the
          static grid points elsewhere). DEBUG_STATIC_GRID flipped by hand
          for one deploy at a time — remove this whole split once found. */}
      {DEBUG_STATIC_GRID ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {widgets.map((w) => (
            <div key={w.id}>{w.content}</div>
          ))}
        </div>
      ) : (
        <DashboardGrid widgets={widgets} savedLayout={savedLayout} />
      )}
    </AppShell>
  );
}

