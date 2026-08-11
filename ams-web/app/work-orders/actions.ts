"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";

// Staff-only end to end — see the note in schema_step9.sql. Unlike
// service_tickets, clients never raise or view work orders; this is the
// internal maintenance-operations queue.
//
// Optionally spawned from a ticket (?ticket_id= on /work-orders/new — see
// the "Create Work Order" link on a ticket's row). When that's the case,
// schema_step16.sql's service_tickets.work_order_id gets pointed at the
// new work order, and the ticket is nudged to "in_progress" — creating a
// work order for it is itself a form of acknowledging it, same as the
// explicit acknowledgeTicket action.
export async function createWorkOrder(formData: FormData) {
  await requireStaff("/work-orders");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const assetId = String(formData.get("asset_id") ?? "");
  const taskTitle = String(formData.get("task_title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const workType = String(formData.get("work_type") ?? "corrective");
  const priority = String(formData.get("priority") ?? "medium");
  const leadTechnician = String(formData.get("lead_technician") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "");
  const ticketId = String(formData.get("ticket_id") ?? "").trim() || null;

  if (!assetId) {
    redirect(
      `/work-orders/new?error=${encodeURIComponent("Please select an asset.")}${ticketId ? `&ticket_id=${ticketId}` : ""}`,
    );
  }
  if (!taskTitle) {
    redirect(
      `/work-orders/new?error=${encodeURIComponent("Please enter a task title.")}${ticketId ? `&ticket_id=${ticketId}` : ""}`,
    );
  }

  const { data: created, error } = await supabase
    .from("work_orders")
    .insert({
      asset_id: assetId,
      task_title: taskTitle,
      description: description || null,
      work_type: workType,
      priority,
      status: "open",
      lead_technician: leadTechnician || null,
      due_date: dueDate || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    redirect(
      `/work-orders/new?error=${encodeURIComponent(error?.message ?? "Failed to create work order.")}`,
    );
  }

  // Mirror every work order onto the Service Calendar (schema_step17.sql),
  // scoped to its due date so it shows up alongside calibrations,
  // maintenance, firmware, and inspection events. Falls back to today if no
  // due date was given, so it still appears rather than silently not
  // showing up. Non-fatal: the work order itself is already created either
  // way, so a failure here shouldn't block the redirect.
  const { error: calendarError } = await supabase.from("calendar_events").insert({
    asset_id: assetId,
    title: taskTitle,
    event_type: "work_order",
    event_date: dueDate || new Date().toISOString().slice(0, 10),
    notes: description || null,
    work_order_id: created!.id,
    created_by: user?.id ?? null,
  });
  revalidatePath("/calendar");

  if (ticketId) {
    const { data: ticket } = await supabase
      .from("service_tickets")
      .select("status, first_response_at")
      .eq("id", ticketId)
      .single();

    const { error: linkError } = await supabase
      .from("service_tickets")
      .update({
        work_order_id: created!.id,
        status: ticket?.status === "open" ? "in_progress" : ticket?.status,
        first_response_at:
          ticket?.first_response_at ?? new Date().toISOString(),
      })
      .eq("id", ticketId);

    revalidatePath(`/assets/${assetId}`);
    revalidatePath("/tickets");
    revalidatePath("/work-orders");

    // The work order itself was created successfully either way — don't
    // lose that. But if linking it back to the ticket failed (most likely
    // cause: schema_step16.sql hasn't been run yet, so work_order_id
    // doesn't exist on service_tickets), say so explicitly instead of
    // silently leaving the ticket looking unlinked with no explanation.
    //
    // Land on the Work Orders page either way — same destination as a
    // plain (non-ticket) work order creation, so the flow is consistent
    // regardless of entry point.
    const linkIssues = [
      linkError &&
        `couldn't link it to the ticket: ${linkError.message} (have you run schema_step16.sql?)`,
      calendarError &&
        `couldn't add it to the calendar: ${calendarError.message} (have you run schema_step17.sql?)`,
    ].filter(Boolean);

    if (linkIssues.length > 0) {
      redirect(
        `/work-orders?created=1&error=${encodeURIComponent(
          `Work order created, but ${linkIssues.join("; ")}.`,
        )}`,
      );
    }

    redirect("/work-orders?created=1");
  }

  if (calendarError) {
    redirect(
      `/work-orders?created=1&error=${encodeURIComponent(
        `Work order created, but couldn't add it to the calendar: ${calendarError.message} (have you run schema_step17.sql?).`,
      )}`,
    );
  }

  revalidatePath("/work-orders");
  redirect("/work-orders?created=1");
}

// Called directly from the client-side status <select> in
// work-orders-table.tsx (Next.js allows invoking a "use server" action from
// an event handler, not just a <form action>). No redirect — the table
// re-renders in place via revalidatePath + the client component's own state.
export async function updateWorkOrderStatus(id: string, status: string) {
  await requireStaff("/work-orders");

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("work_orders")
    .select("closed_at")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("work_orders")
    .update({
      status,
      updated_at: new Date().toISOString(),
      // Stamped once, the first time this reaches "closed" — same pattern
      // as service_tickets.resolved_at. Never cleared if later reopened,
      // so the record of when it was first closed stays intact.
      closed_at: status === "closed" ? (current?.closed_at ?? new Date().toISOString()) : current?.closed_at,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  // Keep the auto-created calendar event (schema_step17.sql) in sync — a
  // work order marked "closed" shouldn't keep showing as an open item on
  // the Service Calendar. Note: calendar_events.status has its own separate
  // enum (still "completed"/"scheduled", untouched by schema_step21.sql) —
  // only the *check* below moved from "completed" to "closed" because
  // that's the new work_order_status terminal value; the value written to
  // calendar_events stays "completed" on purpose. Silently ignored if
  // schema_step17.sql hasn't been run (no work_order_id column to match
  // on); status updates on the work order itself already succeeded above
  // regardless.
  await supabase
    .from("calendar_events")
    .update({ status: status === "closed" ? "completed" : "scheduled" })
    .eq("work_order_id", id);

  // Mirror the status onto the ticket this work order was created from
  // (schema_step16.sql's service_tickets.work_order_id), if any.
  // work_order_status and ticket_status share the exact same vocabulary as
  // of schema_step21.sql — Open / In Progress / Parts Pending / Closed —
  // so the value passes straight through. resolved_at gets stamped the
  // first time a linked ticket reaches "closed", same as the explicit
  // "Mark Closed" action would. Silently skipped if schema_step16.sql
  // hasn't been run yet, or if this work order was never linked to a
  // ticket in the first place.
  const { data: linkedTicket } = await supabase
    .from("service_tickets")
    .select("id, resolved_at")
    .eq("work_order_id", id)
    .maybeSingle();

  if (linkedTicket) {
    const ticketStatus = status;
    await supabase
      .from("service_tickets")
      .update({
        status: ticketStatus,
        resolved_at:
          ticketStatus === "closed"
            ? (linkedTicket.resolved_at ?? new Date().toISOString())
            : linkedTicket.resolved_at,
      })
      .eq("id", linkedTicket.id);
    revalidatePath("/tickets");
    revalidatePath("/assets");
  }

  revalidatePath("/work-orders");
  revalidatePath("/calendar");
}
