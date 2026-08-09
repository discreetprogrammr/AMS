"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

// Staff-only in practice — the "staff manage tickets" RLS policy is what
// actually enforces this; a client_viewer's update would just fail silently
// against RLS (no matching row to update) even if this were called.
export async function resolveTicket(assetId: string, ticketId: string) {
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
