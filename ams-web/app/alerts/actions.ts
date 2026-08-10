"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";

// Staff-only end to end, same reasoning as work_orders (Step 9): AMS
// doesn't have a live monitoring/telemetry pipeline yet, so alerts are
// logged by staff — e.g. from a site visit or a phone call — rather than
// generated automatically. The schema is ready for an automated source
// later without any change here.
export async function createAlert(formData: FormData) {
  await requireStaff("/alerts");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const assetId = String(formData.get("asset_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const severity = String(formData.get("severity") ?? "caution");

  if (!title) {
    redirect(`/alerts/new?error=${encodeURIComponent("Please enter a title.")}`);
  }

  const { error } = await supabase.from("alerts").insert({
    asset_id: assetId || null,
    title,
    description: description || null,
    severity,
    created_by: user?.id ?? null,
  });

  if (error) {
    redirect(`/alerts/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/alerts");
  redirect("/alerts?created=1");
}

// Called directly from the client-side "Mark Read" button in alerts-feed.tsx
// — no redirect, the feed just re-renders once revalidatePath runs.
export async function markAlertRead(id: string) {
  await requireStaff("/alerts");

  const supabase = await createClient();
  const { error } = await supabase
    .from("alerts")
    .update({ is_read: true })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/alerts");
}

// Resolving also implies read — no point leaving a resolved alert marked
// unread in the feed.
export async function resolveAlert(id: string) {
  await requireStaff("/alerts");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("alerts")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id ?? null,
      is_read: true,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/alerts");
}
