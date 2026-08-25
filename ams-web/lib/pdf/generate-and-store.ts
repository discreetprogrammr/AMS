// Builds a service report PDF (service-report.ts) and uploads it to the
// 'service-reports' Storage bucket (schema_step20.sql), then points
// service_records.report_url at it. Called right after a PM/CM report is
// saved (see app/reports/actions.ts) — non-fatal if it fails: the report
// row itself is already saved either way, so a PDF problem shouldn't
// block the user from seeing their submission succeed. The caller decides
// how to surface a failure (both actions here append a soft warning to
// their success redirect rather than erroring outright).
import { buildServiceReportPdf, type ServiceReportInput, type RadiationReadingRow } from "./service-report";
import { reportRef } from "@/lib/format";
import { REPORT_KIND_REF_PREFIX, type ReportKind } from "@/lib/report-types";
import { LOGO_BASE64 } from "./logo-base64";

// Embedded as base64 (logo-base64.ts) rather than read from
// public/pacific-horizon-tek-logo.png via fs.readFileSync at runtime —
// that worked in local dev but threw `ENOENT: no such file or directory,
// open '/var/task/ams-web/public/pacific-horizon-tek-logo.png'` on Vercel.
// Vercel's serverless functions don't include /public in the function's
// own filesystem bundle (Next.js serves /public straight from its CDN
// instead), so any code path that tries to fs.readFileSync a /public
// asset at request time — as opposed to importing it as a normal
// module/asset — breaks in production even though it works perfectly
// during `next dev`. Decoding a bundled base64 string sidesteps the
// filesystem entirely, so it works the same everywhere.
let cachedLogo: Buffer | null = null;
function loadLogo(): Buffer {
  if (!cachedLogo) {
    cachedLogo = Buffer.from(LOGO_BASE64, "base64");
  }
  return cachedLogo;
}

export type GeneratePdfParams = {
  recordId: string;
  // Nullable — Site Survey/Training reports can be filed with no specific
  // asset selected (schema_step41.sql), in which case siteId is required
  // instead so the meta grid still has a Customer/Site to show.
  assetId: string | null;
  siteId: string | null;
  reportKind: ReportKind;
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
  radiationReadings: RadiationReadingRow[];
  surveyMeterModel: string | null;
  surveyMeterSerial: string | null;
  surveyMeterCalibrationDate: string | null;
  reportReferenceNo: string | null;
  trainingAttendees: string | null;
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
    let asset: {
      asset_tag: string | null;
      equipment_type: string | null;
      brand: string | null;
      model: string | null;
      serial_number: string | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sites: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      organizations: any;
    } | null = null;
    if (params.assetId) {
      const { data } = await supabase
        .from("assets")
        .select(
          "asset_tag, equipment_type, brand, model, serial_number, sites(address), organizations(name)",
        )
        .eq("id", params.assetId)
        .single();
      asset = data;
    }

    // Only needed for a site-only report (no asset selected) — an
    // asset-scoped report already gets site/org via the join above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let site: any = null;
    if (!params.assetId && params.siteId) {
      const { data } = await supabase
        .from("sites")
        .select("address, organizations(name)")
        .eq("id", params.siteId)
        .single();
      site = data;
    }

    const input: ServiceReportInput = {
      id: params.recordId,
      reportKind: params.reportKind,
      reportRef: reportRef(params.recordId, REPORT_KIND_REF_PREFIX[params.reportKind]),
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
      asset: asset
        ? {
            assetTag: asset.asset_tag ?? null,
            equipmentType: asset.equipment_type ?? null,
            brand: asset.brand ?? null,
            model: asset.model ?? null,
            serialNumber: asset.serial_number ?? null,
            siteAddress: asset.sites?.address ?? null,
            organizationName: asset.organizations?.name ?? null,
          }
        : null,
      site: site
        ? {
            address: site.address ?? null,
            organizationName: site.organizations?.name ?? null,
          }
        : null,
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
      radiationReadings: params.radiationReadings,
      surveyMeterModel: params.surveyMeterModel,
      surveyMeterSerial: params.surveyMeterSerial,
      surveyMeterCalibrationDate: params.surveyMeterCalibrationDate,
      reportReferenceNo: params.reportReferenceNo,
      trainingAttendees: params.trainingAttendees,
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
