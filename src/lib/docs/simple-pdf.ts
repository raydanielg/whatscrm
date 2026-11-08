/**
 * Tiny dependency-free PDF writer (Helvetica only).
 * Runs anywhere — browser, Node, and the edge/Worker runtime — because it only
 * builds a byte string; no native modules, no filesystem.
 */

export type PdfBlock =
  | { type: "title"; text: string }
  | { type: "subtitle"; text: string }
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "bullet"; text: string }
  | { type: "space"; size?: number }
  | { type: "rule" };

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 64;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

type Font = "F1" | "F2"; // F1 = Helvetica, F2 = Helvetica-Bold

const NARROW = new Set("iljtfr.,;:'\"|!()[]{}/\\ ".split(""));
const WIDE = new Set("mwMW@%".split(""));

/** Approximate Helvetica advance width for a string at a given size. */
function measure(text: string, size: number, bold: boolean): number {
  let units = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) units += 0.29;
    else if (WIDE.has(ch)) units += 0.86;
    else if (ch >= "A" && ch <= "Z") units += 0.68;
    else if (ch >= "0" && ch <= "9") units += 0.56;
    else units += 0.53;
  }
  return units * size * (bold ? 1.06 : 1);
}

function wrap(text: string, size: number, bold: boolean, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, size, bold) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Drop characters that WinAnsi/Helvetica cannot render, and escape PDF syntax. */
function sanitize(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\u00b7/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdf(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

interface Line {
  text: string;
  x: number;
  y: number;
  size: number;
  font: Font;
  gray?: number;
}

interface Rule {
  y: number;
}

export function buildPdf(blocks: PdfBlock[], meta: { title: string; author: string }): Uint8Array {
  const pages: { lines: Line[]; rules: Rule[] }[] = [];
  let current = { lines: [] as Line[], rules: [] as Rule[] };
  pages.push(current);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  const newPage = () => {
    current = { lines: [], rules: [] };
    pages.push(current);
    y = PAGE_HEIGHT - MARGIN_TOP;
  };

  const ensure = (needed: number) => {
    if (y - needed < MARGIN_BOTTOM) newPage();
  };

  const push = (
    text: string,
    size: number,
    font: Font,
    leading: number,
    indent = 0,
    gray?: number,
  ) => {
    const bold = font === "F2";
    for (const line of wrap(sanitize(text), size, bold, CONTENT_WIDTH - indent)) {
      ensure(leading);
      y -= leading;
      current.lines.push({ text: line, x: MARGIN_X + indent, y, size, font, gray });
    }
  };

  for (const block of blocks) {
    switch (block.type) {
      case "title":
        push(block.text, 24, "F2", 30);
        break;
      case "subtitle":
        push(block.text, 11, "F1", 16, 0, 0.42);
        break;
      case "heading":
        ensure(30);
        y -= 12;
        push(block.text, 14, "F2", 20);
        break;
      case "text":
        push(block.text, 10.5, "F1", 15);
        break;
      case "bullet": {
        const bold = false;
        const lines = wrap(sanitize(block.text), 10.5, bold, CONTENT_WIDTH - 18);
        lines.forEach((line, index) => {
          ensure(15);
          y -= 15;
          if (index === 0) {
            current.lines.push({ text: "-", x: MARGIN_X + 4, y, size: 10.5, font: "F1" });
          }
          current.lines.push({ text: line, x: MARGIN_X + 18, y, size: 10.5, font: "F1" });
        });
        break;
      }
      case "space":
        y -= block.size ?? 10;
        break;
      case "rule":
        ensure(16);
        y -= 10;
        current.rules.push({ y });
        y -= 6;
        break;
    }
  }

  // ---- assemble objects ----
  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length; // 1-based object number
  };

  const fontRegular = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  const pagesObjNumber = objects.length + 1 + pages.length * 2 + 1; // placeholder, fixed below
  const pageObjNumbers: number[] = [];

  for (const page of pages) {
    const parts: string[] = [];
    for (const rule of page.rules) {
      parts.push(
        `q 0.85 0.85 0.85 RG 0.8 w ${MARGIN_X} ${rule.y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN_X).toFixed(2)} ${rule.y.toFixed(2)} l S Q`,
      );
    }
    for (const line of page.lines) {
      const gray = line.gray ?? 0;
      parts.push(
        `BT /${line.font} ${line.size} Tf ${gray} g ${line.x.toFixed(2)} ${line.y.toFixed(2)} Td (${escapePdf(line.text)}) Tj ET`,
      );
    }
    const stream = parts.join("\n");
    const contentNumber = addObject(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
    const pageNumber = addObject(
      `<< /Type /Page /Parent ${pagesObjNumber} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentNumber} 0 R >>`,
    );
    pageObjNumbers.push(pageNumber);
  }

  const pagesNumber = addObject(
    `<< /Type /Pages /Count ${pageObjNumbers.length} /Kids [${pageObjNumbers.map((n) => `${n} 0 R`).join(" ")}] >>`,
  );
  // Fix up the /Parent references now that the real number is known.
  for (const pageNumber of pageObjNumbers) {
    objects[pageNumber - 1] = objects[pageNumber - 1]!.replace(
      `/Parent ${pagesObjNumber} 0 R`,
      `/Parent ${pagesNumber} 0 R`,
    );
  }

  const infoNumber = addObject(
    `<< /Title (${escapePdf(sanitize(meta.title))}) /Author (${escapePdf(sanitize(meta.author))}) /Producer (${escapePdf(sanitize(meta.author))}) >>`,
  );
  const catalogNumber = addObject(`<< /Type /Catalog /Pages ${pagesNumber} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNumber} 0 R /Info ${infoNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
