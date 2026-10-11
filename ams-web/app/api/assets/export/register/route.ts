import { createClient } from "@/lib/supabase/server";
import { getProfile, isStaffRole } from "@/lib/supabase/profile";
import { manilaDate, SEGMENTS, labelFor } from "@/lib/internal-equipment";
import { cost, loadEquipmentReport, statusText } from "@/lib/equipment-report";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// The equipment register report as a spreadsheet: the same rows, filters and
// grouping as the Reports tab (one row per item, with its group in the first
// column), including acquisition costs. Staff only; internal equipment only.
// Not blocked for the HR & Admin preset, who need it.
export async function GET(request: Request) {
  const profile = await getProfile();
  if (!isStaffRole(profile?.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const supabase = await createClient();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const report = await loadEquipmentReport(supabase, params);
  if (report.error) return new Response(`Failed to export: ${report.error}`, { status: 500 });

  const header = [
    "Group",
    "Asset No.",
    "Equipment / Description",
    "Brand",
    "Model",
    "Serial No.",
    "Equipment Category",
    "Qty",
    "Unit",
    "Assigned To / Custodian",
    "Department",
    "Segment",
    "Status / Condition",
    "Date Acquired",
    "Acquisition Cost",
    "Warranty Expiry",
  ];
  const rows = report.groups.flatMap((g) =>
    g.rows.map((r) => [
      g.label,
      r.asset_tag,
      r.description ?? "",
      r.brand ?? "",
      r.model ?? "",
      r.serial_number ?? "",
      r.asset_category ?? "",
      r.quantity ?? "",
      r.unit ?? "",
      r.custodian ?? "",
      r.department ?? "",
      r.segment ? labelFor(SEGMENTS, r.segment) : "",
      statusText(r) === "—" ? "" : statusText(r),
      r.date_acquired ?? "",
      r.acquisition_cost === null ? "" : cost(r.acquisition_cost),
      r.warranty_end_date ?? "",
    ]),
  );

  // BOM so Excel reads UTF-8 (names, peso signs) correctly.
  const csv = "﻿" + [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="phtek-equipment-report-${manilaDate()}.csv"`,
    },
  });
}
