// Shared computation for the Trends/Analytics view (schema_step33.sql) —
// used by both app/analytics/page.tsx and the CSV export route, so the
// numbers on screen and the numbers in the exported file can never drift
// apart.
//
// Ticket volume and MTTR (mean time to repair) reuse data every other
// widget in the app already reads — service_tickets, RLS-scoped exactly
// the way it already is everywhere else (staff see every org, a client
// sees only their own).
//
// Uptime % is the one new metric. Rather than inventing a number, it's
// reconstructed from real history: audit_log already captures a full
// snapshot of every asset on every insert/update (log_audit(), schema.sql)
// — so "what fraction of assets were operational as of the end of month X"
// is answered by walking each asset's own audit trail and taking whatever
// status was current at that point in time. schema_step33.sql opens up
// exactly enough of audit_log (assets-table rows only, own-org only for
// clients) for this to work from a normal RLS-scoped session — no
// service-role client needed here.
import { createClient } from "@/lib/supabase/server";
import { hoursBetween } from "@/lib/sla";

const TREND_MONTHS = 6;

export type MonthlyAnalytics = {
  label: string;
  monthStart: string;
  monthEnd: string;
  ticketsOpened: number;
  ticketsResolved: number;
  mttrHours: number | null;
  uptimePct: number | null;
  assetsTracked: number;
};

export type AnalyticsSummary = {
  months: MonthlyAnalytics[];
  totals: {
    ticketsOpened: number;
    ticketsResolved: number;
    avgMttrHours: number | null;
    avgUptimePct: number | null;
  };
};

function monthBuckets(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const idx = count - 1 - i;
    const start = new Date(now.getFullYear(), now.getMonth() - idx, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - idx + 1, 1);
    return {
      label: start.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      start,
      end,
    };
  });
}

export async function getAnalytics(): Promise<AnalyticsSummary> {
  const supabase = await createClient();
  const buckets = monthBuckets(TREND_MONTHS);

  const [{ data: assets }, { data: tickets }, { data: auditRows }] = await Promise.all([
    supabase.from("assets").select("id, status, created_at"),
    supabase
      .from("service_tickets")
      .select("id, asset_id, created_at, resolved_at")
      .order("created_at", { ascending: true }),
    // No date filter — need each asset's full status trail, since its most
    // recent change as of an early month in the window may predate the
    // window entirely.
    supabase
      .from("audit_log")
      .select("record_id, changed_at, new_data")
      .eq("table_name", "assets")
      .order("changed_at", { ascending: true }),
  ]);

  const assetRows = assets ?? [];
  const ticketRows = tickets ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auditRowsList = (auditRows ?? []) as any[];

  // Group once per asset, ascending, so "status as of date X" is a simple
  // forward scan instead of re-filtering the whole audit table per
  // asset per month.
  const historyByAsset = new Map<string, { at: string; status: string }[]>();
  for (const row of auditRowsList) {
    const status = row.new_data?.status;
    if (!status) continue; // DELETE rows carry no new_data — asset is gone
    const list = historyByAsset.get(row.record_id) ?? [];
    list.push({ at: row.changed_at, status });
    historyByAsset.set(row.record_id, list);
  }

  function statusAsOf(assetId: string, createdAt: string, asOf: Date): string | null {
    if (new Date(createdAt) > asOf) return null; // didn't exist yet
    const history = historyByAsset.get(assetId);
    if (!history?.length) return null; // no confirmed status by that date
    let status: string | null = null;
    for (const entry of history) {
      if (new Date(entry.at) > asOf) break;
      status = entry.status;
    }
    return status;
  }

  const months: MonthlyAnalytics[] = buckets.map((bucket) => {
    const startIso = bucket.start.toISOString();
    const endIso = bucket.end.toISOString();

    const opened = ticketRows.filter(
      (t) => t.created_at >= startIso && t.created_at < endIso,
    );
    const resolved = ticketRows.filter(
      (t) => t.resolved_at && t.resolved_at >= startIso && t.resolved_at < endIso,
    );
    const mttrHours = resolved.length
      ? resolved.reduce(
          (sum, t) => sum + hoursBetween(t.created_at, t.resolved_at!),
          0,
        ) / resolved.length
      : null;

    const asOf = new Date(bucket.end.getTime() - 1); // last instant of the month
    const knownStatuses = assetRows
      .map((a) => statusAsOf(a.id, a.created_at, asOf))
      .filter((s): s is string => s !== null);
    const operational = knownStatuses.filter((s) => s === "operational").length;
    const uptimePct = knownStatuses.length
      ? Math.round((operational / knownStatuses.length) * 100)
      : null;

    return {
      label: bucket.label,
      monthStart: startIso,
      monthEnd: endIso,
      ticketsOpened: opened.length,
      ticketsResolved: resolved.length,
      mttrHours,
      uptimePct,
      assetsTracked: knownStatuses.length,
    };
  });

  const totalResolved = months.reduce((sum, m) => sum + m.ticketsResolved, 0);
  const mttrWeightedSum = months.reduce(
    (sum, m) => sum + (m.mttrHours ?? 0) * m.ticketsResolved,
    0,
  );
  const uptimeMonths = months.filter((m) => m.uptimePct !== null);

  return {
    months,
    totals: {
      ticketsOpened: months.reduce((sum, m) => sum + m.ticketsOpened, 0),
      ticketsResolved: totalResolved,
      avgMttrHours: totalResolved ? mttrWeightedSum / totalResolved : null,
      avgUptimePct: uptimeMonths.length
        ? Math.round(
            uptimeMonths.reduce((sum, m) => sum + (m.uptimePct ?? 0), 0) /
              uptimeMonths.length,
          )
        : null,
    },
  };
}
