"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { resolveSiteCoordinates } from "@/lib/site-location";

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const str = String(value).trim();
  return str === "" ? null : str;
}

// Same equipment_type values as the <select> in asset-form.tsx.
const EQUIPMENT_PREFIX: Record<string, string> = {
  xray_screening: "XRY",
  people_threat_screening: "PTS",
  water_generation: "WTR",
  pump: "PMP",
  other: "OTH",
};

// Auto-generates the next Asset ID for a given equipment type, e.g.
// XRY-0001, then XRY-0002. Looks at the highest existing number already
// used for that prefix — not just a row count — so deleting an asset never
// causes its number to be reissued to a different asset later.
async function nextAssetTag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  equipmentType: string,
): Promise<string> {
  const prefix = EQUIPMENT_PREFIX[equipmentType] ?? "AST";

  const { data: existing } = await supabase
    .from("assets")
    .select("asset_tag")
    .ilike("asset_tag", `${prefix}-%`);

  let maxNumber = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (existing ?? []) as any[]) {
    const match = /^[A-Z]+-(\d+)$/.exec(row.asset_tag ?? "");
    if (match) {
      const n = Number(match[1]);
      if (n > maxNumber) maxNumber = n;
    }
  }

  return `${prefix}-${String(maxNumber + 1).padStart(4, "0")}`;
}

// The Site field on the form is now free text (an address), not a <select>
// bound to an existing sites.id — but site_id is still a real foreign key
// that Fleet Map (lat/lng plotting) and Clients (registered assets per
// site) depend on. So rather than dropping the relation, this resolves the
// typed address to an existing site for that organization (case-insensitive
// match) or creates one on the fly, and returns its id. Blank input means
// "no specific site."
async function resolveSiteId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  siteAddressRaw: FormDataEntryValue | null,
): Promise<string | null> {
  const siteAddress = emptyToNull(siteAddressRaw);
  if (!siteAddress || !organizationId) return null;

  const { data: existing } = await supabase
    .from("sites")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("address", siteAddress)
    .maybeSingle();

  if (existing) return existing.id;

  // Brand-new site — give it a location automatically instead of leaving
  // it uncharted until someone visits the Clients page and fills in
  // lat/lng by hand. See lib/site-location.ts: known PH facilities (named
  // airports/seaports/freeports) resolve instantly with no network call;
  // anything else falls back to live geocoding, and only stays null if
  // both come up empty.
  const { latitude, longitude } = await resolveSiteCoordinates(siteAddress);

  const { data: created, error } = await supabase
    .from("sites")
    .insert({
      organization_id: organizationId,
      address: siteAddress,
      latitude,
      longitude,
    })
    .select("id")
    .single();

  if (error || !created) return null;
  return created.id;
}

function parseAssetForm(formData: FormData) {
  return {
    organization_id: String(formData.get("organization_id")),
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

  // The "New Asset" form doesn't submit asset_tag at all anymore (see
  // asset-form.tsx) — it's generated here, server-side, once
  // equipment_type is known, overriding whatever parseAssetForm read
  // (which would just be the string "null" with no field present).
  values.asset_tag = await nextAssetTag(supabase, values.equipment_type);
  const site_id = await resolveSiteId(
    supabase,
    values.organization_id,
    formData.get("site_address"),
  );

  const { error } = await supabase
    .from("assets")
    .insert({ ...values, site_id });

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
  const site_id = await resolveSiteId(
    supabase,
    values.organization_id,
    formData.get("site_address"),
  );

  const { error } = await supabase
    .from("assets")
    .update({ ...values, site_id })
    .eq("id", assetId);

  if (error) {
    redirect(`/assets/${assetId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/assets");
  redirect("/assets");
}

// Staff-only, called from the row actions menu on /assets after a confirm
// dialog. Every table that references an asset (service_records,
// service_tickets, compliance_certificates, work_orders, alerts,
// calendar_events, inspections, inventory_cycle_items) declared
// `on delete cascade` back in schema.sql/schema_step5/9/10/11/12, so this
// is a real cascading delete at the database level — the confirm dialog
// on the client side says as much rather than hiding it.
export async function deleteAsset(assetId: string) {
  await requireStaff();

  const supabase = await createClient();
  const { error } = await supabase.from("assets").delete().eq("id", assetId);

  if (error) {
    redirect(`/assets?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/assets");
  redirect("/assets?deleted=1");
}
