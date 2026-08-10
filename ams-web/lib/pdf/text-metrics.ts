// Approximate Helvetica glyph widths (in em, i.e. fractions of font size) —
// close enough to the real AFM metrics for safe word-wrapping without
// shipping the actual (fairly large) width table. Errs slightly wide
// rather than narrow, so wrapped lines never overflow their column.
const NARROW = new Set("iIl.,:;'!|".split(""));
const WIDE = new Set("MWmw@%".split(""));
const UPPER = /[A-Z]/;
const DIGIT = /[0-9]/;

function charWidthEm(ch: string): number {
  if (ch === " ") return 0.28;
  if (NARROW.has(ch)) return 0.28;
  if (WIDE.has(ch)) return 0.9;
  if (UPPER.test(ch)) return 0.67;
  if (DIGIT.test(ch)) return 0.56;
  return 0.52;
}

export function measureText(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += charWidthEm(ch) * fontSize;
  return w;
}

// Greedy word-wrap: splits on whitespace, packs words onto a line up to
// maxWidth, and hard-breaks any single word wider than maxWidth on its
// own (rare, but guards against a long unbroken token like a URL).
export function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureText(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (measureText(word, fontSize) <= maxWidth) {
        current = word;
      } else {
        // Single word longer than the column — break it character by
        // character rather than let it overflow.
        let chunk = "";
        for (const ch of word) {
          if (measureText(chunk + ch, fontSize) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}
