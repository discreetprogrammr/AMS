"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";

// Starts a new inventory cycle for a site and auto-populates one checklist
// item per asset currently at that site — the "scheduled cycle per site
// with a checklist" from the spec's inventory cycle workflow.
export async function createInventoryCycle(formData: FormData) {
  await requireStaff();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const siteId = String(formData.get("site_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();

  if (!siteId || !label) {
    redirect(
      `/inventory/new?error=${encodeURIComponent("Site and label are required.")}`,
    );
  }

  const { data: cycle, error: cycleError } = await supabase
    .from("inventory_cycles")
    .insert({ site_id: siteId, label, created_by: user?.id ?? null })
    .select("id")
    .single();

  if (cycleError || !cycle) {
    redirect(
      `/inventory/new?error=${encodeURIComponent(cycleError?.message ?? "Could not create cycle.")}`,
    );
    return;
  }

  const { data: assetsAtSite } = await supabase
    .from("assets")
    .select("id")
    .eq("site_id", siteId);

  if (assetsAtSite && assetsAtSite.length > 0) {
    const items = assetsAtSite.map((a) => ({
      inventory_cycle_id: cycle.id,
      asset_id: a.id,
    }));
    await supabase.from("inventory_cycle_items").insert(items);
  }

  revalidatePath("/inventory");
  redirect(`/inventory/${cycle.id}`);
}

// Checks off one asset in the cycle, with optional condition notes.
export async function verifyItem(
  cycleId: string,
  itemId: string,
  formData: FormData,
) {
  await requireStaff(`/inventory/${cycleId}`);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const conditionNotes = String(formData.get("condition_notes") ?? "").trim();

  await supabase
    .from("inventory_cycle_items")
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
      verified_by: user?.id ?? null,
      condition_notes: conditionNotes || null,
    })
    .eq("id", itemId);

  revalidatePath(`/inventory/${cycleId}`);
  redirect(`/inventory/${cycleId}`);
}

// Reopens an item if it was checked off by mistake.
export async function unverifyItem(cycleId: string, itemId: string) {
  await requireStaff(`/inventory/${cycleId}`);

  const supabase = await createClient();

  await supabase
    .from("inventory_cycle_items")
    .update({ verified: false, verified_at: null, verified_by: null })
    .eq("id", itemId);

  revalidatePath(`/inventory/${cycleId}`);
  redirect(`/inventory/${cycleId}`);
}

// Closes the cycle. Doesn't require 100% verification — unverified items
// at close time ARE the discrepancies the reconciliation export surfaces,
// mirroring how a real physical-count reconciliation works.
export async function completeCycle(cycleId: string) {
  await requireStaff(`/inventory/${cycleId}`);

  const supabase = await createClient();

  await supabase
    .from("inventory_cycles")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", cycleId);

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${cycleId}`);
  redirect(`/inventory/${cycleId}`);
}
