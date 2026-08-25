// Scheduled report digests — a weekly, staff-only email summarizing the
// last 7 days plus a live current-state snapshot, sent automatically
// instead of relying on someone remembering to open the Analytics/Alerts
// pages. Staff-only for now (no per-client digest), per explicit scoping
// decision when this was built.
//
// Deliberately reuses existing tables rather than adding a new one:
// service_tickets for volume/backlog/MTTR, assets for a live uptime
// snapshot, sla_escalations for breach counts, low_stock_alerts for
// current stock issues. No schema_step migration needed for this feature.
//
// Unlike SLA/PM/low-stock alerts (lib/sla-escalation.ts, lib/notify.ts,
// lib/low-stock-alerts.ts), this has no idempotency ledger — those guard
// against re-raising the same event on every run of a frequent (hourly/
// daily) cron. This is a scheduled summary, not an event, so there's
// nothing to de-dupe against: Vercel Cron fires this route once, on its
// own weekly schedule (vercel.json), and each firing is a distinct week.
import { sendEmail } from "./email";
import { wrapEmail } from "./notify";
import { createServiceRoleClient } from "./supabase/service-role";
import { hoursBetween } from "./sla";

const APP_NAME = "HorizonCare360";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type WeeklyDigestData = {
  ticketsOpened: number;
  ticketsResolved: number;
  avgMttrHours: number | null;
  openBacklog: number;
  assetsOperational: number;
  assetsTotal: number;
  slaBreaches: number;
  lowStockCount: number;
  outOfStockCount: number;
};

export async function buildWeeklyDigest(): Promise<WeeklyDigestData> {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const [
    { data: openedRows },
    { data: resolvedRows },
    { data: backlogRows },
    { data: assetRows },
    { data: slaRows },
    { data: stockRows },
  ] = await Promise.all([
    supabase.from("service_tickets").select("id").gte("created_at", since),
    supabase
      .from("service_tickets")
      .select("id, created_at, resolved_at")
      .not("resolved_at", "is", null)
      .gte("resolved_at", since),
    supabase.from("service_tickets").select("id").neq("status", "closed"),
    supabase.from("assets").select("status"),
    supabase.from("sla_escalations").select("id, event_type").gte("created_at", since),
    supabase.from("low_stock_alerts").select("last_level"),
  ]);

  const ticketsOpened = openedRows?.length ?? 0;

  const resolved = resolvedRows ?? [];
  const ticketsResolved = resolved.length;
  const avgMttrHours = ticketsResolved
    ? resolved.reduce((sum, t) => sum + hoursBetween(t.created_at, t.resolved_at as string), 0) / ticketsResolved
    : null;

  const openBacklog = backlogRows?.length ?? 0;

  const assets = assetRows ?? [];
  const assetsTotal = assets.length;
  const assetsOperational = assets.filter((a) => a.status === "operational").length;

  // Breach events only (response_breached / resolution_breached) — the
  // softer "*_approaching" warnings are already surfaced live via the
  // Alerts bell and would just add noise to a weekly rollup.
  const slaBreaches = (slaRows ?? []).filter(
    (r) => r.event_type === "response_breached" || r.event_type === "resolution_breached",
  ).length;

  const stock = stockRows ?? [];
  const lowStockCount = stock.filter((r) => r.last_level === "low").length;
  const outOfStockCount = stock.filter((r) => r.last_level === "out_of_stock").length;

  return {
    ticketsOpened,
    ticketsResolved,
    avgMttrHours,
    openBacklog,
    assetsOperational,
    assetsTotal,
    slaBreaches,
    lowStockCount,
    outOfStockCount,
  };
}

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  return hours < 48 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#64748b;">${label}</td><td style="padding:6px 0;text-align:right;font-weight:600;">${value}</td></tr>`;
}

function buildDigestHtml(data: WeeklyDigestData): string {
  const uptimePct = data.assetsTotal ? Math.round((data.assetsOperational / data.assetsTotal) * 100) : null;
  const body = `
    <p style="margin: 0 0 16px; font-size: 13px; color: #64748b;">Last 7 days, plus a live fleet/stock snapshot as of right now.</p>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      ${row("Tickets opened", String(data.ticketsOpened))}
      ${row("Tickets resolved", String(data.ticketsResolved))}
      ${row("Avg repair time", formatHours(data.avgMttrHours))}
      ${row("Open backlog (now)", String(data.openBacklog))}
      ${row("Fleet uptime (now)", uptimePct === null ? "—" : `${uptimePct}% (${data.assetsOperational}/${data.assetsTotal})`)}
      ${row("SLA breaches", String(data.slaBreaches))}
      ${row("Low stock parts", String(data.lowStockCount))}
      ${row("Out of stock parts", String(data.outOfStockCount))}
    </table>
    <p style="margin-top:16px; font-size:12px; color:#94a3b8;">Full detail: open the Analytics and Alerts pages in the app.</p>
  `;
  return wrapEmail("Weekly Ops Digest", body);
}

export async function sendWeeklyDigest(): Promise<{
  sent: boolean;
  data: WeeklyDigestData;
  message?: string;
}> {
  const data = await buildWeeklyDigest();

  const to = process.env.STAFF_NOTIFICATION_EMAIL;
  if (!to) {
    return { sent: false, data, message: "STAFF_NOTIFICATION_EMAIL not configured — nothing sent." };
  }

  const result = await sendEmail({
    to,
    subject: `[${APP_NAME}] Weekly Ops Digest`,
    html: buildDigestHtml(data),
  });

  if (!result.ok) {
    return { sent: false, data, message: result.message };
  }
  return { sent: true, data };
}
