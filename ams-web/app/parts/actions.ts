"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";

// Staff-only end to end — spare-parts stock is internal ops, not part of
// the client portal, same reasoning as work_orders/alerts/inventory_cycles.
export async function createPart(formData: FormData) {
  await requireStaff("/parts");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const unit = String(formData.get("unit") ?? "pcs").trim() || "pcs";
  const quantityOnHand = Number(formData.get("quantity_on_hand") ?? 0);
  const reorderLevel = Number(formData.get("reorder_level") ?? 0);
  const unitCostRaw = String(formData.get("unit_cost") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) {
    redirect(`/parts/new?error=${encodeURIComponent("Please enter a part name.")}`);
  }

  const { error } = await supabase.from("parts").insert({
    name,
    sku: sku || null,
    category: category || null,
    unit,
    quantity_on_hand: Number.isFinite(quantityOnHand) ? quantityOnHand : 0,
    reorder_level: Number.isFinite(reorderLevel) ? reorderLevel : 0,
    unit_cost: unitCostRaw ? Number(unitCostRaw) : null,
    notes: notes || null,
    created_by: user?.id ?? null,
  });

  if (error) {
    redirect(`/parts/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/parts");
  redirect("/parts?created=1");
}

// Direct field edit, including quantity_on_hand — same "just edit the
// field" pattern every other module in this app uses (Assets, Clients,
// etc.), rather than a separate restock-transaction UI. The parts_audit
// trigger (schema_step31.sql) already captures the before/after row on
// every update, so a manual stock correction is still traceable in the
// Audit Log even without a dedicated adjustment history for this alone.
export async function updatePart(id: string, formData: FormData) {
  await requireStaff("/parts");

  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const unit = String(formData.get("unit") ?? "pcs").trim() || "pcs";
  const quantityOnHand = Number(formData.get("quantity_on_hand") ?? 0);
  const reorderLevel = Number(formData.get("reorder_level") ?? 0);
  const unitCostRaw = String(formData.get("unit_cost") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) {
    redirect(`/parts/${id}?error=${encodeURIComponent("Please enter a part name.")}`);
  }

  const { error } = await supabase
    .from("parts")
    .update({
      name,
      sku: sku || null,
      category: category || null,
      unit,
      quantity_on_hand: Number.isFinite(quantityOnHand) ? quantityOnHand : 0,
      reorder_level: Number.isFinite(reorderLevel) ? reorderLevel : 0,
      unit_cost: unitCostRaw ? Number(unitCostRaw) : null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/parts/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/parts");
  revalidatePath(`/parts/${id}`);
  redirect(`/parts/${id}?saved=1`);
}
