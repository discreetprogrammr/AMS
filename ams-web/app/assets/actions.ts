"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { resolveSiteCoordinates } from "@/lib/site-location";
import {
  ASSIGNMENT_STATUSES,
  CONDITIONS,
  INTERNAL_TAG_PATTERN,
  OWNERSHIPS,
  SEGMENTS,
  deriveInternalStatus,
  isOneOf,
  nextInternalTagFrom,
} from "@/lib/internal-equipment";

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
export async function nextAssetTag(
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
export async function resolveSiteId(
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

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function isInternalOrganization(supabase: Supabase, organizationId: string) {
  const { data } = await supabase
    .from("organizations")
    .select("is_internal")
    .eq("id", organizationId)
    .maybeSingle();
  return data?.is_internal === true;
}

// Next PHT-EQ number from the highest one in use (not a row count), so a
// deleted asset's number is never reissued. Computed at save time.
export async function nextInternalAssetTag(supabase: Supabase): Promise<string> {
  const { data } = await supabase.from("assets").select("asset_tag").ilike("asset_tag", "PHT-EQ-%");
  return nextInternalTagFrom((data ?? []).map((r: { asset_tag: string | null }) => r.asset_tag));
}

async function assetTagTaken(supabase: Supabase, tag: string, exceptAssetId?: string) {
  let q = supabase.from("assets").select("id").ilike("asset_tag", tag);
  if (exceptAssetId) q = q.neq("id", exceptAssetId);
  const { data } = await q.limit(1);
  return (data ?? []).length > 0;
}

// Postgres 23505 on schema_step47's partial unique index: another save took
// this PHT-EQ number between our duplicate check and the write. Any other
// error keeps its raw message.
function internalSaveError(error: { code?: string; message: string }, tag: string): string {
  if (error.code === "23505" && error.message.includes("assets_internal_asset_tag_key")) {
    return `Asset No. ${tag} was just taken by another save. Clear the field for the next free number, or pick another.`;
  }
  return error.message;
}

function optionalEnum(
  formData: FormData,
  field: string,
  label: string,
  options: readonly { value: string; label: string }[],
): { value: string | null; error?: string } {
  const value = emptyToNull(formData.get(field));
  if (value !== null && !isOneOf(options, value)) return { value: null, error: `${label} is not a valid choice.` };
  return { value };
}

// Internal (PHtek staff) equipment, spec 4.2 / 4.3 / 7.3. The server, not
// the form, decides what an internal row looks like: equipment_type is
// forced to 'other', the NII-only fields are nulled, and status is derived
// from condition / assignment_status. sold_by and install_date are left
// out so inserts take the column default and updates leave them alone.
function parseInternalAssetForm(formData: FormData) {
  const fail = (error: string) => ({ error } as const);

  const segment = emptyToNull(formData.get("segment"));
  if (!isOneOf(SEGMENTS, segment)) return fail("Segment is required for internal equipment.");

  const ownership = optionalEnum(formData, "ownership", "Ownership", OWNERSHIPS);
  const assignment = optionalEnum(formData, "assignment_status", "Assignment Status", ASSIGNMENT_STATUSES);
  const condition = optionalEnum(formData, "condition", "Condition", CONDITIONS);
  const bad = ownership.error ?? assignment.error ?? condition.error;
  if (bad) return fail(bad);

  const quantityRaw = emptyToNull(formData.get("quantity"));
  const quantity = quantityRaw === null ? 1 : Number(quantityRaw);
  if (!Number.isInteger(quantity) || quantity < 1) return fail("Qty must be a whole number of at least 1.");

  const costRaw = emptyToNull(formData.get("acquisition_cost"));
  const cost = costRaw === null ? null : Number(costRaw);
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return fail("Acquisition Cost must be a number, 0 or more.");

  return {
    values: {
      organization_id: String(formData.get("organization_id")),
      equipment_type: "other",
      segment,
      asset_category: emptyToNull(formData.get("asset_category")),
      description: emptyToNull(formData.get("description")),
      brand: emptyToNull(formData.get("brand")),
      model: emptyToNull(formData.get("model")),
      serial_number: emptyToNull(formData.get("serial_number")),
      quantity,
      ownership: ownership.value,
      supplier: emptyToNull(formData.get("supplier")),
      date_acquired: emptyToNull(formData.get("date_acquired")),
      acquisition_cost: cost,
      custodian: emptyToNull(formData.get("custodian")),
      department: emptyToNull(formData.get("department")),
      date_issued: emptyToNull(formData.get("date_issued")),
      assignment_status: assignment.value,
      condition: condition.value,
      warranty_end_date: emptyToNull(formData.get("warranty_end_date")),
      return_disposal_date: emptyToNull(formData.get("return_disposal_date")),
      remarks: emptyToNull(formData.get("remarks")),
      pnri_license_number: null,
      next_service_due: null,
      status: deriveInternalStatus(condition.value, assignment.value),
    },
  };
}

async function createInternalAsset(supabase: Supabase, formData: FormData) {
  const back = (error: string) =>
    redirect(`/assets/new?internal=1&error=${encodeURIComponent(error)}`);

  const parsed = parseInternalAssetForm(formData);
  if ("error" in parsed) return back(parsed.error);

  // The tag is decided here, at save time. A blank field gets the next
  // number. The form's prefill (suggested_tag) can be stale if someone
  // else saved first; an untouched stale prefill is re-numbered, a tag
  // the user typed that is already in use is rejected.
  let tag = (emptyToNull(formData.get("asset_tag")) ?? "").toUpperCase();
  const suggested = emptyToNull(formData.get("suggested_tag"));
  if (!tag) {
    tag = await nextInternalAssetTag(supabase);
  } else if (!INTERNAL_TAG_PATTERN.test(tag)) {
    return back(`Asset No. must look like PHT-EQ-0001 (got "${tag}").`);
  } else if (await assetTagTaken(supabase, tag)) {
    if (tag === suggested) tag = await nextInternalAssetTag(supabase);
    else return back(`Asset No. ${tag} is already in use. Pick another, or clear the field for the next free number.`);
  }

  const site_id = await resolveSiteId(supabase, parsed.values.organization_id, formData.get("site_address"));
  const { error } = await supabase.from("assets").insert({ ...parsed.values, asset_tag: tag, site_id });
  if (error) return back(internalSaveError(error, tag));

  revalidatePath("/assets");
  redirect(`/assets?org=${parsed.values.organization_id}`);
}

async function updateInternalAsset(supabase: Supabase, assetId: string, formData: FormData) {
  const back = (error: string) => redirect(`/assets/${assetId}?error=${encodeURIComponent(error)}`);

  const parsed = parseInternalAssetForm(formData);
  if ("error" in parsed) return back(parsed.error);

  const tag = (emptyToNull(formData.get("asset_tag")) ?? "").toUpperCase();
  if (!INTERNAL_TAG_PATTERN.test(tag)) return back(`Asset No. must look like PHT-EQ-0001 (got "${tag}").`);
  if (await assetTagTaken(supabase, tag, assetId)) return back(`Asset No. ${tag} is already in use.`);

  const site_id = await resolveSiteId(supabase, parsed.values.organization_id, formData.get("site_address"));
  const { error } = await supabase
    .from("assets")
    .update({ ...parsed.values, asset_tag: tag, site_id })
    .eq("id", assetId);
  if (error) return back(internalSaveError(error, tag));

  revalidatePath("/assets");
  redirect(`/assets?org=${parsed.values.organization_id}`);
}

export async function createAsset(formData: FormData) {
  await requireStaff();

  const supabase = await createClient();
  if (await isInternalOrganization(supabase, String(formData.get("organization_id")))) {
    return createInternalAsset(supabase, formData);
  }
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
  if (await isInternalOrganization(supabase, String(formData.get("organization_id")))) {
    return updateInternalAsset(supabase, assetId, formData);
  }
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
