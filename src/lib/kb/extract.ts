/**
 * Client-side extractors for PDF, DOCX, and Markdown files.
 * PDFs use pdfjs-dist, DOCX uses mammoth, Markdown/text is read as-is.
 */

export interface ExtractResult {
  text: string;
  sourceType: "pdf" | "docx" | "markdown" | "txt" | "csv";
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

async function readFileAsText(file: File): Promise<string> {
  return await file.text();
}

export async function extractText(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (name.endsWith(".pdf") || type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    // Point worker to the CDN copy (avoids Vite bundling snags).
    const workerUrl =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs";
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } })
      .GlobalWorkerOptions.workerSrc = workerUrl;

    const buf = await readFileAsArrayBuffer(file);
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((it: any) => ("str" in it ? String(it.str) : ""))
        .filter(Boolean);
      parts.push(strings.join(" "));
    }
    return { text: parts.join("\n\n").trim(), sourceType: "pdf" };
  }

  if (
    name.endsWith(".docx") ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const buf = await readFileAsArrayBuffer(file);
    // extractRawText is safer than convertToHtml for our chunker.
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return { text: (res.value || "").trim(), sourceType: "docx" };
  }

  if (name.endsWith(".md") || name.endsWith(".markdown") || type === "text/markdown") {
    const text = await readFileAsText(file);
    return { text: text.trim(), sourceType: "markdown" };
  }

  if (name.endsWith(".txt") || type === "text/plain") {
    const text = await readFileAsText(file);
    return { text: text.trim(), sourceType: "txt" };
  }

  if (name.endsWith(".csv") || type === "text/csv" || type === "application/vnd.ms-excel") {
    const raw = await readFileAsText(file);
    // Convert CSV → markdown table so the chunker keeps row context.
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) return { text: "", sourceType: "csv" };
    const parseRow = (line: string): string[] => {
      const cells: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === "," && !inQ) {
          cells.push(cur); cur = "";
        } else cur += ch;
      }
      cells.push(cur);
      return cells.map((c) => c.trim());
    };
    const header = parseRow(lines[0]);
    const md: string[] = [];
    md.push(`| ${header.join(" | ")} |`);
    md.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (let i = 1; i < lines.length; i++) {
      const cells = parseRow(lines[i]);
      // Also emit a "row prose" line so semantic search retrieves single rows well.
      const prose = header.map((h, idx) => `${h}: ${cells[idx] ?? ""}`).join("; ");
      md.push(`| ${cells.join(" | ")} |`);
      md.push(`\n${prose}\n`);
    }
    return { text: md.join("\n"), sourceType: "csv" };
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}
