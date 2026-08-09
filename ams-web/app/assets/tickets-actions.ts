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

// Staff-only. RLS also enforces this at the database level, but without
// this check a non-staff call would silently match zero rows and redirect
// as if it worked — requireStaff() gives a clean redirect instead.
export async function resolveTicket(assetId: string, ticketId: string) {
  await requireStaff(`/assets/${assetId}`);

  const supabase = await createClient();

  const { error } = await supabase
    .from("service_tickets")
    .update({ status: "resolved" })
    .eq("id", ticketId);

  if (error) {
    redirect(`/assets/${assetId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/assets/${assetId}`);
  redirect(`/assets/${assetId}`);
}
