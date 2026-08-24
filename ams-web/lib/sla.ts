// Shared SLA targets and helpers — single source of truth for the SLA
// Performance dashboard widgets (app/dashboard/page.tsx), Analytics
// (app/analytics/page.tsx), and the SLA breach escalation job
// (lib/sla-escalation.ts).
//
// As of schema_step40.sql, the actual targets live in the database
// (sla_policies) and are Super-Admin-editable via /sla-settings — one
// global default, plus optional per-organization overrides for a client
// with a different contracted SLA tier. These two constants are now only a
// last-resort fallback (used if, somehow, the seeded global row is ever
// missing) — the source of truth is the database, not this file.
export const SLA_RESPONSE_TARGET_HOURS = 8;
export const SLA_RESOLUTION_TARGET_HOURS = 48;

export function hoursBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
}

export type SlaTargets = {
  responseTargetHours: number;
  resolutionTargetHours: number;
};

export type SlaPolicyMap = {
  global: SlaTargets;
  byOrg: Map<string, SlaTargets>;
};

const FALLBACK_TARGETS: SlaTargets = {
  responseTargetHours: SLA_RESPONSE_TARGET_HOURS,
  resolutionTargetHours: SLA_RESOLUTION_TARGET_HOURS,
};

// One query, used everywhere that needs to resolve targets for more than
// one organization at once (the escalation job checks every open ticket
// across every client in one pass) — far cheaper than a lookup per ticket.
// Works with either the session client (dashboard/analytics/settings page)
// or the service-role client (the cron job) — both expose the same
// .from().select() shape, so this is intentionally loosely typed rather
// than importing either client's concrete type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSlaPolicyMap(supabase: any): Promise<SlaPolicyMap> {
  const { data } = await supabase
    .from("sla_policies")
    .select("organization_id, is_global, response_target_hours, resolution_target_hours");

  let global = FALLBACK_TARGETS;
  const byOrg = new Map<string, SlaTargets>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    const targets: SlaTargets = {
      responseTargetHours: Number(row.response_target_hours),
      resolutionTargetHours: Number(row.resolution_target_hours),
    };
    if (row.is_global) {
      global = targets;
    } else if (row.organization_id) {
      byOrg.set(row.organization_id, targets);
    }
  }

  return { global, byOrg };
}

// Convenience wrapper for a single-organization lookup (dashboard/analytics
// for a signed-in client, who only ever needs their own org's targets).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getGlobalSlaTargets(supabase: any): Promise<SlaTargets> {
  const { global } = await getSlaPolicyMap(supabase);
  return global;
}

export function resolveSlaTargets(policyMap: SlaPolicyMap, organizationId: string | null): SlaTargets {
  if (organizationId) {
    const override = policyMap.byOrg.get(organizationId);
    if (override) return override;
  }
  return policyMap.global;
}
