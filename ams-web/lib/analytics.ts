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

// CSAT rollup — staff/Super Admin only, by explicit product decision (a
// client shouldn't see other clients' satisfaction scores, or even a
// rollup of their own — this is an internal account-health view). The raw
// data has existed since schema_step18.sql (four 1-5 star ratings +
// signature captured on every PM/CM service report via
// components/customer-survey.tsx) but until now only ever displayed on a
// single service record's own detail page — never averaged or trended
// anywhere. Callers MUST only invoke this for a staff/Super Admin session
// (app/analytics/page.tsx gates it on isStaff before calling) — this
// function itself has no role check, same trust boundary as the rest of
// this file's exports, which all assume the caller already decided who
// gets to see the result.
//
// Two different time scopes, both surfaced deliberately:
//  - `months` (the trend chart) stays within the same 6-month trailing
//    window as the rest of this page, for visual consistency.
//  - `avgOverall`/`avgService`/`avgMachine`/`avgSupport`/`byOrg` (the KPI
//    numbers and per-client table) use ALL rated visits ever, not just the
//    6-month window — CSAT is a newer, lower-volume data source than
//    tickets/uptime, so restricting it to 6 months risked showing "no
//    data" even once ratings exist. The UI labels these as all-time.
export type CsatMonthly = {
  label: string;
  avgOverall: number | null;
  count: number;
};

export type OrgCsat = {
  organizationId: string;
  organizationName: string;
  avgOverall: number;
  count: number;
};

// Grouped by `performed_by` (schema.sql — free text on the PM/CM report
// form, labeled "Service engineer / technician"), not `created_by` — the
// latter is just whichever staff account was logged in when the report
// was filed (could be a dispatcher/admin entering it on a technician's
// behalf), while `performed_by` is the field that actually names who did
// the visit. Trade-off: it's optional, free text, so a typo or casing
// difference ("J. Cruz" vs "j cruz") creates a separate row rather than
// merging — grouping key is trim+lowercase to absorb casing/whitespace
// at least, but not spelling variants. Blank/never-filled-in rows land in
// an explicit "Unspecified" bucket rather than being silently dropped.
export type TechnicianCsat = {
  name: string;
  avgOverall: number;
  count: number;
};

export type CsatRollup = {
  months: CsatMonthly[];
  avgOverall: number | null;
  avgService: number | null;
  avgMachine: number | null;
  avgSupport: number | null;
  totalRated: number;
  byOrg: OrgCsat[];
  byTechnician: TechnicianCsat[];
};

export async function getCsatRollup(): Promise<CsatRollup> {
  const supabase = await createClient();
  const buckets = monthBuckets(TREND_MONTHS);

  const { data } = await supabase
    .from("service_records")
    .select(
      "date_performed, performed_by, csat_overall, csat_service, csat_machine, csat_support, assets(organization_id, organizations(name))",
    )
    .not("csat_overall", "is", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];

  const months: CsatMonthly[] = buckets.map((bucket) => {
    const inMonth = rows.filter((r) => {
      const d = new Date(r.date_performed);
      return d >= bucket.start && d < bucket.end;
    });
    const avgOverall = inMonth.length
      ? inMonth.reduce((sum, r) => sum + r.csat_overall, 0) / inMonth.length
      : null;
    return { label: bucket.label, avgOverall, count: inMonth.length };
  });

  function avgOf(field: "csat_overall" | "csat_service" | "csat_machine" | "csat_support"): number | null {
    const values = rows
      .map((r) => r[field])
      .filter((v): v is number => v !== null && v !== undefined);
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  }

  const byOrgMap = new Map<string, { name: string; sum: number; count: number }>();
  for (const r of rows) {
    const asset = Array.isArray(r.assets) ? r.assets[0] : r.assets;
    const orgId: string | undefined = asset?.organization_id;
    if (!orgId) continue;
    const orgObj = Array.isArray(asset.organizations) ? asset.organizations[0] : asset.organizations;
    const name: string = orgObj?.name ?? "Unknown client";
    const entry = byOrgMap.get(orgId) ?? { name, sum: 0, count: 0 };
    entry.sum += r.csat_overall;
    entry.count += 1;
    byOrgMap.set(orgId, entry);
  }

  const byOrg: OrgCsat[] = Array.from(byOrgMap.entries())
    .map(([organizationId, v]) => ({
      organizationId,
      organizationName: v.name,
      avgOverall: v.sum / v.count,
      count: v.count,
    }))
    // Lowest satisfaction first — the client most worth checking in on
    // should be the first row, not buried under happier accounts.
    .sort((a, b) => a.avgOverall - b.avgOverall);

  const byTechMap = new Map<string, { name: string; sum: number; count: number }>();
  for (const r of rows) {
    const raw: string | null = r.performed_by;
    const trimmed = raw?.trim() || "";
    const key = trimmed ? trimmed.toLowerCase() : "__unspecified__";
    const name = trimmed || "Unspecified";
    const entry = byTechMap.get(key) ?? { name, sum: 0, count: 0 };
    entry.sum += r.csat_overall;
    entry.count += 1;
    byTechMap.set(key, entry);
  }

  const byTechnician: TechnicianCsat[] = Array.from(byTechMap.values())
    .map((v) => ({ name: v.name, avgOverall: v.sum / v.count, count: v.count }))
    // Same "lowest first" reasoning as byOrg — whoever's trending lowest
    // is the one worth a conversation, not buried at the bottom.
    .sort((a, b) => a.avgOverall - b.avgOverall);

  return {
    months,
    avgOverall: avgOf("csat_overall"),
    avgService: avgOf("csat_service"),
    avgMachine: avgOf("csat_machine"),
    avgSupport: avgOf("csat_support"),
    totalRated: rows.length,
    byOrg,
    byTechnician,
  };
}
