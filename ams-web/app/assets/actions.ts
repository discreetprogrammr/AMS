"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const str = String(value).trim();
  return str === "" ? null : str;
}

function parseAssetForm(formData: FormData) {
  return {
    organization_id: String(formData.get("organization_id")),
    site_id: emptyToNull(formData.get("site_id")),
    asset_tag: String(formData.get("asset_tag")),
    equipment_type: String(formData.get("equipment_type")),
    brand: emptyToNull(formData.get("brand")),
    model: emptyToNull(formData.get("model")),
    serial_number: emptyToNull(formData.get("serial_number")),
    sold_by: String(formData.get("sold_by")),
    install_date: emptyToNull(formData.get("install_date")),
    status: String(formData.get("status")),
    warranty_end_date: emptyToNull(formData.get("warranty_end_date")),
    custodian: emptyToNull(formData.get("custodian")),
    pnri_license_number: emptyToNull(formData.get("pnri_license_number")),
    next_service_due: emptyToNull(formData.get("next_service_due")),
  };
}

export async function createAsset(formData: FormData) {
  await requireStaff();

  const supabase = await createClient();
  const values = parseAssetForm(formData);

  const { error } = await supabase.from("assets").insert(values);

  if (error) {
    redirect(`/assets/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/assets");
  redirect("/assets");
}

export async function updateAsset(assetId: string, formData: FormData) {
  await requireStaff(`/assets/${assetId}`);

  const supabase = await createClient();
  const values = parseAssetForm(formData);

  const { error } = await supabase
    .from("assets")
    .update(values)
    .eq("id", assetId);

  if (error) {
    redirect(`/assets/${assetId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/assets");
  redirect("/assets");
}
