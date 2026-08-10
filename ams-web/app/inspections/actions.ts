"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";

// Standard field-inspection checklist, grouped into the same three
// categories the reference app uses. Generic enough to cover screening,
// water-generation, and pump equipment; can be tailored per
// equipment_type later if a client needs something more specific.
const CHECKLIST_TEMPLATE: { category: string; item_name: string }[] = [
  { category: "Exterior & Safety", item_name: "Housing / enclosure condition" },
  { category: "Exterior & Safety", item_name: "Warning labels & signage intact" },
  { category: "Exterior & Safety", item_name: "Emergency stop function" },
  { category: "Exterior & Safety", item_name: "Power cabling & connections" },
  { category: "Imaging & Detection", item_name: "Image / detection quality test" },
  { category: "Imaging & Detection", item_name: "Calibration within tolerance" },
  { category: "Imaging & Detection", item_name: "Sensor / detector alignment" },
  { category: "Imaging & Detection", item_name: "Conveyor / mechanical operation" },
  { category: "System & Software", item_name: "Firmware / software version current" },
  { category: "System & Software", item_name: "System logs reviewed for errors" },
  { category: "System & Software", item_name: "Network / connectivity check" },
  { category: "System & Software", item_name: "Backup / failover test" },
];

// Starts a new inspection for an asset and bulk-creates the 12-item
// checklist against it — same "generate rows in bulk at creation time"
// pattern as createInventoryCycle.
export async function createInspection(formData: FormData) {
  await requireStaff("/inspections");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const assetId = String(formData.get("asset_id") ?? "");
  const technicianName = String(formData.get("technician_name") ?? "").trim();
  const inspectionDate = String(formData.get("inspection_date") ?? "");

  if (!assetId) {
    redirect(
      `/inspections/new?error=${encodeURIComponent("Please select an asset.")}`,
    );
  }

  const { data: inspection, error } = await supabase
    .from("inspections")
    .insert({
      asset_id: assetId,
      technician_name: technicianName || null,
      inspection_date: inspectionDate || new Date().toISOString().slice(0, 10),
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !inspection) {
    redirect(
      `/inspections/new?error=${encodeURIComponent(error?.message ?? "Could not start inspection.")}`,
    );
    return;
  }

  const items = CHECKLIST_TEMPLATE.map((t) => ({
    inspection_id: inspection.id,
    category: t.category,
    item_name: t.item_name,
  }));
  await supabase.from("inspection_items").insert(items);

  revalidatePath("/inspections");
  redirect(`/inspections/${inspection.id}`);
}

const RESULT_CYCLE: Record<string, string> = {
  pass: "attention",
  attention: "fail",
  fail: "pass",
};

// Tap-to-cycle: pass -> attention -> fail -> pass, same behavior as the
// reference app's checklist. currentResult is passed in from the page
// (already known server-side) so this doesn't need to re-fetch the item
// just to compute the next value.
export async function cycleItemResult(
  inspectionId: string,
  itemId: string,
  currentResult: string,
) {
  await requireStaff(`/inspections/${inspectionId}`);

  const supabase = await createClient();
  const next = RESULT_CYCLE[currentResult] ?? "pass";

  await supabase
    .from("inspection_items")
    .update({ result: next })
    .eq("id", itemId);

  revalidatePath(`/inspections/${inspectionId}`);
  redirect(`/inspections/${inspectionId}`);
}

// Signs off the inspection. The detail page hides the cycle buttons once
// status is "submitted" — RLS still lets staff correct it at the DB level
// if a genuine correction is needed, same defense-in-depth approach used
// everywhere else in AMS (the UI lock isn't the security boundary).
export async function submitInspection(inspectionId: string) {
  await requireStaff(`/inspections/${inspectionId}`);

  const supabase = await createClient();
  await supabase
    .from("inspections")
    .update({ status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", inspectionId);

  revalidatePath("/inspections");
  revalidatePath(`/inspections/${inspectionId}`);
  redirect(`/inspections/${inspectionId}`);
}
