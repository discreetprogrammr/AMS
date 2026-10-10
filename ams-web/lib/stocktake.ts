// Vocabulary for the equipment stocktake (schema_step49.sql). Mirrors the
// CHECK constraints on equipment_stocktake_items.result; null = not counted.
export const STOCKTAKE_RESULTS = [
  { value: "found", label: "Found" },
  { value: "missing", label: "Missing" },
  { value: "different_holder", label: "Different holder" },
] as const;

export const NOT_COUNTED_LABEL = "Not counted";

export function stocktakeResultLabel(result: string | null | undefined): string {
  if (!result) return NOT_COUNTED_LABEL;
  return STOCKTAKE_RESULTS.find((r) => r.value === result)?.label ?? result;
}

export type StocktakeItem = {
  id: string;
  asset_id: string | null;
  asset_tag: string;
  description: string | null;
  expected_custodian: string | null;
  expected_department: string | null;
  result: string | null;
  actual_custodian: string | null;
  condition_note: string | null;
  checked_at: string | null;
};

export type StocktakeCounts = {
  total: number;
  found: number;
  missing: number;
  differentHolder: number;
  notCounted: number;
};

export function countStocktake(items: { result: string | null }[]): StocktakeCounts {
  const c = { total: items.length, found: 0, missing: 0, differentHolder: 0, notCounted: 0 };
  for (const i of items) {
    if (i.result === "found") c.found++;
    else if (i.result === "missing") c.missing++;
    else if (i.result === "different_holder") c.differentHolder++;
    else c.notCounted++;
  }
  return c;
}

/** Tables-missing errors (step 49 not run yet) get a friendly message. */
export function isMissingTableError(error: { code?: string; message: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message);
}
