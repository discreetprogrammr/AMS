// Builds a service report PDF (service-report.ts) and uploads it to the
// 'service-reports' Storage bucket (schema_step20.sql), then points
// service_records.report_url at it. Called right after a PM/CM report is
// saved (see app/reports/actions.ts) — non-fatal if it fails: the report
// row itself is already saved either way, so a PDF problem shouldn't
// block the user from seeing their submission succeed. The caller decides
// how to surface a failure (both actions here append a soft warning to
// their success redirect rather than erroring outright).
import { readFileSync } from "fs";
import path from "path";
import { buildServiceReportPdf, type ServiceReportInput } from "./service-report";
import { reportRef } from "@/lib/format";

let cachedLogo: Buffer | null = null;
function loadLogo(): Buffer {
  if (!cachedLogo) {
    cachedLogo = readFileSync(path.join(process.cwd(), "public", "pacific-horizon-tek-logo.png"));
  }
  return cachedLogo;
}

export type GeneratePdfParams = {
  recordId: string;
  assetId: string;
  isPM: boolean;
  datePerformed: string | null;
  performedBy: string | null;
  findings: string | null;
  result: string | null;
  nextDueDate: string | null;
  downtimeHours: number | null;
  csatService: number | null;
  csatMachine: number | null;
  csatSupport: number | null;
  csatOverall: number | null;
  customerSignatory: string | null;
  technicianSignature: string | null;
  customerSignature: string | null;
  timeArrived: string | null;
  serviceBegin: string | null;
  serviceCompleted: string | null;
  visitStatus: string | null;
  diagnosticStart: string | null;
  diagnosticDone: string | null;
  repairStart: string | null;
  repairEnd: string | null;
  checklistItems: { section: string; item_label: string; status: string; remarks: string | null }[];
  parts: { part_name: string; quantity: number; status: string }[];
};

export async function generateAndStoreReportPdf(
  // Kept loose rather than importing the full Supabase client type — this
  // codebase doesn't use generated DB types anywhere else either (see the
  // `any`-cast joins throughout app/**), so matching that rather than
  // introducing the one strictly-typed call site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: GeneratePdfParams,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { data: asset } = await supabase
      .from("assets")
      .select(
        "asset_tag, equipment_type, brand, model, serial_number, sites(address), organizations(name)",
      )
      .eq("id", params.assetId)
      .single();

    const input: ServiceReportInput = {
      id: params.recordId,
      isPM: params.isPM,
      reportRef: reportRef(params.recordId, params.isPM ? "PM" : "CM"),
      datePerformed: params.datePerformed,
      performedBy: params.performedBy,
      findings: params.findings,
      result: params.result,
      nextDueDate: params.nextDueDate,
      downtimeHours: params.downtimeHours,
      csatService: params.csatService,
      csatMachine: params.csatMachine,
      csatSupport: params.csatSupport,
      csatOverall: params.csatOverall,
      customerSignatory: params.customerSignatory,
      technicianSignature: params.technicianSignature,
      customerSignature: params.customerSignature,
      timeArrived: params.timeArrived,
      serviceBegin: params.serviceBegin,
      serviceCompleted: params.serviceCompleted,
      visitStatus: params.visitStatus,
      diagnosticStart: params.diagnosticStart,
      diagnosticDone: params.diagnosticDone,
      repairStart: params.repairStart,
      repairEnd: params.repairEnd,
      asset: {
        assetTag: asset?.asset_tag ?? null,
        equipmentType: asset?.equipment_type ?? null,
        brand: asset?.brand ?? null,
        model: asset?.model ?? null,
        serialNumber: asset?.serial_number ?? null,
        siteAddress: asset?.sites?.address ?? null,
        organizationName: asset?.organizations?.name ?? null,
      },
      checklistItems: params.checklistItems.map((i) => ({
        section: i.section,
        itemLabel: i.item_label,
        status: i.status,
        remarks: i.remarks,
      })),
      parts: params.parts.map((p) => ({
        partName: p.part_name,
        quantity: p.quantity,
        status: p.status,
      })),
    };

    const pdfBuffer = buildServiceReportPdf(input, loadLogo());
    const storagePath = `${params.recordId}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("service-reports")
      .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      return { ok: false, message: uploadError.message };
    }

    const { error: updateError } = await supabase
      .from("service_records")
      .update({ report_url: storagePath })
      .eq("id", params.recordId);

    if (updateError) {
      return { ok: false, message: updateError.message };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "PDF generation failed.",
    };
  }
}
