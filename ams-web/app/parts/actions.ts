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

// Logs a delivery from a supplier — inserts into part_receipts, which
// increments parts.quantity_on_hand via the part_receipts_increment_stock
// trigger (schema_step32.sql), the mirror of how logPartUsage
// (app/work-orders/actions.ts) decrements it. No redirect — called
// directly from receive-stock-modal.tsx's submit handler, same pattern as
// logPartUsage.
export async function receiveStock(
  partId: string,
  quantityReceived: number,
  supplier: string,
  referenceNumber: string,
  unitCost: number | null,
  notes: string,
) {
  await requireStaff("/parts");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: part } = await supabase
    .from("parts")
    .select("name")
    .eq("id", partId)
    .single();

  if (!part) {
    throw new Error("That part couldn't be found — it may have been deleted.");
  }

  const { error } = await supabase.from("part_receipts").insert({
    part_id: partId,
    part_name_snapshot: part.name,
    quantity_received: quantityReceived,
    supplier: supplier || null,
    reference_number: referenceNumber || null,
    unit_cost: unitCost,
    notes: notes || null,
    received_by: user?.id ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);
}
