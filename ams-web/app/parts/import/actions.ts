"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { parseCsvFile, trimmedOrNull, MAX_IMPORT_ROWS } from "@/lib/csv-import";

// Same two-phase parse/preview-then-commit shape as
// app/assets/import/actions.ts — see that file's comment for the reasoning.
// Simpler here: no foreign keys to resolve, just a SKU-based dedup check
// (same idea as assets' serial_number dedup — SKU is the closest thing
// parts has to a natural unique identifier, though it's not a DB-enforced
// unique constraint, schema_step31.sql).
export type ParsedPartRow = {
  row: number;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  unit_cost: number | null;
  notes: string | null;
};

export type PartImportIssue = { row: number; message: string };

export type PartImportPreview = {
  valid: ParsedPartRow[];
  skipped: PartImportIssue[];
  errors: PartImportIssue[];
};

function parseIntOrNull(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function parseDecimalOrNull(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function parsePartsImport(formData: FormData): Promise<PartImportPreview> {
  await requireStaff("/parts");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Please choose a CSV file.");
  }

  const { rows, parseErrors } = await parseCsvFile(file);
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`This file has ${rows.length} rows — please split it into batches of ${MAX_IMPORT_ROWS} or fewer.`);
  }

  const supabase = await createClient();
  const { data: existingParts } = await supabase.from("parts").select("sku").not("sku", "is", null);
  const existingSkus = new Set((existingParts ?? []).map((p) => (p.sku as string).trim().toLowerCase()));

  const valid: ParsedPartRow[] = [];
  const skipped: PartImportIssue[] = [];
  const errors: PartImportIssue[] = parseErrors.map((message) => ({ row: 0, message }));
  const seenSkusThisFile = new Set<string>();

  rows.forEach((raw, i) => {
    const row = i + 2;

    const name = trimmedOrNull(raw["Name"]);
    if (!name) {
      errors.push({ row, message: "Missing Name." });
      return;
    }

    const sku = trimmedOrNull(raw["SKU"]);
    if (sku) {
      const key = sku.toLowerCase();
      if (existingSkus.has(key)) {
        skipped.push({ row, message: `SKU "${sku}" already exists on another part — skipped.` });
        return;
      }
      if (seenSkusThisFile.has(key)) {
        skipped.push({ row, message: `SKU "${sku}" is duplicated earlier in this file — skipped.` });
        return;
      }
      seenSkusThisFile.add(key);
    }

    const quantityRaw = trimmedOrNull(raw["Quantity On Hand"]);
    const quantityOnHand = quantityRaw === null ? 0 : parseIntOrNull(quantityRaw);
    if (quantityOnHand === null) {
      errors.push({ row, message: `Quantity On Hand must be a whole number (got "${quantityRaw}").` });
      return;
    }

    const reorderRaw = trimmedOrNull(raw["Reorder Level"]);
    const reorderLevel = reorderRaw === null ? 0 : parseIntOrNull(reorderRaw);
    if (reorderLevel === null) {
      errors.push({ row, message: `Reorder Level must be a whole number (got "${reorderRaw}").` });
      return;
    }

    const unitCostRaw = trimmedOrNull(raw["Unit Cost"]);
    const unitCost = unitCostRaw === null ? null : parseDecimalOrNull(unitCostRaw);
    if (unitCostRaw !== null && unitCost === null) {
      errors.push({ row, message: `Unit Cost must be a number (got "${unitCostRaw}").` });
      return;
    }

    valid.push({
      row,
      name,
      sku,
      category: trimmedOrNull(raw["Category"]),
      unit: trimmedOrNull(raw["Unit"]) ?? "pcs",
      quantity_on_hand: quantityOnHand,
      reorder_level: reorderLevel,
      unit_cost: unitCost,
      notes: trimmedOrNull(raw["Notes"]),
    });
  });

  return { valid, skipped, errors };
}

export type PartImportResult = {
  imported: number;
  errors: PartImportIssue[];
};

export async function commitPartsImport(rows: ParsedPartRow[]): Promise<PartImportResult> {
  await requireStaff("/parts");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const errors: PartImportIssue[] = [];
  let imported = 0;

  for (const row of rows) {
    const { error } = await supabase.from("parts").insert({
      name: row.name,
      sku: row.sku,
      category: row.category,
      unit: row.unit,
      quantity_on_hand: row.quantity_on_hand,
      reorder_level: row.reorder_level,
      unit_cost: row.unit_cost,
      notes: row.notes,
      created_by: user?.id ?? null,
    });

    if (error) {
      errors.push({ row: row.row, message: error.message });
      continue;
    }
    imported++;
  }

  return { imported, errors };
}
