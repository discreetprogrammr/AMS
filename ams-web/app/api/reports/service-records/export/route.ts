import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Same PM/CM split used on the Reports page: "preventive" covers every
// scheduled service type (preventive_maintenance, calibration,
// radiation_survey, water_quality_test), "corrective" is just repair.
const PM_TYPES = [
  "preventive_maintenance",
  "calibration",
  "radiation_survey",
  "water_quality_test",
];

export async function GET(request: NextRequest) {
  const type =
    request.nextUrl.searchParams.get("type") === "corrective"
      ? "corrective"
      : "preventive";

  const supabase = await createClient();

  const { data: records, error } = await supabase
    .from("service_records")
    .select(
      "service_type, date_performed, performed_by, findings, result, downtime_hours, next_due_date, assets(asset_tag, organizations(name))",
    )
    .order("date_performed", { ascending: false });

  if (error) {
    return new Response(`Failed to export: ${error.message}`, {
      status: 500,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = (records ?? []).filter((r: any) =>
    type === "corrective"
      ? r.service_type === "repair"
      : PM_TYPES.includes(r.service_type),
  );

  const header = [
    "Asset",
    "Organization",
    "Service Type",
    "Date Performed",
    "Performed By",
    "Result",
    "Downtime (hrs)",
    "Next Due",
    "Findings",
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = filtered.map((r: any) => [
    r.assets?.asset_tag ?? "",
    r.assets?.organizations?.name ?? "",
    r.service_type,
    r.date_performed ?? "",
    r.performed_by ?? "",
    r.result ?? "",
    r.downtime_hours ?? "",
    r.next_due_date ?? "",
    r.findings ?? "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const filename = `${type}-maintenance-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
