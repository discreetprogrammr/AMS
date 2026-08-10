// Minimal PNG decoder — enough to pull raw RGB(+alpha) pixel data out of a
// standard 8-bit, non-interlaced PNG so it can be re-embedded in a
// hand-written PDF (see writer.ts). Written from scratch against no
// external dependency: no PDF-generation *or* image-decoding package
// (pdf-lib, pngjs, sharp, etc.) can be installed in this sandbox — its
// npm registry only allows what's already in package.json — so this uses
// only Node's built-in `zlib` for the DEFLATE step PNG already requires.
//
// Deliberately narrow scope: 8-bit depth, color type 2 (RGB) or 6 (RGBA),
// no interlacing, no palette. That covers ordinary PNG exports (including
// the logo this is built for) without the extra complexity of palette/
// interlace/16-bit support this app doesn't need.
import { inflateSync } from "zlib";

export type DecodedPng = {
  width: number;
  height: number;
  rgb: Buffer; // width * height * 3, no filter bytes
  alpha: Buffer | null; // width * height, or null if no alpha channel
};

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buf: Buffer): DecodedPng {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) {
    throw new Error("Not a PNG file");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buf.subarray(dataStart, dataStart + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      const interlace = data.readUInt8(12);
      if (bitDepth !== 8) {
        throw new Error(`Unsupported PNG bit depth: ${bitDepth} (only 8-bit supported)`);
      }
      if (colorType !== 2 && colorType !== 6) {
        throw new Error(
          `Unsupported PNG color type: ${colorType} (only RGB/RGBA truecolor supported)`,
        );
      }
      if (interlace !== 0) {
        throw new Error("Interlaced PNGs are not supported");
      }
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }

    offset = dataStart + length + 4; // skip CRC
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idatChunks));

  const bpp = channels; // bytes per pixel at 8-bit depth
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);

  let rawPos = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawPos];
    rawPos += 1;
    const rowStart = y * stride;
    const priorRowStart = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawPos + x];
      const a = x >= bpp ? pixels[rowStart + x - bpp] : 0;
      const b = y > 0 ? pixels[priorRowStart + x] : 0;
      const c = y > 0 && x >= bpp ? pixels[priorRowStart + x - bpp] : 0;

      let value: number;
      switch (filterType) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + a;
          break;
        case 2:
          value = rawByte + b;
          break;
        case 3:
          value = rawByte + Math.floor((a + b) / 2);
          break;
        case 4:
          value = rawByte + paeth(a, b, c);
          break;
        default:
          throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }
      pixels[rowStart + x] = value & 0xff;
    }
    rawPos += stride;
  }

  if (channels === 3) {
    return { width, height, rgb: pixels, alpha: null };
  }

  // Split interleaved RGBA into separate RGB and alpha planes — PDF wants
  // color and soft-mask (alpha) as two distinct image streams.
  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    rgb[i * 3] = pixels[p];
    rgb[i * 3 + 1] = pixels[p + 1];
    rgb[i * 3 + 2] = pixels[p + 2];
    alpha[i] = pixels[p + 3];
  }
  return { width, height, rgb, alpha };
}
