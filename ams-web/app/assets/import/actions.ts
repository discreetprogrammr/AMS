"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { parseCsvFile, trimmedOrNull, isValidIsoDate, MAX_IMPORT_ROWS } from "@/lib/csv-import";
import { resolveSiteId, nextAssetTag } from "../actions";

// Two-phase bulk import (parse/validate, then commit) rather than one shot
// straight to the database — an asset-registry import can easily be 50-200+
// rows onboarding a new client's whole fleet at once, and there's no bulk
// delete/undo in this app if a bad file goes in wrong. Phase 1 does every
// check that doesn't require a foreign key resolution or created row (org
// lookup, enum membership, date format, serial_number dedup) and returns
// what WOULD happen without writing anything, so the UI can show a preview.
// Phase 2 (commitAssetsImport) actually inserts, reusing the exact same
// resolveSiteId()/nextAssetTag() helpers the single-asset form
// (app/assets/actions.ts) uses, so a bulk-imported asset is indistinguishable
// from one added by hand — same auto-generated Asset ID scheme, same
// auto-geocoded site creation.
const EQUIPMENT_TYPES = ["xray_screening", "people_threat_screening", "water_generation", "pump", "other"];
const STATUSES = ["operational", "attention", "down", "unserviceable"];
const SOLD_BY = ["pacific_horizon_tek", "third_party"];

export type ParsedAssetRow = {
  row: number; // 1-indexed, matching what a spreadsheet user sees (header = row 1)
  organization_id: string;
  organization_name: string;
  site_address: string | null;
  equipment_type: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  status: string;
  sold_by: string;
  install_date: string | null;
  warranty_end_date: string | null;
  next_service_due: string | null;
  custodian: string | null;
  pnri_license_number: string | null;
};

export type AssetImportIssue = { row: number; message: string };

export type AssetImportPreview = {
  valid: ParsedAssetRow[];
  skipped: AssetImportIssue[]; // e.g. duplicate serial_number — not an error, just excluded
  errors: AssetImportIssue[];
};

export async function parseAssetsImport(formData: FormData): Promise<AssetImportPreview> {
  await requireStaff();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Please choose a CSV file.");
  }

  const { rows, parseErrors } = await parseCsvFile(file);
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`This file has ${rows.length} rows — please split it into batches of ${MAX_IMPORT_ROWS} or fewer.`);
  }

  const supabase = await createClient();

  const { data: orgs } = await supabase.from("organizations").select("id, name");
  const orgByName = new Map((orgs ?? []).map((o) => [o.name.trim().toLowerCase(), o]));

  const { data: existingAssets } = await supabase.from("assets").select("serial_number").not("serial_number", "is", null);
  const existingSerials = new Set(
    (existingAssets ?? []).map((a) => (a.serial_number as string).trim().toLowerCase()),
  );

  const valid: ParsedAssetRow[] = [];
  const skipped: AssetImportIssue[] = [];
  const errors: AssetImportIssue[] = parseErrors.map((message) => ({ row: 0, message }));
  const seenSerialsThisFile = new Set<string>();

  rows.forEach((raw, i) => {
    const row = i + 2; // header is row 1

    const orgNameRaw = trimmedOrNull(raw["Organization"]);
    if (!orgNameRaw) {
      errors.push({ row, message: "Missing Organization." });
      return;
    }
    const org = orgByName.get(orgNameRaw.toLowerCase());
    if (!org) {
      errors.push({ row, message: `No client organization named "${orgNameRaw}" — check spelling, or add the client first.` });
      return;
    }

    const equipmentType = trimmedOrNull(raw["Equipment Type"]);
    if (!equipmentType || !EQUIPMENT_TYPES.includes(equipmentType)) {
      errors.push({
        row,
        message: `Equipment Type must be one of: ${EQUIPMENT_TYPES.join(", ")} (got "${equipmentType ?? ""}").`,
      });
      return;
    }

    const status = trimmedOrNull(raw["Status"]) ?? "operational";
    if (!STATUSES.includes(status)) {
      errors.push({ row, message: `Status must be one of: ${STATUSES.join(", ")} (got "${status}").` });
      return;
    }

    const soldBy = trimmedOrNull(raw["Sold By"]) ?? "pacific_horizon_tek";
    if (!SOLD_BY.includes(soldBy)) {
      errors.push({ row, message: `Sold By must be one of: ${SOLD_BY.join(", ")} (got "${soldBy}").` });
      return;
    }

    for (const [label, key] of [
      ["Install Date", "Install Date"],
      ["Warranty End", "Warranty End"],
      ["Next Service Due", "Next Service Due"],
    ] as const) {
      const value = trimmedOrNull(raw[key]);
      if (value && !isValidIsoDate(value)) {
        errors.push({ row, message: `${label} must be in YYYY-MM-DD format (got "${value}").` });
        return;
      }
    }

    const serialNumber = trimmedOrNull(raw["Serial Number"]);
    if (serialNumber) {
      const key = serialNumber.toLowerCase();
      if (existingSerials.has(key)) {
        skipped.push({ row, message: `Serial number "${serialNumber}" already exists on another asset — skipped.` });
        return;
      }
      if (seenSerialsThisFile.has(key)) {
        skipped.push({ row, message: `Serial number "${serialNumber}" is duplicated earlier in this file — skipped.` });
        return;
      }
      seenSerialsThisFile.add(key);
    }

    valid.push({
      row,
      organization_id: org.id,
      organization_name: org.name,
      site_address: trimmedOrNull(raw["Site"]),
      equipment_type: equipmentType,
      brand: trimmedOrNull(raw["Brand"]),
      model: trimmedOrNull(raw["Model"]),
      serial_number: serialNumber,
      status,
      sold_by: soldBy,
      install_date: trimmedOrNull(raw["Install Date"]),
      warranty_end_date: trimmedOrNull(raw["Warranty End"]),
      next_service_due: trimmedOrNull(raw["Next Service Due"]),
      custodian: trimmedOrNull(raw["Custodian"]),
      pnri_license_number: trimmedOrNull(raw["PNRI License #"]),
    });
  });

  return { valid, skipped, errors };
}

export type AssetImportResult = {
  imported: number;
  errors: AssetImportIssue[];
};

export async function commitAssetsImport(rows: ParsedAssetRow[]): Promise<AssetImportResult> {
  await requireStaff();

  const supabase = await createClient();
  const errors: AssetImportIssue[] = [];
  let imported = 0;

  // Sequential, not Promise.all — nextAssetTag() looks at the highest
  // existing number for a prefix on every call, so two rows of the same
  // equipment_type inserted concurrently could race and land on the same
  // tag. One at a time is slower but correct, and this is a background
  // bulk operation, not a page load someone's staring at.
  for (const row of rows) {
    try {
      const asset_tag = await nextAssetTag(supabase, row.equipment_type);
      const site_id = row.site_address
        ? await resolveSiteId(supabase, row.organization_id, row.site_address)
        : null;

      const { error } = await supabase.from("assets").insert({
        organization_id: row.organization_id,
        site_id,
        asset_tag,
        equipment_type: row.equipment_type,
        brand: row.brand,
        model: row.model,
        serial_number: row.serial_number,
        sold_by: row.sold_by,
        install_date: row.install_date,
        status: row.status,
        warranty_end_date: row.warranty_end_date,
        custodian: row.custodian,
        pnri_license_number: row.pnri_license_number,
        next_service_due: row.next_service_due,
      });

      if (error) {
        errors.push({ row: row.row, message: error.message });
        continue;
      }
      imported++;
    } catch (err) {
      errors.push({ row: row.row, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { imported, errors };
}
