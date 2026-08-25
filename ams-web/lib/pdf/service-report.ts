// Builds the actual PM/CM service report PDF — the server-generated,
// permanently-stored counterpart to the live print view at
// app/reports/service-record/[id]/page.tsx (same data, same rough layout,
// intentionally not pixel-identical). Built entirely on the dependency-
// free writer.ts / png.ts — see the note there for why.
import type { ImageRef, PageBuilder } from "./writer";
import { PdfWriter } from "./writer";
import { wrapText } from "./text-metrics";
import { REPORT_KIND_TITLES, type ReportKind } from "@/lib/report-types";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = 14;

const INK: [number, number, number] = [0.09, 0.11, 0.15];
const SOFT: [number, number, number] = [0.42, 0.45, 0.5];
const BLUE: [number, number, number] = [0.11, 0.32, 0.62];
const HAIRLINE: [number, number, number] = [0.85, 0.86, 0.89];
const GREEN: [number, number, number] = [0.02, 0.45, 0.28];
const AMBER: [number, number, number] = [0.68, 0.48, 0.02];
const RED: [number, number, number] = [0.72, 0.11, 0.11];
const PANEL: [number, number, number] = [0.95, 0.96, 0.98];

export type ChecklistRow = {
  section: string;
  itemLabel: string;
  status: string;
  remarks: string | null;
};

export type PartRow = {
  partName: string;
  quantity: number;
  status: string;
};

export type RadiationReadingRow = {
  location: string;
  reading: string;
  unit: string;
  limit: string;
};

// Warning labels / X-Ray ON indicator / safety interlocks — the real
// Astrophysics form's "Warning Label Verification", "X-Ray ON Indicator",
// and "Safety Devices and Interlocks" sections are all the same shape
// (an item, and whether it was found present/working), so one row type
// covers all three instead of three separate tables.
export type SafetyCheckRow = {
  item: string;
  accepted: boolean;
  notes: string;
};

// Per-report-kind labels for the two meta-grid slots that mean something
// different depending on what's being reported — everyone else (title,
// findings heading) is looked up straight from lib/report-types.ts.
const NEXT_FIELD_LABEL: Record<ReportKind, string> = {
  pm: "Next Due",
  cm: "Downtime", // special-cased below — uses downtimeHours, not nextDueDate
  installation: "First PM Due",
  radiation_survey: "Next Survey Due",
  site_survey: "Target Install Date",
  training: "Next Refresher Due",
};

const FINDINGS_TITLE: Record<ReportKind, string> = {
  pm: "Findings & Comments",
  cm: "Fault, Action Taken & Comments",
  installation: "Installation Notes & Comments",
  radiation_survey: "Observations & Recommendations",
  site_survey: "Site Assessment Findings & Recommendations",
  training: "Topics Covered & Notes",
};

export type ServiceReportInput = {
  id: string;
  reportKind: ReportKind;
  reportRef: string;
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
  technicianSignature: string | null; // data:image/png;base64,...
  customerSignature: string | null;
  timeArrived: string | null;
  serviceBegin: string | null;
  serviceCompleted: string | null;
  visitStatus: string | null;
  diagnosticStart: string | null;
  diagnosticDone: string | null;
  repairStart: string | null;
  repairEnd: string | null;
  // Asset-scoped reports populate `asset`; site-only reports (Site Survey/
  // Training filed with no specific unit selected) populate `site` instead
  // — schema_step41.sql made asset_id nullable for exactly this case.
  asset: {
    assetTag: string | null;
    equipmentType: string | null;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    siteAddress: string | null;
    organizationName: string | null;
  } | null;
  site: {
    address: string | null;
    organizationName: string | null;
  } | null;
  checklistItems: ChecklistRow[];
  parts: PartRow[];
  radiationReadings: RadiationReadingRow[];
  surveyMeterModel: string | null;
  surveyMeterManufacturer: string | null;
  surveyMeterSerial: string | null;
  surveyMeterCalibrationDate: string | null;
  reportReferenceNo: string | null;
  backgroundRadiationReading: string | null;
  safetyChecklist: SafetyCheckRow[];
  trainingAttendees: string | null;
};

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl.trim());
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

class ReportLayout {
  writer = new PdfWriter();
  page: PageBuilder;
  y: number;

  constructor() {
    this.page = this.writer.addPage(PAGE_W, PAGE_H);
    this.y = PAGE_H - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN) {
      this.page = this.writer.addPage(PAGE_W, PAGE_H);
      this.y = PAGE_H - MARGIN;
    }
  }

  space(h: number) {
    this.y -= h;
  }

  text(
    x: number,
    text: string,
    opts: { font?: "F1" | "F2"; size?: number; color?: [number, number, number] } = {},
  ) {
    this.ensure(LINE_H);
    this.page.text(x, this.y, text, {
      font: opts.font ?? "F1",
      size: opts.size ?? 10,
      color: opts.color ?? INK,
    });
  }

  divider(color: [number, number, number] = HAIRLINE, weight = 1) {
    this.ensure(6);
    this.page.line(MARGIN, this.y, PAGE_W - MARGIN, this.y, { color, lineWidth: weight });
    this.y -= 10;
  }

  sectionTitle(title: string) {
    this.ensure(28);
    this.y -= 8;
    this.page.text(MARGIN, this.y, title, { font: "F2", size: 11, color: INK });
    this.y -= 6;
    this.page.line(MARGIN, this.y, PAGE_W - MARGIN, this.y, { color: HAIRLINE, lineWidth: 1 });
    this.y -= 16;
  }

  // label/value pairs, `perRow` columns wide
  metaGrid(pairs: { label: string; value: string }[], perRow = 3) {
    const colW = CONTENT_W / perRow;
    const rowH = 30;
    for (let i = 0; i < pairs.length; i += perRow) {
      this.ensure(rowH);
      const row = pairs.slice(i, i + perRow);
      row.forEach((pair, col) => {
        const x = MARGIN + col * colW;
        this.page.text(x, this.y, pair.label.toUpperCase(), {
          font: "F2",
          size: 8,
          color: SOFT,
        });
        this.page.text(x, this.y - 13, pair.value || "—", {
          font: "F1",
          size: 10,
          color: INK,
        });
      });
      this.y -= rowH;
    }
  }

  paragraph(body: string, size = 10) {
    const lines = wrapText(body, size, CONTENT_W);
    for (const ln of lines) {
      this.ensure(LINE_H);
      if (ln) this.page.text(MARGIN, this.y, ln, { font: "F1", size, color: INK });
      this.y -= LINE_H;
    }
  }

  checklistTable(rows: ChecklistRow[]) {
    const colSection = MARGIN;
    const colItem = MARGIN + 130;
    const colStatus = MARGIN + 330;
    const colRemarks = MARGIN + 410;

    const headerRow = () => {
      this.ensure(22);
      this.page.rect(MARGIN, this.y - 6, CONTENT_W, 20, { fill: PANEL });
      this.page.text(colSection, this.y, "SECTION", { font: "F2", size: 8, color: SOFT });
      this.page.text(colItem, this.y, "ITEM", { font: "F2", size: 8, color: SOFT });
      this.page.text(colStatus, this.y, "STATUS", { font: "F2", size: 8, color: SOFT });
      this.page.text(colRemarks, this.y, "REMARKS", { font: "F2", size: 8, color: SOFT });
      this.y -= 20;
    };

    headerRow();
    for (const row of rows) {
      const beforeY = this.y;
      this.ensure(20);
      if (this.y !== beforeY) {
        // ensure() started a fresh page for this row — repeat the header
        // there so a table split across pages stays readable.
        headerRow();
      }
      const color = row.status === "fail" ? RED : row.status === "attention" ? AMBER : GREEN;
      this.page.text(colSection, this.y, row.section, { font: "F1", size: 9, color: SOFT });
      this.page.text(colItem, this.y, row.itemLabel, { font: "F1", size: 9, color: INK });
      this.page.text(colStatus, this.y, row.status.toUpperCase(), { font: "F2", size: 9, color });
      this.page.text(colRemarks, this.y, (row.remarks || "—").slice(0, 46), {
        font: "F1",
        size: 9,
        color: SOFT,
      });
      this.page.line(MARGIN, this.y - 6, PAGE_W - MARGIN, this.y - 6, {
        color: HAIRLINE,
        lineWidth: 0.5,
      });
      this.y -= 20;
    }
  }

  partsTable(rows: PartRow[]) {
    const colName = MARGIN;
    const colQty = MARGIN + 320;
    const colStatus = MARGIN + 400;

    this.ensure(20);
    this.page.rect(MARGIN, this.y - 6, CONTENT_W, 20, { fill: PANEL });
    this.page.text(colName, this.y, "PART", { font: "F2", size: 8, color: SOFT });
    this.page.text(colQty, this.y, "QTY", { font: "F2", size: 8, color: SOFT });
    this.page.text(colStatus, this.y, "STATUS", { font: "F2", size: 8, color: SOFT });
    this.y -= 20;

    for (const row of rows) {
      this.ensure(20);
      this.page.text(colName, this.y, row.partName, { font: "F1", size: 9, color: INK });
      this.page.text(colQty, this.y, String(row.quantity), { font: "F1", size: 9, color: INK });
      this.page.text(colStatus, this.y, row.status, { font: "F1", size: 9, color: SOFT });
      this.page.line(MARGIN, this.y - 6, PAGE_W - MARGIN, this.y - 6, {
        color: HAIRLINE,
        lineWidth: 0.5,
      });
      this.y -= 20;
    }
  }

  radiationReadingsTable(rows: RadiationReadingRow[]) {
    const colLoc = MARGIN;
    const colReading = MARGIN + 230;
    const colUnit = MARGIN + 320;
    const colLimit = MARGIN + 400;

    const headerRow = () => {
      this.ensure(22);
      this.page.rect(MARGIN, this.y - 6, CONTENT_W, 20, { fill: PANEL });
      this.page.text(colLoc, this.y, "MEASUREMENT POINT", { font: "F2", size: 8, color: SOFT });
      this.page.text(colReading, this.y, "READING", { font: "F2", size: 8, color: SOFT });
      this.page.text(colUnit, this.y, "UNIT", { font: "F2", size: 8, color: SOFT });
      this.page.text(colLimit, this.y, "PNRI LIMIT", { font: "F2", size: 8, color: SOFT });
      this.y -= 20;
    };

    headerRow();
    for (const row of rows) {
      const beforeY = this.y;
      this.ensure(20);
      if (this.y !== beforeY) headerRow();
      this.page.text(colLoc, this.y, row.location || "—", { font: "F1", size: 9, color: INK });
      this.page.text(colReading, this.y, row.reading || "—", { font: "F1", size: 9, color: INK });
      this.page.text(colUnit, this.y, row.unit || "—", { font: "F1", size: 9, color: SOFT });
      this.page.text(colLimit, this.y, row.limit || "—", { font: "F1", size: 9, color: SOFT });
      this.page.line(MARGIN, this.y - 6, PAGE_W - MARGIN, this.y - 6, {
        color: HAIRLINE,
        lineWidth: 0.5,
      });
      this.y -= 20;
    }
  }

  safetyChecklistTable(rows: SafetyCheckRow[]) {
    const colItem = MARGIN;
    const colAccepted = MARGIN + 320;
    const colNotes = MARGIN + 400;

    const headerRow = () => {
      this.ensure(22);
      this.page.rect(MARGIN, this.y - 6, CONTENT_W, 20, { fill: PANEL });
      this.page.text(colItem, this.y, "ITEM", { font: "F2", size: 8, color: SOFT });
      this.page.text(colAccepted, this.y, "ACCEPTED", { font: "F2", size: 8, color: SOFT });
      this.page.text(colNotes, this.y, "NOTES", { font: "F2", size: 8, color: SOFT });
      this.y -= 20;
    };

    headerRow();
    for (const row of rows) {
      const beforeY = this.y;
      this.ensure(20);
      if (this.y !== beforeY) headerRow();
      this.page.text(colItem, this.y, row.item, { font: "F1", size: 9, color: INK });
      this.page.text(colAccepted, this.y, row.accepted ? "YES" : "NO", {
        font: "F2",
        size: 9,
        color: row.accepted ? GREEN : RED,
      });
      this.page.text(colNotes, this.y, (row.notes || "—").slice(0, 30), {
        font: "F1",
        size: 9,
        color: SOFT,
      });
      this.page.line(MARGIN, this.y - 6, PAGE_W - MARGIN, this.y - 6, {
        color: HAIRLINE,
        lineWidth: 0.5,
      });
      this.y -= 20;
    }
  }

  image(ref: ImageRef, x: number, y: number, w: number, h: number) {
    this.page.image(ref, x, y, w, h);
  }
}

export function buildServiceReportPdf(input: ServiceReportInput, logoBytes: Buffer): Buffer {
  const layout = new ReportLayout();
  const asset = input.asset;
  const kind = input.reportKind;

  // Letterhead
  const logoRef = layout.writer.embedPng(logoBytes);
  const logoW = 150;
  const logoH = logoW * (logoRef.heightPx / logoRef.widthPx);
  layout.image(logoRef, MARGIN, layout.y - logoH + 4, logoW, logoH);

  const titleX = PAGE_W - MARGIN - 240;
  layout.page.text(titleX, layout.y - 4, REPORT_KIND_TITLES[kind].toUpperCase(), {
    font: "F2",
    size: 9,
    color: BLUE,
  });
  layout.page.text(titleX, layout.y - 22, input.reportRef, { font: "F2", size: 16, color: INK });
  layout.page.text(
    titleX,
    layout.y - 38,
    input.datePerformed
      ? new Date(input.datePerformed).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "—",
    { font: "F1", size: 9, color: SOFT },
  );

  layout.y -= Math.max(logoH + 8, 55);
  layout.divider(INK, 1.4);

  // Meta grid — asset-scoped reports (PM/CM/Installation/Radiation Survey)
  // pull Customer/Site/Asset from `asset`; site-only reports (Site Survey/
  // Training filed with no unit selected) fall back to `site`.
  const siteAddress = asset?.siteAddress ?? input.site?.address ?? "";
  const organizationName = asset?.organizationName ?? input.site?.organizationName ?? "";
  const nextFieldSlot =
    kind === "cm"
      ? { label: "Downtime", value: input.downtimeHours != null ? `${input.downtimeHours}h` : "" }
      : {
          label: NEXT_FIELD_LABEL[kind],
          value: input.nextDueDate ? new Date(input.nextDueDate).toLocaleDateString() : "",
        };
  const outcomeValue =
    input.result === "fail" ? "Needs Follow-up / Failed" : input.result === "pass" ? "Pass / Resolved" : "—";

  const metaPairs = [
    { label: "Customer", value: organizationName },
    { label: "Site", value: siteAddress },
    { label: "Asset", value: asset?.assetTag ?? (asset ? "" : "— (site-level report)") },
    {
      label: "Equipment",
      value: asset ? [asset.brand, asset.model].filter(Boolean).join(" ") || asset.equipmentType || "" : "",
    },
    { label: "Serial No.", value: asset?.serialNumber ?? "" },
    { label: "Performed By", value: input.performedBy ?? "" },
    nextFieldSlot,
    { label: "Outcome", value: outcomeValue },
  ];
  layout.metaGrid(metaPairs, 3);
  layout.space(6);

  // Site Survey's own checklist (schema_step42.sql widened this table's
  // use beyond just PM) reuses the exact same section title/rendering as
  // PM's — same tap-cycle OK/Attention/Fail shape, just a different set of
  // items.
  if ((kind === "pm" || kind === "site_survey") && input.checklistItems.length > 0) {
    layout.sectionTitle(kind === "pm" ? "Checklist" : "Site Assessment Checklist");
    layout.checklistTable(input.checklistItems);
  }

  if (kind === "cm" && input.parts.length > 0) {
    layout.sectionTitle("Parts Replaced");
    layout.partsTable(input.parts);
  }

  if (kind === "radiation_survey") {
    if (input.backgroundRadiationReading) {
      layout.sectionTitle("Background Radiation");
      layout.metaGrid([{ label: "Background Reading", value: input.backgroundRadiationReading }], 4);
    }
    if (input.radiationReadings.length > 0) {
      layout.sectionTitle("Radiation Survey Readings");
      layout.radiationReadingsTable(input.radiationReadings);
    }
    if (
      input.surveyMeterModel ||
      input.surveyMeterManufacturer ||
      input.surveyMeterSerial ||
      input.surveyMeterCalibrationDate ||
      input.reportReferenceNo
    ) {
      layout.sectionTitle("Survey Meter Used");
      layout.metaGrid(
        [
          { label: "Manufacturer", value: input.surveyMeterManufacturer ?? "" },
          { label: "Meter Model", value: input.surveyMeterModel ?? "" },
          { label: "Meter Serial No.", value: input.surveyMeterSerial ?? "" },
          {
            label: "Meter Cal. Date",
            value: input.surveyMeterCalibrationDate
              ? new Date(input.surveyMeterCalibrationDate).toLocaleDateString()
              : "",
          },
          { label: "Report Reference #", value: input.reportReferenceNo ?? "" },
        ],
        3,
      );
    }
    if (input.safetyChecklist.length > 0) {
      layout.sectionTitle("Safety Devices & Warning Labels");
      layout.safetyChecklistTable(input.safetyChecklist);
    }
  }

  if (kind === "training" && input.trainingAttendees) {
    layout.sectionTitle("Attendees");
    layout.paragraph(input.trainingAttendees);
  }

  if (input.findings) {
    layout.sectionTitle(FINDINGS_TITLE[kind]);
    layout.paragraph(input.findings);
  }

  if (input.timeArrived || input.serviceBegin || input.serviceCompleted || input.visitStatus) {
    layout.sectionTitle("Service Timing");
    layout.metaGrid(
      [
        { label: "Time Arrived", value: input.timeArrived ?? "" },
        { label: kind === "pm" ? "Begin PM" : "Service Begin", value: input.serviceBegin ?? "" },
        { label: kind === "pm" ? "PM Completed" : "Service Completed", value: input.serviceCompleted ?? "" },
        { label: "Status", value: input.visitStatus ?? "" },
      ],
      4,
    );
  }

  if (input.diagnosticStart || input.diagnosticDone || input.repairStart || input.repairEnd) {
    layout.sectionTitle("If Failures Occurred");
    layout.metaGrid(
      [
        { label: "Start Diagnostic", value: input.diagnosticStart ?? "" },
        { label: "Diagnostic Done", value: input.diagnosticDone ?? "" },
        { label: "Repair Starts", value: input.repairStart ?? "" },
        { label: "Repair Ends", value: input.repairEnd ?? "" },
      ],
      4,
    );
  }

  const csatPairs = [
    { label: "Service", value: input.csatService },
    { label: "Machine / Unit", value: input.csatMachine },
    { label: "Support", value: input.csatSupport },
    { label: "Overall", value: input.csatOverall },
  ].filter((c) => c.value != null);
  if (csatPairs.length > 0) {
    layout.sectionTitle("Customer Satisfaction Rating");
    layout.metaGrid(
      csatPairs.map((c) => ({ label: c.label, value: `${c.value} / 5` })),
      4,
    );
  }

  // Sign-off
  layout.sectionTitle("Sign-off");
  const boxW = CONTENT_W / 2 - 10;
  const boxH = 70;
  // Keep the two signature boxes + their caption line together — if they
  // don't fit under the section title on this page, start fresh rather
  // than splitting a signature box across a page break.
  if (layout.y - (boxH + 26) < MARGIN) {
    layout.page = layout.writer.addPage(PAGE_W, PAGE_H);
    layout.y = PAGE_H - MARGIN;
  }
  const signY = layout.y - boxH;

  layout.page.rect(MARGIN, signY, boxW, boxH, { stroke: HAIRLINE, lineWidth: 1 });
  layout.page.rect(MARGIN + boxW + 20, signY, boxW, boxH, { stroke: HAIRLINE, lineWidth: 1 });

  const techBuf = input.technicianSignature ? dataUrlToBuffer(input.technicianSignature) : null;
  if (techBuf) {
    const ref = layout.writer.embedPng(techBuf);
    const w = Math.min(boxW - 10, ((boxH - 10) * ref.widthPx) / ref.heightPx);
    const h = (w * ref.heightPx) / ref.widthPx;
    layout.image(ref, MARGIN + 5, signY + (boxH - h) / 2, w, h);
  }
  const custBuf = input.customerSignature ? dataUrlToBuffer(input.customerSignature) : null;
  if (custBuf) {
    const ref = layout.writer.embedPng(custBuf);
    const w = Math.min(boxW - 10, ((boxH - 10) * ref.widthPx) / ref.heightPx);
    const h = (w * ref.heightPx) / ref.widthPx;
    layout.image(ref, MARGIN + boxW + 25, signY + (boxH - h) / 2, w, h);
  }

  layout.y = signY - 14;
  layout.page.text(MARGIN, layout.y, `Technician Signature — ${input.performedBy || ""}`, {
    font: "F1",
    size: 8,
    color: SOFT,
  });
  layout.page.text(
    MARGIN + boxW + 20,
    layout.y,
    `Customer Signature — ${input.customerSignatory || ""}`,
    { font: "F1", size: 8, color: SOFT },
  );
  layout.y -= 30;

  // Footer
  layout.ensure(20);
  layout.page.line(MARGIN, layout.y, PAGE_W - MARGIN, layout.y, { color: HAIRLINE, lineWidth: 0.5 });
  layout.y -= 12;
  layout.page.text(
    MARGIN,
    layout.y,
    `Pacific Horizon Tek Inc. — Confidential service record. Generated ${new Date().toLocaleString()}.`,
    { font: "F1", size: 7.5, color: SOFT },
  );

  return layout.writer.save();
}
