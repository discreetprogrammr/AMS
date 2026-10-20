"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { isHrAdminPreset } from "@/lib/hr-admin-preset";
import { assetDeleteBlocker } from "@/lib/hr-admin-guard";
import { custodianKey } from "@/lib/custodians";
import { getInternalOrgIds } from "@/lib/internal-org";
import { loadCustodianNames } from "./custodian-names";
import { resolveSiteCoordinates } from "@/lib/site-location";
import {
  ASSIGNMENT_STATUSES,
  CONDITIONS,
  INTERNAL_CATEGORIES,
  INTERNAL_DEPARTMENTS,
  OWNERSHIPS,
  SEGMENTS,
  UNITS,
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

// Postgres 23505 on schema_step47's partial unique index: another save took
// this PHT-EQ number between our duplicate check and the write. Any other
// error keeps its raw message.
function internalSaveError(error: { code?: string; message: string }, tag: string): string {
  if (error.code === "23505" && error.message.includes("assets_internal_asset_tag_key")) {
    return `Asset No. ${tag} was just taken by another save. Try saving again.`;
  }
  // schema_step52.sql adds the Unit column and the For Repair status. Until it
  // is run, saving fails; say what to do instead of showing the raw message.
  if (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /'unit' column|column "?unit"? .*does not exist/i.test(error.message) ||
    (error.code === "23514" && /assets_(assignment_status|unit)_check/.test(error.message))
  ) {
    return "The database needs an update before this can be saved. Run schema_step52.sql in the Supabase SQL editor, then try again.";
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
function parseInternalAssetForm(formData: FormData, existing?: { asset_category: string | null; department: string | null }) {
  const fail = (error: string) => ({ error } as const);

  // Category and Department are pick-lists (HR's own lists). A value an older
  // item already has is accepted unchanged, so editing it does not force a change.
  const category = emptyToNull(formData.get("asset_category"));
  if (category && !(INTERNAL_CATEGORIES as readonly string[]).includes(category) && category !== existing?.asset_category) {
    return fail("Equipment Category must be one of the choices in the list.");
  }
  const department = emptyToNull(formData.get("department"));
  if (department && !(INTERNAL_DEPARTMENTS as readonly string[]).includes(department) && department !== existing?.department) {
    return fail("Department must be one of the choices in the list.");
  }
  const unit = emptyToNull(formData.get("unit")) ?? "pc";
  if (!UNITS.some((u) => u.value === unit)) return fail("Unit must be one of the choices in the list.");

  // Custodian: a name from the combobox, or none. Whether the name is on the
  // list is checked by assertKnownCustodian once there is a database client.
  const custodian = emptyToNull(formData.get("custodian"));

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
      asset_category: category,
      unit,
      description: emptyToNull(formData.get("description")),
      brand: emptyToNull(formData.get("brand")),
      model: emptyToNull(formData.get("model")),
      serial_number: emptyToNull(formData.get("serial_number")),
      quantity,
      ownership: ownership.value,
      supplier: emptyToNull(formData.get("supplier")),
      date_acquired: emptyToNull(formData.get("date_acquired")),
      acquisition_cost: cost,
      custodian,
      department,
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

// The custodian must be someone on the internal list (or, when editing, the
// name the item already has). Returns an error message, or null when fine.
async function assertKnownCustodian(supabase: Supabase, custodian: string | null, current?: string | null) {
  if (!custodian) return null;
  const key = custodianKey(custodian);
  if (key === custodianKey(current)) return null;
  const names = await loadCustodianNames(supabase, await getInternalOrgIds(supabase), current);
  return names.some((n) => custodianKey(n) === key)
    ? null
    : "Custodian must be someone on the list. Use + Add new custodian to add them first.";
}

async function createInternalAsset(supabase: Supabase, formData: FormData) {
  const back = (error: string) =>
    redirect(`/assets/new?internal=1&error=${encodeURIComponent(error)}`);

  const parsed = parseInternalAssetForm(formData);
  if ("error" in parsed) return back(parsed.error);
  const unknownCustodian = await assertKnownCustodian(supabase, parsed.values.custodian);
  if (unknownCustodian) return back(unknownCustodian);

  const site_id = await resolveSiteId(supabase, parsed.values.organization_id, formData.get("site_address"));

  // The Asset No. is never typed: it is the next free PHT-EQ number, decided
  // here at save time. If another save takes the same number first, the unique
  // index (schema_step47.sql) refuses ours and we simply take the next one.
  let tag = await nextInternalAssetTag(supabase);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await supabase.from("assets").insert({ ...parsed.values, asset_tag: tag, site_id });
    if (!error) {
      revalidatePath("/assets");
      redirect(`/assets?org=${parsed.values.organization_id}`);
    }
    const taken = error.code === "23505" && error.message.includes("assets_internal_asset_tag_key");
    if (!taken || attempt === 3) return back(internalSaveError(error, tag));
    tag = await nextInternalAssetTag(supabase);
  }
}

async function updateInternalAsset(supabase: Supabase, assetId: string, formData: FormData) {
  const back = (error: string) => redirect(`/assets/${assetId}?error=${encodeURIComponent(error)}`);

  // What the item has now, so a category or department that is not on the
  // pick-list but is already its own can be saved unchanged.
  const { data: current } = await supabase
    .from("assets")
    .select("asset_tag, asset_category, department, custodian")
    .eq("id", assetId)
    .maybeSingle();
  if (!current) return back("That asset no longer exists.");

  const parsed = parseInternalAssetForm(formData, current);
  if ("error" in parsed) return back(parsed.error);
  const unknownCustodian = await assertKnownCustodian(supabase, parsed.values.custodian, current.custodian);
  if (unknownCustodian) return back(unknownCustodian);

  const site_id = await resolveSiteId(supabase, parsed.values.organization_id, formData.get("site_address"));
  const { error } = await supabase
    .from("assets")
    // The Asset No. is not part of the update: it is assigned once and never
    // changes. updated_at has no trigger on assets, so set it here: the
    // equipment dashboard's "recently changed" list reads it.
    .update({ ...parsed.values, site_id, updated_at: new Date().toISOString() })
    .eq("id", assetId);
  if (error) return back(internalSaveError(error, current.asset_tag));

  revalidatePath("/assets");
  redirect(`/assets?org=${parsed.values.organization_id}`);
}

export async function createAsset(formData: FormData) {
  const profile = await requireStaff();

  const supabase = await createClient();
  const internalOrg = await isInternalOrganization(supabase, String(formData.get("organization_id")));
  // HR & Admin preset: internal organization only, decided here and not by
  // the form. Other admins are unchanged (follow-up: they are not checked).
  if (isHrAdminPreset(profile.hidden_modules) && !internalOrg) {
    redirect(`/assets/new?internal=1&error=${encodeURIComponent("You can only add internal equipment.")}`);
  }
  if (internalOrg) {
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
  const profile = await requireStaff(`/assets/${assetId}`);

  const supabase = await createClient();
  const internalOrg = await isInternalOrganization(supabase, String(formData.get("organization_id")));
  // HR & Admin preset: both the asset being edited and the organization it
  // would end up in must be internal. Other admins are unchanged.
  if (isHrAdminPreset(profile.hidden_modules)) {
    const { data: existing } = await supabase
      .from("assets")
      .select("organization_id")
      .eq("id", assetId)
      .maybeSingle();
    const existingInternal = existing ? await isInternalOrganization(supabase, existing.organization_id) : false;
    if (!existingInternal || !internalOrg) {
      redirect(`/assets?error=${encodeURIComponent("You can only edit internal equipment.")}`);
    }
  }
  if (internalOrg) {
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
  const profile = await requireStaff();

  const supabase = await createClient();

  // HR & Admin preset only (other admins keep the cascading delete above;
  // follow-up): internal equipment only, and refuse rather than cascade.
  // The count check lives here, in the action, not in the confirm dialog.
  if (isHrAdminPreset(profile.hidden_modules)) {
    const refuse = (message: string) => redirect(`/assets?error=${encodeURIComponent(message)}`);
    const { data: target } = await supabase
      .from("assets")
      .select("asset_tag, organization_id")
      .eq("id", assetId)
      .maybeSingle();
    if (!target) return refuse("That asset no longer exists.");
    if (!(await isInternalOrganization(supabase, target.organization_id))) {
      return refuse("You can only delete internal equipment.");
    }
    const blocker = await assetDeleteBlocker(supabase, assetId, target.asset_tag);
    if (blocker) return refuse(blocker);
  }

  const { error } = await supabase.from("assets").delete().eq("id", assetId);

  if (error) {
    redirect(`/assets?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/assets");
  redirect("/assets?deleted=1");
}
