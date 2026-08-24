// Downloadable starter CSV for bulk parts import (app/parts/import/). Same
// hand-rolled CSV building as app/api/assets/import/template/route.ts —
// see that file's comment for why this isn't papaparse too.
function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const HEADER = ["Name", "SKU", "Category", "Unit", "Quantity On Hand", "Reorder Level", "Unit Cost", "Notes"];

const EXAMPLE_ROW = ["X-ray Detector Board", "RSP-DET-620", "Electronics", "pcs", "5", "2", "8500.00", ""];

export async function GET() {
  const csv = [HEADER, EXAMPLE_ROW]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="parts-import-template.csv"',
    },
  });
}
