// Minimal hand-written PDF writer — no external dependency. See the note
// in png.ts for why: no PDF-generation library can be installed in this
// sandbox. This implements just enough of the PDF 1.4 spec to lay out a
// clean, multi-page, letterheaded report: text in the 2 standard fonts
// (Helvetica / Helvetica-Bold, built into every PDF viewer — no font
// embedding needed), filled/stroked rectangles and lines for tables and
// dividers, and embedded PNG images (including alpha, via an SMask) for
// the logo and captured signatures.
//
// Deliberately not a general-purpose PDF library — only the operations
// service-report.ts actually needs.
import { deflateSync } from "zlib";
import { decodePng } from "./png";

type RGB = [number, number, number]; // 0–1 range, PDF's native color scale

type ContentOp = string;

export type ImageRef = {
  name: string; // e.g. "/Im3", referenced from content stream `Do` ops
  widthPx: number;
  heightPx: number;
};

class PdfObject {
  constructor(
    public id: number,
    public body: Buffer,
  ) {}
}

// Content streams are written out as Latin-1 bytes (see save()), which
// only covers code points 0–255 — anything above that (curly quotes, em
// dashes, ellipses from pasted text, etc.) would otherwise silently
// truncate into a garbage control character. Map the common Windows-1252
// "smart punctuation" block to its real WinAnsiEncoding byte first, and
// fall back to "?" for anything else outside Latin-1 rather than corrupt
// the stream.
const WIN_ANSI_OVERRIDES: Record<string, number> = {
  "‘": 0x91, // ‘
  "’": 0x92, // ’
  "“": 0x93, // “
  "”": 0x94, // ”
  "•": 0x95, // •
  "–": 0x96, // –
  "—": 0x97, // —
  "…": 0x85, // …
};

function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 63;
    if (code <= 0xff) {
      out += ch;
    } else if (WIN_ANSI_OVERRIDES[ch] != null) {
      out += String.fromCharCode(WIN_ANSI_OVERRIDES[ch]);
    } else {
      out += "?";
    }
  }
  return out;
}

// Escapes a string for use inside a PDF literal string, `(...)`.
function pdfEscape(text: string): string {
  return toWinAnsi(text).replace(/[\\()]/g, (m) => `\\${m}`);
}

function toFixed(n: number): string {
  // PDF numbers don't need more than 3 decimal places for anything this
  // report draws, and trimming keeps the file smaller/more readable.
  return (Math.round(n * 1000) / 1000).toString();
}

export class PageBuilder {
  private ops: ContentOp[] = [];

  constructor(
    public width: number,
    public height: number,
  ) {}

  text(
    x: number,
    y: number,
    str: string,
    opts: { font: "F1" | "F2"; size: number; color?: RGB } = { font: "F1", size: 10 },
  ) {
    const [r, g, b] = opts.color ?? [0, 0, 0];
    this.ops.push(
      `q ${toFixed(r)} ${toFixed(g)} ${toFixed(b)} rg BT /${opts.font} ${toFixed(opts.size)} Tf 1 0 0 1 ${toFixed(x)} ${toFixed(y)} Tm (${pdfEscape(str)}) Tj ET Q`,
    );
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { fill?: RGB; stroke?: RGB; lineWidth?: number } = {},
  ) {
    const parts: string[] = ["q"];
    let op = "";
    if (opts.fill) {
      const [r, g, b] = opts.fill;
      parts.push(`${toFixed(r)} ${toFixed(g)} ${toFixed(b)} rg`);
      op += "f";
    }
    if (opts.stroke) {
      const [r, g, b] = opts.stroke;
      parts.push(`${toFixed(r)} ${toFixed(g)} ${toFixed(b)} RG`);
      parts.push(`${toFixed(opts.lineWidth ?? 1)} w`);
      op += "S";
    }
    parts.push(`${toFixed(x)} ${toFixed(y)} ${toFixed(w)} ${toFixed(h)} re`);
    parts.push(op || "n");
    parts.push("Q");
    this.ops.push(parts.join(" "));
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: { color?: RGB; lineWidth?: number } = {}) {
    const [r, g, b] = opts.color ?? [0, 0, 0];
    this.ops.push(
      `q ${toFixed(r)} ${toFixed(g)} ${toFixed(b)} RG ${toFixed(opts.lineWidth ?? 1)} w ${toFixed(x1)} ${toFixed(y1)} m ${toFixed(x2)} ${toFixed(y2)} l S Q`,
    );
  }

  image(ref: ImageRef, x: number, y: number, w: number, h: number) {
    this.ops.push(`q ${toFixed(w)} 0 0 ${toFixed(h)} ${toFixed(x)} ${toFixed(y)} cm ${ref.name} Do Q`);
  }

  toContentString(): string {
    return this.ops.join("\n");
  }
}

export class PdfWriter {
  private objects: PdfObject[] = [];
  private nextId = 1;
  private pageIds: number[] = [];
  private pages: PageBuilder[] = [];
  private fontHelveticaId: number;
  private fontHelveticaBoldId: number;
  private imageCounter = 0;
  private imgRefToId = new Map<string, number>();

  constructor() {
    this.fontHelveticaId = this.allocId();
    this.fontHelveticaBoldId = this.allocId();
  }

  private allocId(): number {
    return this.nextId++;
  }

  private addObject(id: number, body: string | Buffer) {
    this.objects.push(new PdfObject(id, typeof body === "string" ? Buffer.from(body, "latin1") : body));
  }

  addPage(width: number, height: number): PageBuilder {
    const page = new PageBuilder(width, height);
    this.pages.push(page);
    return page;
  }

  // Registers a PNG (decoded via png.ts) as one or two image XObjects (an
  // SMask object too, if the PNG has an alpha channel) and returns a
  // reference usable with PageBuilder.image(). Raw pixel planes are
  // re-compressed with FlateDecode — same compression PNG already uses
  // internally, just re-applied to the un-filtered planes PDF wants.
  embedPng(pngBytes: Buffer): ImageRef {
    const decoded = decodePng(pngBytes);
    const name = `/Im${++this.imageCounter}`;

    let smaskId: number | null = null;
    if (decoded.alpha) {
      smaskId = this.allocId();
      const compressed = deflateSync(decoded.alpha);
      this.addObject(
        smaskId,
        Buffer.concat([
          Buffer.from(
            `${smaskId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${decoded.width} /Height ${decoded.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
            "latin1",
          ),
          compressed,
          Buffer.from("\nendstream\nendobj\n", "latin1"),
        ]),
      );
    }

    const imgId = this.allocId();
    const compressedRgb = deflateSync(decoded.rgb);
    const smaskEntry = smaskId ? ` /SMask ${smaskId} 0 R` : "";
    this.addObject(
      imgId,
      Buffer.concat([
        Buffer.from(
          `${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${decoded.width} /Height ${decoded.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressedRgb.length}${smaskEntry} >>\nstream\n`,
          "latin1",
        ),
        compressedRgb,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      ]),
    );

    this.imgRefToId.set(name, imgId);

    return { name, widthPx: decoded.width, heightPx: decoded.height };
  }

  save(): Buffer {
    const catalogId = this.allocId();
    const pagesId = this.allocId();

    this.addObject(
      this.fontHelveticaId,
      `${this.fontHelveticaId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
    );
    this.addObject(
      this.fontHelveticaBoldId,
      `${this.fontHelveticaBoldId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
    );

    const xObjectEntries = Array.from(this.imgRefToId.entries())
      .map(([name, id]) => `${name} ${id} 0 R`)
      .join(" ");

    for (const page of this.pages) {
      const contentId = this.allocId();
      const pageId = this.allocId();
      this.pageIds.push(pageId);

      const contentBytes = Buffer.from(page.toContentString(), "latin1");
      this.addObject(
        contentId,
        Buffer.concat([
          Buffer.from(`${contentId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`, "latin1"),
          contentBytes,
          Buffer.from("\nendstream\nendobj\n", "latin1"),
        ]),
      );

      this.addObject(
        pageId,
        `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${toFixed(page.width)} ${toFixed(page.height)}] ` +
          `/Resources << /Font << /F1 ${this.fontHelveticaId} 0 R /F2 ${this.fontHelveticaBoldId} 0 R >>` +
          (xObjectEntries ? ` /XObject << ${xObjectEntries} >>` : "") +
          ` >> /Contents ${contentId} 0 R >>\nendobj\n`,
      );
    }

    this.addObject(
      catalogId,
      `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`,
    );
    this.addObject(
      pagesId,
      `${pagesId} 0 obj\n<< /Type /Pages /Kids [${this.pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${this.pageIds.length} >>\nendobj\n`,
    );

    // Assemble the file: header, every object (sorted by id — order in the
    // file is unimportant for a valid PDF, but ascending keeps it easy to
    // read/debug), xref table, trailer.
    const header = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1");
    const sorted = [...this.objects].sort((a, b) => a.id - b.id);
    const maxId = sorted.length ? sorted[sorted.length - 1].id : 0;

    const offsets = new Map<number, number>();
    let cursor = header.length;
    const chunks: Buffer[] = [header];
    for (const obj of sorted) {
      offsets.set(obj.id, cursor);
      chunks.push(obj.body);
      cursor += obj.body.length;
    }

    const xrefStart = cursor;
    const xrefLines: string[] = [`xref\n`, `0 ${maxId + 1}\n`, `0000000000 65535 f \n`];
    for (let id = 1; id <= maxId; id++) {
      const offset = offsets.get(id);
      if (offset === undefined) {
        xrefLines.push(`0000000000 00000 f \n`);
      } else {
        xrefLines.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
      }
    }
    const xrefBlock = Buffer.from(xrefLines.join(""), "latin1");
    chunks.push(xrefBlock);

    const trailer = Buffer.from(
      `trailer\n<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
      "latin1",
    );
    chunks.push(trailer);

    return Buffer.concat(chunks);
  }
}
