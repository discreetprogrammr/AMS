import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SLA_RESPONSE_TARGET_HOURS, SLA_RESOLUTION_TARGET_HOURS, hoursBetween } from "@/lib/sla";
import { ticketRef } from "@/lib/format";

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

type OpenTicket = {
  id: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  first_response_at: string | null;
  asset_id: string;
  assets: { asset_tag: string } | { asset_tag: string }[] | null;
};

function assetTagOf(ticket: OpenTicket): string {
  const assets = ticket.assets;
  if (!assets) return "unknown asset";
  return Array.isArray(assets) ? (assets[0]?.asset_tag ?? "unknown asset") : assets.asset_tag;
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
    .select("id, description, status, priority, created_at, first_response_at, asset_id, assets(asset_tag)")
    .neq("status", "closed");

  if (error) {
    throw new Error(`Failed to load open tickets: ${error.message}`);
  }

  const escalated: SlaEscalationEvent[] = [];
  let skipped = 0;
  const now = new Date().toISOString();

  for (const ticket of (tickets ?? []) as OpenTicket[]) {
    const ref = ticketRef(ticket.id);
    const tag = assetTagOf(ticket);
    const hoursOpen = hoursBetween(ticket.created_at, now);

    // Response dimension only applies while nobody has responded yet —
    // once first_response_at is stamped (acknowledgeTicket / resolveTicket
    // / updateTicketStatus in app/assets/tickets-actions.ts), the response
    // SLA has already been either met or missed, and there's nothing left
    // to escalate for it.
    if (!ticket.first_response_at) {
      const level = classify(hoursOpen, SLA_RESPONSE_TARGET_HOURS);
      if (level) {
        const applied = await tryEscalate(supabase, {
          ticket,
          ref,
          tag,
          hoursElapsed: hoursOpen,
          dimension: "response",
          level,
          targetHours: SLA_RESPONSE_TARGET_HOURS,
        });
        if (applied) escalated.push(applied);
        else skipped++;
      }
    }

    // Resolution dimension applies to every ticket in this query (none are
    // closed), regardless of response state.
    const resolutionLevel = classify(hoursOpen, SLA_RESOLUTION_TARGET_HOURS);
    if (resolutionLevel) {
      const applied = await tryEscalate(supabase, {
        ticket,
        ref,
        tag,
        hoursElapsed: hoursOpen,
        dimension: "resolution",
        level: resolutionLevel,
        targetHours: SLA_RESOLUTION_TARGET_HOURS,
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
