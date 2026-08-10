"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";

// Staff-only to create/manage, but unlike work_orders/alerts/inspections,
// calendar_events is readable by clients too (see the note in
// schema_step12.sql) — RLS handles that read scoping, this action is just
// the write side.
export async function createCalendarEvent(formData: FormData) {
  await requireStaff("/calendar");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const assetId = String(formData.get("asset_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const eventType = String(formData.get("event_type") ?? "maintenance");
  const eventDate = String(formData.get("event_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!assetId) {
    redirect(
      `/calendar/new?error=${encodeURIComponent("Please select an asset.")}`,
    );
  }
  if (!title) {
    redirect(
      `/calendar/new?error=${encodeURIComponent("Please enter a title.")}`,
    );
  }
  if (!eventDate) {
    redirect(
      `/calendar/new?error=${encodeURIComponent("Please choose a date.")}`,
    );
  }

  const { error } = await supabase.from("calendar_events").insert({
    asset_id: assetId,
    title,
    event_type: eventType,
    event_date: eventDate,
    notes: notes || null,
    created_by: user?.id ?? null,
  });

  if (error) {
    redirect(`/calendar/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/calendar");
  redirect("/calendar?created=1");
}

// Called directly from the client-side "Mark Completed" button in
// calendar-view.tsx — same pattern as updateWorkOrderStatus.
export async function markEventCompleted(id: string) {
  await requireStaff("/calendar");

  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_events")
    .update({ status: "completed" })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/calendar");
}
