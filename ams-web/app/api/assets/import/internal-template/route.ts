import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { INTERNAL_EXPORT_HEADER } from "@/lib/internal-equipment";
import { forbidViewer } from "@/lib/viewer-guard";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Starter CSV for the internal importer (app/assets/internal-import): the
// internal export's own columns plus one example row, so an export and the
// template are interchangeable. Staff only. Not blocked for the HR & Admin
// preset, who need it.
const EXAMPLE_ROW: Record<(typeof INTERNAL_EXPORT_HEADER)[number], string> = {
  "Asset No.": "",
  "Equipment Category": "Laptop",
  "Equipment / Description": "Office laptop",
  Brand: "Lenovo",
  Model: "ThinkPad E14",
  "Serial No.": "SN-EXAMPLE-001",
  Qty: "1",
  Unit: "pc",
  Ownership: "Company-owned",
  "Date Acquired": "2026-01-15",
  "Acquisition Cost": "42000.00",
  Supplier: "Example Supplier",
  "Current Location": "Head Office",
  "Assigned To / Custodian": "",
  Department: "Admin",
  "Date Issued": "",
  Status: "In Stock",
  Condition: "New",
  "Warranty Expiry": "2029-01-15",
  "Return / Disposal Date": "",
  Remarks: "Delete this example row before uploading.",
  Segment: "Pacific Horizon Tek",
};

export async function GET() {
  // A read-only viewer account gets no downloads and no writes (lib/viewer-guard.ts).
  const viewerBlocked = await forbidViewer();
  if (viewerBlocked) return viewerBlocked;

  const profile = await getProfile();
  if (!isStaffRole(profile?.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const csv =
    "﻿" +
    [[...INTERNAL_EXPORT_HEADER], INTERNAL_EXPORT_HEADER.map((h) => EXAMPLE_ROW[h])]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="phtek-internal-equipment-import-template.csv"',
    },
  });
}
