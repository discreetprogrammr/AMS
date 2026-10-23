import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { TicketStatus } from "@/lib/ticket-status";

// The same change updateWorkOrderStatus (app/work-orders/actions.ts) makes from the web
// app's work orders table, for callers that have no web session: the HorizonCare360
// Assist mobile app, through /api/work-order-status. Kept in step with that action.
//
// `supabase` carries the CALLER'S token, so row-level security and the field engineer
// column limit (schema_step57.sql) decide whether the work order may be changed at
// all: a field engineer may change only the ones assigned to them, and only `status`,
// `closed_at` and `updated_at`. The linked ticket is then changed with the same caller
// token (a field engineer may change a ticket's status and resolved time).
//
// The one use of the service role is the calendar event the work order created
// (schema_step17.sql). A field engineer may not write calendar events, but the web
// app keeps the event in step with the work order, and a closed job should not stay on
// the Service Calendar as open. It touches only the events of the work order the caller
// has just legitimately changed, and only their status.
//
// Work orders and tickets share one status vocabulary (schema_step21.sql).
//
// Returns "not-found" when the caller cannot read the work order (a missing one and one
// they may not see look the same), "refused" when they can read it but may not change it,
// and otherwise "ok" with the id of the ticket it was created from, if any, so the caller
// can tell the client.
export async function applyWorkOrderStatus(
  supabase: SupabaseClient,
  workOrderId: string,
  status: TicketStatus,
): Promise<{ result: "ok"; linkedTicketId: string | null } | { result: "not-found" } | { result: "refused" }> {
  const { data: current } = await supabase
    .from("work_orders")
    .select("closed_at")
    .eq("id", workOrderId)
    .maybeSingle();
  if (!current) return { result: "not-found" };

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("work_orders")
    .update({
      status,
      updated_at: now,
      // Stamped once, the first time it reaches "closed", and never cleared if it is reopened.
      closed_at: status === "closed" ? (current.closed_at ?? now) : current.closed_at,
    })
    .eq("id", workOrderId)
    .select("id");
  // An update that row-level security hides matches no rows and raises no error.
  if (error || !updated || updated.length === 0) return { result: "refused" };

  // calendar_events.status has its own vocabulary: "completed" or "scheduled".
  const { data: events, error: calendarError } = await createServiceRoleClient()
    .from("calendar_events")
    .update({ status: status === "closed" ? "completed" : "scheduled" })
    .eq("work_order_id", workOrderId)
    .select("id");
  if (calendarError) {
    // eslint-disable-next-line no-console
    console.error("[work-order-status] Could not update the calendar event:", calendarError.message);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[work-order-status] calendar events updated: ${events?.length ?? 0}`);
  }

  // Mirror onto the ticket this work order was created from, if any.
  const { data: linkedTicket } = await supabase
    .from("service_tickets")
    .select("id, resolved_at")
    .eq("work_order_id", workOrderId)
    .maybeSingle();
  if (!linkedTicket) return { result: "ok", linkedTicketId: null };

  const { error: ticketError } = await supabase
    .from("service_tickets")
    .update({
      status,
      resolved_at: status === "closed" ? (linkedTicket.resolved_at ?? now) : linkedTicket.resolved_at,
    })
    .eq("id", linkedTicket.id);
  if (ticketError) {
    // eslint-disable-next-line no-console
    console.error("[work-order-status] Could not update the linked ticket:", ticketError.message);
  }

  return { result: "ok", linkedTicketId: linkedTicket.id };
}
