"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";

// Anyone who can see the asset can raise a ticket on it — RLS restricts a
// client_viewer to only their own organization's assets (see
// "clients can raise tickets on own assets" policy in schema.sql).
export async function createTicket(assetId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "medium");

  if (!description) {
    redirect(
      `/assets/${assetId}?error=${encodeURIComponent("Please describe the issue.")}`,
    );
  }

  const { error } = await supabase.from("service_tickets").insert({
    asset_id: assetId,
    raised_by: user?.id ?? null,
    description,
    priority,
    status: "open",
  });

  if (error) {
    redirect(`/assets/${assetId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/assets/${assetId}`);
  redirect(`/assets/${assetId}?ticket=submitted`);
}

// Client- and staff-accessible. Same insert as createTicket, but for the
// global "Request New Service" form (/tickets/new), where the asset is
// picked from a dropdown on the form itself instead of being bound from
// the asset detail page you're already on. RLS is the real gate here —
// "clients can raise tickets on own assets" restricts a client_viewer to
// their own org regardless of what asset_id gets submitted; "staff manage
// tickets" lets staff raise one for any org.
export async function createGlobalTicket(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const assetId = String(formData.get("asset_id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "medium");

  if (!assetId) {
    redirect(`/tickets/new?error=${encodeURIComponent("Please select an asset.")}`);
  }
  if (!description) {
    redirect(
      `/tickets/new?error=${encodeURIComponent("Please describe the issue.")}`,
    );
  }

  const { error } = await supabase.from("service_tickets").insert({
    asset_id: assetId,
    raised_by: user?.id ?? null,
    description,
    priority,
    status: "open",
  });

  if (error) {
    redirect(`/tickets/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect("/tickets?created=1");
}

// Staff-only. Marks the ticket "in_progress" and stamps first_response_at —
// this is the event the SLA Performance widget measures response time
// against. Only stamps it the first time; re-acknowledging (there isn't a
// UI path back to this once in_progress, but just in case) won't overwrite
// an earlier real response time.
export async function acknowledgeTicket(assetId: string, ticketId: string) {
  await requireStaff(`/assets/${assetId}`);

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("service_tickets")
    .select("first_response_at")
    .eq("id", ticketId)
    .single();

  const { error } = await supabase
    .from("service_tickets")
    .update({
      status: "in_progress",
      first_response_at: ticket?.first_response_at ?? new Date().toISOString(),
    })
    .eq("id", ticketId);

  if (error) {
    redirect(`/assets/${assetId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/assets/${assetId}`);
  redirect(`/assets/${assetId}`);
}

// Staff-only. RLS also enforces this at the database level, but without
// this check a non-staff call would silently match zero rows and redirect
// as if it worked — requireStaff() gives a clean redirect instead.
//
// ticket_status's terminal value is "closed" as of schema_step21.sql
// (renamed from "resolved", to match work_order_status's vocabulary).
export async function resolveTicket(assetId: string, ticketId: string) {
  await requireStaff(`/assets/${assetId}`);

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("service_tickets")
    .select("first_response_at")
    .eq("id", ticketId)
    .single();

  const { error } = await supabase
    .from("service_tickets")
    .update({
      status: "closed",
      // A ticket can go straight from open to closed without an explicit
      // acknowledgement step — back-fill first_response_at in that case so
      // it isn't left null and excluded from the response-time average.
      first_response_at: ticket?.first_response_at ?? new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    })
    .eq("id", ticketId);

  if (error) {
    redirect(`/assets/${assetId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/assets/${assetId}`);
  redirect(`/assets/${assetId}`);
}

// Staff-only. New as of schema_step21.sql — a ticket blocked on a part
// shows this distinctly rather than sitting in "in_progress" indefinitely.
// Doesn't touch first_response_at/resolved_at; a part-pending ticket isn't
// closed yet, so neither timestamp is appropriate here.
export async function markTicketPartsPending(assetId: string, ticketId: string) {
  await requireStaff(`/assets/${assetId}`);

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("service_tickets")
    .select("first_response_at")
    .eq("id", ticketId)
    .single();

  const { error } = await supabase
    .from("service_tickets")
    .update({
      status: "parts_pending",
      first_response_at: ticket?.first_response_at ?? new Date().toISOString(),
    })
    .eq("id", ticketId);

  if (error) {
    redirect(`/assets/${assetId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/assets/${assetId}`);
  redirect(`/assets/${assetId}`);
}
