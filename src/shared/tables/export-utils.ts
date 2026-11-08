/**
 * Client-side CSV export/import utilities. Keep them token-agnostic so any
 * table page can plug them into `TableToolbar`.
 */

export type ExportColumn<T> = {
  key: string;
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
};

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map((c) => escapeCsv(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCsv(c.value(row))).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

export function downloadCsv<T>(rows: T[], columns: ExportColumn<T>[], filename = "export.csv") {
  const csv = toCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Minimal CSV parser (RFC 4180-ish). Good for internal admin imports.
 * For untrusted uploads pair with zod validation per row.
 */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      cur.push(field);
      field = "";
    } else if (ch === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
    } else field += ch;
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.length > 0));
  if (!head) return [];
  return body.map((r) =>
    Object.fromEntries(head.map((key, i) => [key.trim(), (r[i] ?? "").trim()])),
  );
}

/** Prompt the user for a CSV file and resolve with parsed rows. */
export function pickCsvFile(): Promise<Array<Record<string, string>>> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve([]);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(parseCsv(String(reader.result ?? "")));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}
