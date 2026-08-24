import Papa from "papaparse";

// Shared parsing helper for bulk CSV import (Assets and Inventory/Parts —
// app/assets/import/, app/parts/import/). Hand-rolling a CSV parser is a
// bad idea for something users will feed real Excel/Google Sheets exports
// into (quoted fields containing commas or embedded newlines are genuinely
// tricky to get right), so this is the one new dependency added for this
// feature — papaparse, a small, dependency-free, widely-used parser.
//
// CSV *generation* (the downloadable templates, app/api/**/import/template)
// deliberately does NOT use papaparse — that side is simple enough that the
// existing hand-rolled csvEscape() pattern already used by
// app/api/assets/export/route.ts is kept as-is rather than introducing a
// second way of doing the same simple thing.
export const MAX_IMPORT_ROWS = 500;

export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  parseErrors: string[];
};

export async function parseCsvFile(file: File): Promise<CsvParseResult> {
  const text = await file.text();

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    // Typed as a plain structural shape (not Papa.ParseError) so this stays
    // correctly typed regardless of whether papaparse's own types happen to
    // be resolvable — matches ParseError's real shape either way.
    parseErrors: result.errors.map(
      (e: { row?: number; message: string }) => `Row ${(e.row ?? 0) + 2}: ${e.message}`, // +2: header row + 1-indexed
    ),
  };
}

// Small shared helpers every per-entity validator uses.
export function trimmedOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
