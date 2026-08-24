// Downloadable starter CSV for bulk asset import (app/assets/import/). Same
// hand-rolled CSV building as app/api/assets/export/route.ts, deliberately
// not papaparse — this direction (object -> CSV text) is simple enough not
// to need it. Column names match that export route's header exactly (minus
// "Asset ID", which is server-generated and never accepted on import) so a
// staff member can also just take an existing Export CSV and re-upload it
// unmodified — the import parser reads columns by name and ignores an
// "Asset ID" column if present.
function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const HEADER = [
  "Organization",
  "Site",
  "Equipment Type",
  "Brand",
  "Model",
  "Serial Number",
  "Status",
  "Sold By",
  "Install Date",
  "Warranty End",
  "Next Service Due",
  "Custodian",
  "PNRI License #",
];

const EXAMPLE_ROW = [
  "Bureau of Customs",
  "Ninoy Aquino International Airport",
  "xray_screening",
  "Rapiscan",
  "620DV",
  "SN-12345",
  "operational",
  "pacific_horizon_tek",
  "2025-01-15",
  "2027-01-15",
  "",
  "",
  "",
];

export async function GET() {
  const csv = [HEADER, EXAMPLE_ROW]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="assets-import-template.csv"',
    },
  });
}
