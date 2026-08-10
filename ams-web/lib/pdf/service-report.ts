// Builds the actual PM/CM service report PDF — the server-generated,
// permanently-stored counterpart to the live print view at
// app/reports/service-record/[id]/page.tsx (same data, same rough layout,
// intentionally not pixel-identical). Built entirely on the dependency-
// free writer.ts / png.ts — see the note there for why.
import type { ImageRef, PageBuilder } from "./writer";
import { PdfWriter } from "./writer";
import { wrapText } from "./text-metrics";

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

export type ServiceReportInput = {
  id: string;
  isPM: boolean;
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
  asset: {
    assetTag: string | null;
    equipmentType: string | null;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    siteAddress: string | null;
    organizationName: string | null;
  };
  checklistItems: ChecklistRow[];
  parts: PartRow[];
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

  image(ref: ImageRef, x: number, y: number, w: number, h: number) {
    this.page.image(ref, x, y, w, h);
  }
}

export function buildServiceReportPdf(input: ServiceReportInput, logoBytes: Buffer): Buffer {
  const layout = new ReportLayout();
  const asset = input.asset;

  // Letterhead
  const logoRef = layout.writer.embedPng(logoBytes);
  const logoW = 150;
  const logoH = logoW * (logoRef.heightPx / logoRef.widthPx);
  layout.image(logoRef, MARGIN, layout.y - logoH + 4, logoW, logoH);

  const titleX = PAGE_W - MARGIN - 240;
  layout.page.text(titleX, layout.y - 4, (input.isPM ? "PREVENTIVE MAINTENANCE REPORT" : "CORRECTIVE MAINTENANCE REPORT"), {
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

  // Meta grid
  const metaPairs = [
    { label: "Customer", value: asset.organizationName ?? "" },
    { label: "Site", value: asset.siteAddress ?? "" },
    { label: "Asset", value: asset.assetTag ?? "" },
    {
      label: "Equipment",
      value: [asset.brand, asset.model].filter(Boolean).join(" ") || asset.equipmentType || "",
    },
    { label: "Serial No.", value: asset.serialNumber ?? "" },
    { label: "Performed By", value: input.performedBy ?? "" },
    input.isPM
      ? {
          label: "Next Due",
          value: input.nextDueDate ? new Date(input.nextDueDate).toLocaleDateString() : "",
        }
      : { label: "Downtime", value: input.downtimeHours != null ? `${input.downtimeHours}h` : "" },
    {
      label: "Outcome",
      value: input.result === "fail" ? "Needs Follow-up / Failed" : "Pass / Resolved",
    },
  ];
  layout.metaGrid(metaPairs, 3);
  layout.space(6);

  if (input.isPM && input.checklistItems.length > 0) {
    layout.sectionTitle("Checklist");
    layout.checklistTable(input.checklistItems);
  }

  if (!input.isPM && input.parts.length > 0) {
    layout.sectionTitle("Parts Replaced");
    layout.partsTable(input.parts);
  }

  if (input.findings) {
    layout.sectionTitle(input.isPM ? "Findings & Comments" : "Fault, Action Taken & Comments");
    layout.paragraph(input.findings);
  }

  if (input.timeArrived || input.serviceBegin || input.serviceCompleted || input.visitStatus) {
    layout.sectionTitle("Service Timing");
    layout.metaGrid(
      [
        { label: "Time Arrived", value: input.timeArrived ?? "" },
        { label: input.isPM ? "Begin PM" : "Service Begin", value: input.serviceBegin ?? "" },
        { label: input.isPM ? "PM Completed" : "Service Completed", value: input.serviceCompleted ?? "" },
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
