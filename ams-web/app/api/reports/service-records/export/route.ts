import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reportKindOf, REPORT_KIND_ORDER, type ReportKind } from "@/lib/report-types";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function isReportKind(value: string | null): value is ReportKind {
  return !!value && (REPORT_KIND_ORDER as string[]).includes(value);
}

export async function GET(request: NextRequest) {
  // One shared source of truth for the six report kinds (lib/report-types.ts)
  // — this used to re-declare its own PM_TYPES array independently from
  // app/reports/page.tsx, which is exactly the kind of duplication that
  // silently dropped new types from export until someone remembered to
  // update both places.
  const typeParam = request.nextUrl.searchParams.get("type");
  const kind: ReportKind | null = isReportKind(typeParam) ? typeParam : null;

  const supabase = await createClient();

  const { data: records, error } = await supabase
    .from("service_records")
    .select(
      "service_type, date_performed, performed_by, findings, result, downtime_hours, next_due_date, assets(asset_tag, organizations(name)), sites(address, organizations(name))",
    )
    .order("date_performed", { ascending: false });

  if (error) {
    return new Response(`Failed to export: ${error.message}`, {
      status: 500,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = (records ?? []).filter((r: any) => (kind ? reportKindOf(r.service_type) === kind : true));

  const header = [
    "Asset",
    "Site",
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
    r.sites?.address ?? "",
    r.assets?.organizations?.name ?? r.sites?.organizations?.name ?? "",
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

  const filename = `${kind ?? "all"}-reports-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
