"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { getInternalOrgIds } from "@/lib/internal-org";
import { parseCsvFile, trimmedOrNull, isValidIsoDate, MAX_IMPORT_ROWS } from "@/lib/csv-import";
import {
  ASSIGNMENT_STATUSES,
  CONDITIONS,
  INTERNAL_TAG_PATTERN,
  OWNERSHIPS,
  SEGMENTS,
  deriveInternalStatus,
  matchOption,
  nextInternalTagFrom,
} from "@/lib/internal-equipment";
import { resolveSiteId } from "../actions";

// Bulk import for internal (PHtek) equipment: the columns are the ones the
// internal export writes (INTERNAL_EXPORT_HEADER), so a sheet exported from
// the register, or the template, can be filled in and uploaded. Rows are
// always added to the internal organization; the organization is never read
// from the file. Same two steps as the client importer (preview, then
// import), but the import step re-reads and re-validates the uploaded file
// itself instead of trusting rows sent back by the browser.
//
// The server decides what an internal row looks like, as the form does
// (app/assets/actions.ts): equipment_type 'other', NII-only fields null,
// status derived from condition and assignment status.

export type InternalImportRow = {
  row: number; // spreadsheet row, header = 1
  asset_tag: string | null; // null = next PHT-EQ number at import time
  asset_category: string | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  quantity: number;
  ownership: string | null;
  date_acquired: string | null;
  acquisition_cost: number | null;
  supplier: string | null;
  site_address: string | null;
  custodian: string | null;
  department: string | null;
  date_issued: string | null;
  assignment_status: string | null;
  condition: string | null;
  warranty_end_date: string | null;
  return_disposal_date: string | null;
  remarks: string | null;
  segment: string;
};

export type InternalImportIssue = { row: number; message: string };

export type InternalImportPreview = {
  valid: InternalImportRow[];
  skipped: InternalImportIssue[];
  errors: InternalImportIssue[];
};

export type InternalImportResult = { imported: number; errors: InternalImportIssue[] };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function readAndValidate(supabase: Supabase, formData: FormData): Promise<InternalImportPreview> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Please choose a CSV file.");

  const { rows, parseErrors } = await parseCsvFile(file);
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`This file has ${rows.length} rows. Please split it into batches of ${MAX_IMPORT_ROWS} or fewer.`);
  }

  const orgIds = await getInternalOrgIds(supabase);
  if (orgIds.length === 0) throw new Error("No internal organization is set up.");

  // Existing tags and serials, internal equipment only.
  const { data: existing, error } = await supabase
    .from("assets")
    .select("asset_tag, serial_number")
    .in("organization_id", orgIds);
  if (error) throw new Error(error.message);
  const existingTags = new Set((existing ?? []).map((a) => String(a.asset_tag ?? "").toUpperCase()));
  const existingSerials = new Set(
    (existing ?? []).filter((a) => a.serial_number).map((a) => String(a.serial_number).trim().toLowerCase()),
  );

  const valid: InternalImportRow[] = [];
  const skipped: InternalImportIssue[] = [];
  const errors: InternalImportIssue[] = parseErrors.map((message) => ({ row: 0, message }));
  const seenTags = new Set<string>();
  const seenSerials = new Set<string>();

  rows.forEach((raw, i) => {
    const row = i + 2;
    const fail = (message: string) => errors.push({ row, message });

    const segmentRaw = trimmedOrNull(raw["Segment"]);
    const segment = matchOption(SEGMENTS, segmentRaw);
    if (!segment) {
      return fail(`Segment must be one of: ${SEGMENTS.map((s) => s.label).join(", ")} (got "${segmentRaw ?? ""}").`);
    }

    const description = trimmedOrNull(raw["Equipment / Description"]);
    const brand = trimmedOrNull(raw["Brand"]);
    const model = trimmedOrNull(raw["Model"]);
    if (!description && !brand && !model) return fail("Needs an Equipment / Description, or a Brand or Model.");

    let tag = trimmedOrNull(raw["Asset No."])?.toUpperCase() ?? null;
    if (tag) {
      if (!INTERNAL_TAG_PATTERN.test(tag)) return fail(`Asset No. must look like PHT-EQ-0001 (got "${tag}"), or be left blank.`);
      if (existingTags.has(tag)) return fail(`Asset No. ${tag} is already in use.`);
      if (seenTags.has(tag)) return fail(`Asset No. ${tag} appears twice in this file.`);
      seenTags.add(tag);
    } else {
      tag = null;
    }

    const optional = (label: string, options: readonly { value: string; label: string }[]) => {
      const text = trimmedOrNull(raw[label]);
      if (!text) return { value: null as string | null };
      const value = matchOption(options, text);
      return value ? { value } : { value: null, error: `${label} "${text}" is not one of: ${options.map((o) => o.label).join(", ")}.` };
    };
    const ownership = optional("Ownership", OWNERSHIPS);
    const assignment = optional("Status", ASSIGNMENT_STATUSES);
    const condition = optional("Condition", CONDITIONS);
    const enumError = ownership.error ?? assignment.error ?? condition.error;
    if (enumError) return fail(enumError);

    for (const label of ["Date Acquired", "Date Issued", "Warranty Expiry", "Return / Disposal Date"]) {
      const value = trimmedOrNull(raw[label]);
      if (value && !isValidIsoDate(value)) return fail(`${label} must be in YYYY-MM-DD format (got "${value}").`);
    }

    const qtyRaw = trimmedOrNull(raw["Qty"]);
    const quantity = qtyRaw === null ? 1 : Number(qtyRaw);
    if (!Number.isInteger(quantity) || quantity < 1) return fail(`Qty must be a whole number of at least 1 (got "${qtyRaw}").`);

    const costRaw = trimmedOrNull(raw["Acquisition Cost"])?.replace(/[₱,\s]/g, "") ?? null;
    const cost = costRaw === null ? null : Number(costRaw);
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return fail(`Acquisition Cost must be a number, 0 or more (got "${raw["Acquisition Cost"]}").`);

    const serial = trimmedOrNull(raw["Serial No."]);
    if (serial) {
      const key = serial.toLowerCase();
      if (existingSerials.has(key)) {
        skipped.push({ row, message: `Serial No. "${serial}" already exists on another internal item. Skipped.` });
        if (tag) seenTags.delete(tag);
        return;
      }
      if (seenSerials.has(key)) {
        skipped.push({ row, message: `Serial No. "${serial}" is duplicated earlier in this file. Skipped.` });
        if (tag) seenTags.delete(tag);
        return;
      }
      seenSerials.add(key);
    }

    valid.push({
      row,
      asset_tag: tag,
      asset_category: trimmedOrNull(raw["Equipment Category"]),
      description,
      brand,
      model,
      serial_number: serial,
      quantity,
      ownership: ownership.value,
      date_acquired: trimmedOrNull(raw["Date Acquired"]),
      acquisition_cost: cost,
      supplier: trimmedOrNull(raw["Supplier"]),
      site_address: trimmedOrNull(raw["Current Location"]),
      custodian: trimmedOrNull(raw["Assigned To / Custodian"]),
      department: trimmedOrNull(raw["Department"]),
      date_issued: trimmedOrNull(raw["Date Issued"]),
      assignment_status: assignment.value,
      condition: condition.value,
      warranty_end_date: trimmedOrNull(raw["Warranty Expiry"]),
      return_disposal_date: trimmedOrNull(raw["Return / Disposal Date"]),
      remarks: trimmedOrNull(raw["Remarks"]),
      segment,
    });
  });

  return { valid, skipped, errors };
}

export async function parseInternalImport(formData: FormData): Promise<InternalImportPreview> {
  await requireStaff();
  return readAndValidate(await createClient(), formData);
}

export async function commitInternalImport(formData: FormData): Promise<InternalImportResult> {
  await requireStaff();
  const supabase = await createClient();
  const { valid } = await readAndValidate(supabase, formData);

  const orgIds = await getInternalOrgIds(supabase);
  const orgId = orgIds[0];

  // Tags already taken (this file's own explicit tags included), so a blank
  // Asset No. never collides with one the file names further down.
  const { data: tagRows } = await supabase.from("assets").select("asset_tag").ilike("asset_tag", "PHT-EQ-%");
  const used: (string | null)[] = (tagRows ?? []).map((r: { asset_tag: string | null }) => r.asset_tag);
  for (const r of valid) if (r.asset_tag) used.push(r.asset_tag);

  const siteIds = new Map<string, string | null>();
  const errors: InternalImportIssue[] = [];
  let imported = 0;

  // One at a time: tag numbers depend on what came before, and a unique
  // index (schema_step47.sql) makes Postgres refuse any collision.
  for (const r of valid) {
    try {
      const tag = r.asset_tag ?? nextInternalTagFrom(used);
      if (!r.asset_tag) used.push(tag);

      let site_id: string | null = null;
      if (r.site_address) {
        const key = r.site_address.toLowerCase();
        if (!siteIds.has(key)) siteIds.set(key, await resolveSiteId(supabase, orgId, r.site_address));
        site_id = siteIds.get(key) ?? null;
      }

      const { error } = await supabase.from("assets").insert({
        organization_id: orgId,
        site_id,
        asset_tag: tag,
        equipment_type: "other",
        segment: r.segment,
        asset_category: r.asset_category,
        description: r.description,
        brand: r.brand,
        model: r.model,
        serial_number: r.serial_number,
        quantity: r.quantity,
        ownership: r.ownership,
        supplier: r.supplier,
        date_acquired: r.date_acquired,
        acquisition_cost: r.acquisition_cost,
        custodian: r.custodian,
        department: r.department,
        date_issued: r.date_issued,
        assignment_status: r.assignment_status,
        condition: r.condition,
        warranty_end_date: r.warranty_end_date,
        return_disposal_date: r.return_disposal_date,
        remarks: r.remarks,
        pnri_license_number: null,
        next_service_due: null,
        status: deriveInternalStatus(r.condition, r.assignment_status),
      });
      if (error) {
        errors.push({ row: r.row, message: error.message });
        continue;
      }
      imported++;
    } catch (err) {
      errors.push({ row: r.row, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { imported, errors };
}
