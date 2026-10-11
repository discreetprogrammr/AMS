import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/supabase/profile";
import { PrintButton } from "@/components/print-button";
import { loadEquipmentReport } from "@/lib/equipment-report";
import { ReportTable } from "../report-table";

// Printable version of the equipment register report: always white, landscape,
// small type, with the grouping and totals. "Print" then "Save as PDF" in the
// browser makes the PDF. Standalone like the other printable documents.
export default async function PrintReportPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireStaff();
  const supabase = await createClient();
  const report = await loadEquipmentReport(supabase, searchParams);

  const qs = new URLSearchParams();
  for (const k of ["segment", "department", "category", "custodian", "status", "group"]) {
    const v = searchParams[k];
    if (typeof v === "string" && v) qs.set(k, v);
  }
  const back = `/equipment-reports${qs.toString() ? `?${qs.toString()}` : ""}`;
  const today = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" }).format(new Date());

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      <div className="print:hidden flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
        <Link href={back} className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
          ← Back to Reports
        </Link>
        <PrintButton label="Print / Save as PDF" />
      </div>

      <div className="px-6 py-6 print:px-0 print:py-0">
        <div className="mb-4 flex items-center justify-between gap-6 border-b-2 border-slate-900 pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pacific-horizon-tek-logo.png" alt="Pacific Horizon Tek Inc." className="h-10 w-auto" />
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700">Equipment Register</p>
            <h1 className="text-lg font-bold">Equipment Report</h1>
            <p className="text-[10px] text-slate-500">{today}</p>
          </div>
        </div>
        <p className="mb-3 text-[11px] text-slate-600">{report.description}</p>
        {report.error && <p className="mb-3 text-sm text-red-700">{report.error}</p>}
        <ReportTable report={report} print />
      </div>
    </div>
  );
}
