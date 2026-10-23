import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const TICKET_STATUSES = ["open", "in_progress", "parts_pending", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

// The same change updateTicketStatus (app/assets/tickets-actions.ts) makes from the
// web app's ticket modal, for callers that have no web session: the HorizonCare360
// Assist mobile app, through /api/ticket-status. Kept in step with that action.
//
// `supabase` carries the CALLER'S token, so row-level security and the field
// engineer column limit (schema_step57.sql) decide whether the ticket may be
// changed at all. Only after that succeeds does it mirror the status onto a linked
// work order and its calendar event, the way the web action does. That mirror
// uses the service role because a field engineer may not write calendar events
// or other people's work orders directly, yet the web app's own change keeps the
// three in step. It touches only the work order linked to the ticket the caller
// has just legitimately changed, and only its status and closed_at.
//
// Returns "not-found" when the caller cannot read the ticket (a ticket that does
// not exist and one they may not see look the same) and "refused" when they can
// read it but may not change it.
export async function applyTicketStatus(
  supabase: SupabaseClient,
  ticketId: string,
  status: TicketStatus,
): Promise<"ok" | "not-found" | "refused"> {
  const { data: ticket } = await supabase
    .from("service_tickets")
    .select("first_response_at, resolved_at, work_order_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return "not-found";

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("service_tickets")
    .update({
      status,
      // Any status change beyond "open" counts as a first response if none has
      // been recorded yet: it is what the SLA Performance widget measures.
      first_response_at:
        status === "open" ? (ticket.first_response_at ?? null) : (ticket.first_response_at ?? now),
      resolved_at: status === "closed" ? (ticket.resolved_at ?? now) : ticket.resolved_at,
    })
    .eq("id", ticketId)
    .select("id");
  // An update that row-level security hides matches no rows and raises no error.
  if (error || !updated || updated.length === 0) return "refused";

  if (ticket.work_order_id) {
    const admin = createServiceRoleClient();
    const { data: linkedWo } = await admin
      .from("work_orders")
      .select("closed_at")
      .eq("id", ticket.work_order_id)
      .maybeSingle();
    await admin
      .from("work_orders")
      .update({
        status,
        closed_at: status === "closed" ? (linkedWo?.closed_at ?? now) : linkedWo?.closed_at,
      })
      .eq("id", ticket.work_order_id);
    await admin
      .from("calendar_events")
      .update({ status: status === "closed" ? "completed" : "scheduled" })
      .eq("work_order_id", ticket.work_order_id);
  }

  return "ok";
}
