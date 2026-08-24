import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hoursBetween, getSlaPolicyMap, resolveSlaTargets } from "@/lib/sla";
import { ticketRef, assetLabel } from "@/lib/format";
import { notifyStaff } from "@/lib/notify";

// Core logic for "SLA breach escalation" — instead of only ever showing SLA
// performance after the fact (the dashboard's SLA Performance / Historical
// widgets), a daily cron job calls runSlaEscalationCheck() to proactively
// flag tickets that are getting close to, or have already blown through,
// their response or resolution SLA window. Two severities per dimension:
//  - "approaching" (80%+ of the target elapsed, not yet breached) — raises
//    a caution alert only. A heads-up, nothing else changes.
//  - "breached" (100%+ of the target elapsed) — raises a critical alert
//    AND bumps the ticket's priority to "high" if it isn't already, so an
//    overdue ticket actually surfaces higher in every priority-sorted view
//    instead of silently staying at whatever priority it was raised with.
// Each of the four (dimension x severity) combinations only ever fires
// once per ticket — sla_escalations' unique(ticket_id, event_type)
// constraint is the actual guarantee, same idempotency pattern as
// pm_auto_runs / runPmAutoCheck (lib/pm-automation.ts).
const APPROACHING_RATIO = 0.8;

type SlaLevel = "approaching" | "breached" | null;

function classify(hoursElapsed: number, targetHours: number): SlaLevel {
  if (hoursElapsed >= targetHours) return "breached";
  if (hoursElapsed >= targetHours * APPROACHING_RATIO) return "approaching";
  return null;
}

// Supabase's untyped reverse-embeds come back as arrays at every level
// regardless of the relationship actually being single-row (same quirk
// noted throughout app/**, e.g. work-orders/page.tsx) — kept loose here
// rather than fighting it with generated types this codebase doesn't use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenTicket = {
  id: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  first_response_at: string | null;
  asset_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets: any;
};

// Site + serial number instead of the raw asset tag — same "meaningful at
// a glance, especially for a client" reasoning as assetLabel()'s own doc
// comment (lib/format.ts), now applied to alert/email text too, not just
// the UI.
function assetDisplayOf(ticket: OpenTicket): string {
  const assets = ticket.assets;
  if (!assets) return "unknown asset";
  const asset = Array.isArray(assets) ? assets[0] : assets;
  if (!asset) return "unknown asset";
  const sites = Array.isArray(asset.sites) ? asset.sites[0] : asset.sites;
  return assetLabel({ ...asset, sites });
}

// Per-ticket org id, for resolving which SLA policy applies (schema_step40.sql
// — a client with their own contracted tier escalates against their own
// numbers, not the global default). Same array-or-object defensiveness as
// assetDisplayOf above.
function organizationIdOf(ticket: OpenTicket): string | null {
  const assets = ticket.assets;
  if (!assets) return null;
  const asset = Array.isArray(assets) ? assets[0] : assets;
  return asset?.organization_id ?? null;
}

export type SlaEscalationEvent = {
  ticketId: string;
  ticketRef: string;
  assetTag: string;
  eventType: "response_approaching" | "response_breached" | "resolution_approaching" | "resolution_breached";
  hoursElapsed: number;
  alertId: string;
  priorityBumped: boolean;
};

export type SlaCheckResult = {
  checked: number;
  escalated: SlaEscalationEvent[];
  skipped: number;
};

export async function runSlaEscalationCheck(): Promise<SlaCheckResult> {
  const supabase = createServiceRoleClient();

  // Anything not yet closed is still "the SLA clock is running" for at
  // least the resolution dimension — parts_pending included, same as the
  // dashboard's own SLA math, which doesn't special-case it either.
  const { data: tickets, error } = await supabase
    .from("service_tickets")
    .select(
      "id, description, status, priority, created_at, first_response_at, asset_id, assets(asset_tag, serial_number, organization_id, sites(address))",
    )
    .neq("status", "closed");

  if (error) {
    throw new Error(`Failed to load open tickets: ${error.message}`);
  }

  // One query for every org's policy (global + overrides) instead of one
  // lookup per ticket — schema_step40.sql.
  const policyMap = await getSlaPolicyMap(supabase);

  const escalated: SlaEscalationEvent[] = [];
  let skipped = 0;
  const now = new Date().toISOString();

  for (const ticket of (tickets ?? []) as OpenTicket[]) {
    const ref = ticketRef(ticket.id);
    const tag = assetDisplayOf(ticket);
    const hoursOpen = hoursBetween(ticket.created_at, now);
    const targets = resolveSlaTargets(policyMap, organizationIdOf(ticket));

    // Response dimension only applies while nobody has responded yet —
    // once first_response_at is stamped (acknowledgeTicket / resolveTicket
    // / updateTicketStatus in app/assets/tickets-actions.ts), the response
    // SLA has already been either met or missed, and there's nothing left
    // to escalate for it.
    if (!ticket.first_response_at) {
      const level = classify(hoursOpen, targets.responseTargetHours);
      if (level) {
        const applied = await tryEscalate(supabase, {
          ticket,
          ref,
          tag,
          hoursElapsed: hoursOpen,
          dimension: "response",
          level,
          targetHours: targets.responseTargetHours,
        });
        if (applied) escalated.push(applied);
        else skipped++;
      }
    }

    // Resolution dimension applies to every ticket in this query (none are
    // closed), regardless of response state.
    const resolutionLevel = classify(hoursOpen, targets.resolutionTargetHours);
    if (resolutionLevel) {
      const applied = await tryEscalate(supabase, {
        ticket,
        ref,
        tag,
        hoursElapsed: hoursOpen,
        dimension: "resolution",
        level: resolutionLevel,
        targetHours: targets.resolutionTargetHours,
      });
      if (applied) escalated.push(applied);
      else skipped++;
    }
  }

  return { checked: tickets?.length ?? 0, escalated, skipped };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryEscalate(
  supabase: any,
  opts: {
    ticket: OpenTicket;
    ref: string;
    tag: string;
    hoursElapsed: number;
    dimension: "response" | "resolution";
    level: "approaching" | "breached";
    targetHours: number;
  },
): Promise<SlaEscalationEvent | null> {
  const { ticket, ref, tag, hoursElapsed, dimension, level, targetHours } = opts;
  const eventType = `${dimension}_${level}` as SlaEscalationEvent["eventType"];

  // Idempotency check — the unique(ticket_id, event_type) constraint on
  // sla_escalations is the real guarantee; checking first just avoids a
  // needless insert-and-fail round trip on every re-run.
  const { data: existing } = await supabase
    .from("sla_escalations")
    .select("id")
    .eq("ticket_id", ticket.id)
    .eq("event_type", eventType)
    .maybeSingle();
  if (existing) return null;

  const dimensionLabel = dimension === "response" ? "First response" : "Resolution";
  const title =
    level === "breached"
      ? `${dimensionLabel} SLA breached — ${ref}`
      : `${dimensionLabel} SLA at risk — ${ref}`;
  const description =
    level === "breached"
      ? `${ref} on ${tag} has been open ${hoursElapsed.toFixed(1)}h with no ${dimension === "response" ? "response" : "resolution"} — past the ${targetHours}h target. Priority escalated to High.`
      : `${ref} on ${tag} has been open ${hoursElapsed.toFixed(1)}h — approaching the ${targetHours}h ${dimension} target.`;

  const { data: alert, error: alertError } = await supabase
    .from("alerts")
    .insert({
      asset_id: ticket.asset_id,
      title,
      description,
      severity: level === "breached" ? "critical" : "caution",
      created_by: null,
    })
    .select("id")
    .single();
  if (alertError || !alert) {
    throw new Error(alertError?.message ?? "alert insert returned no row");
  }

  // Beyond the in-app alert/bell — same title/description, so the email
  // never says anything different from what's already in the Alerts tab.
  // Non-fatal (notifyStaff never throws): a missing/misconfigured
  // RESEND_API_KEY shouldn't block the escalation itself.
  await notifyStaff(title, description);

  let priorityBumped = false;
  if (level === "breached" && ticket.priority !== "high") {
    const { error: priorityError } = await supabase
      .from("service_tickets")
      .update({ priority: "high" })
      .eq("id", ticket.id);
    if (priorityError) {
      throw new Error(priorityError.message);
    }
    priorityBumped = true;
  }

  const { error: escalationError } = await supabase.from("sla_escalations").insert({
    ticket_id: ticket.id,
    event_type: eventType,
    alert_id: alert.id,
  });
  if (escalationError) {
    throw new Error(escalationError.message);
  }

  return {
    ticketId: ticket.id,
    ticketRef: ref,
    assetTag: tag,
    eventType,
    hoursElapsed,
    alertId: alert.id,
    priorityBumped,
  };
}
