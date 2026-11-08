// Client-safe CSV parsing + validation for catalog imports.
// Used by the /commerce/import route to preview, validate, and stream rows to Supabase.

export type CsvCell = string;
export type CsvRow = Record<string, CsvCell>;

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { quoted = false; }
      else cur += ch;
    } else if (ch === '"' && cur === '') {
      quoted = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      lines.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.length) lines.push(cur);
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 1) return { headers: [], rows: [] };
  const split = (line: string): string[] => {
    const out: string[] = [];
    let c = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { c += '"'; i++; }
        else if (ch === '"') q = false;
        else c += ch;
      } else if (ch === ',') { out.push(c); c = ''; }
      else if (ch === '"' && c === '') q = true;
      else c += ch;
    }
    out.push(c);
    return out;
  };
  const headers = split(nonEmpty[0]).map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = nonEmpty.slice(1).map((line) => {
    const cells = split(line);
    const rec: CsvRow = {};
    headers.forEach((h, i) => { rec[h] = (cells[i] ?? '').trim(); });
    return rec;
  });
  return { headers, rows };
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

// ============ Product schema ============

export const PRODUCT_HEADERS = [
  'name', 'sku', 'barcode', 'kind', 'category', 'price', 'sale_price', 'cost',
  'currency', 'tax_rate', 'is_taxable', 'stock_quantity', 'track_inventory',
  'low_stock_threshold', 'unit', 'availability', 'is_featured', 'status', 'description',
];

export const PRODUCT_TEMPLATE = `${PRODUCT_HEADERS.join(',')}
"Sample tee","SKU-001",,product,Apparel,29.90,24.90,12.00,USD,0.25,true,100,true,5,unit,in stock,false,active,"A comfy cotton tee"
"Consulting hour","SVC-001",,service,,120,,,,USD,0,false,,false,,in stock,false,active,"Per hour"
`;

export const COLLECTION_HEADERS = ['name', 'description', 'cover_url', 'is_featured', 'sort_order', 'product_skus'];

export const COLLECTION_TEMPLATE = `${COLLECTION_HEADERS.join(',')}
"Best sellers","Our most popular items",https://example.com/cover.jpg,true,0,"SKU-001|SKU-002"
"New arrivals",,,,1,"SKU-003"
`;

export type ValidationIssue = { field: string; message: string };
export type ValidatedRow<T> = {
  index: number;
  raw: CsvRow;
  parsed: T | null;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export type ProductParsed = {
  name: string;
  sku: string | null;
  barcode: string | null;
  kind: 'product' | 'service' | 'subscription' | 'bundle';
  category: string | null;
  price: number | null;
  sale_price: number | null;
  cost: number | null;
  currency: string | null;
  tax_rate: number | null;
  is_taxable: boolean | null;
  stock_quantity: number | null;
  track_inventory: boolean | null;
  low_stock_threshold: number | null;
  unit: string | null;
  availability: string | null;
  is_featured: boolean | null;
  status: string | null;
  description: string | null;
};

const asNum = (v: string): number | null => {
  if (!v) return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN as unknown as number;
};
const asBool = (v: string): boolean | null => {
  if (!v) return null;
  if (/^(true|1|yes|y)$/i.test(v)) return true;
  if (/^(false|0|no|n)$/i.test(v)) return false;
  return null;
};

const VALID_KINDS = new Set(['product', 'service', 'subscription', 'bundle']);
const VALID_STATUS = new Set(['active', 'draft', 'archived']);

export function validateProductRow(raw: CsvRow, index: number): ValidatedRow<ProductParsed> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const push = (arr: ValidationIssue[], f: string, m: string) => arr.push({ field: f, message: m });

  const name = (raw.name ?? '').trim();
  if (!name) push(errors, 'name', 'Name is required');
  if (name.length > 200) push(errors, 'name', 'Name must be ≤ 200 chars');

  const kind = ((raw.kind ?? 'product').trim().toLowerCase() || 'product') as ProductParsed['kind'];
  if (!VALID_KINDS.has(kind)) push(errors, 'kind', `Must be one of ${[...VALID_KINDS].join(', ')}`);

  const status = (raw.status ?? '').trim().toLowerCase() || null;
  if (status && !VALID_STATUS.has(status)) push(errors, 'status', `Must be one of ${[...VALID_STATUS].join(', ')}`);

  const numFields: Array<keyof ProductParsed> = ['price', 'sale_price', 'cost', 'tax_rate', 'stock_quantity', 'low_stock_threshold'];
  const nums: Partial<Record<keyof ProductParsed, number | null>> = {};
  for (const f of numFields) {
    const v = asNum((raw[f as string] ?? '').trim());
    if (Number.isNaN(v as number)) push(errors, f as string, 'Must be a number');
    else nums[f] = v;
  }
  if (typeof nums.price === 'number' && nums.price < 0) push(errors, 'price', 'Must be ≥ 0');
  if (typeof nums.sale_price === 'number' && typeof nums.price === 'number' && nums.sale_price > nums.price) {
    push(warnings, 'sale_price', 'Sale price is greater than price');
  }

  const boolFields: Array<keyof ProductParsed> = ['is_taxable', 'track_inventory', 'is_featured'];
  const bools: Partial<Record<keyof ProductParsed, boolean | null>> = {};
  for (const f of boolFields) {
    const v = raw[f as string];
    const parsed = asBool((v ?? '').trim());
    if (v && parsed === null) push(errors, f as string, 'Must be true/false');
    bools[f] = parsed;
  }

  const currency = (raw.currency ?? '').trim().toUpperCase() || null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) push(errors, 'currency', 'Must be a 3-letter ISO code');

  const parsed: ProductParsed | null = errors.length ? null : {
    name,
    sku: (raw.sku ?? '').trim() || null,
    barcode: (raw.barcode ?? '').trim() || null,
    kind,
    category: (raw.category ?? '').trim() || null,
    price: nums.price ?? null,
    sale_price: nums.sale_price ?? null,
    cost: nums.cost ?? null,
    currency,
    tax_rate: nums.tax_rate ?? null,
    is_taxable: bools.is_taxable ?? null,
    stock_quantity: nums.stock_quantity ?? null,
    track_inventory: bools.track_inventory ?? null,
    low_stock_threshold: nums.low_stock_threshold ?? null,
    unit: (raw.unit ?? '').trim() || null,
    availability: (raw.availability ?? '').trim() || null,
    is_featured: bools.is_featured ?? null,
    status: status ?? null,
    description: (raw.description ?? '').trim() || null,
  };

  return { index, raw, parsed, errors, warnings };
}

export type CollectionParsed = {
  name: string;
  description: string | null;
  cover_url: string | null;
  is_featured: boolean;
  sort_order: number;
  product_skus: string[];
};

export function validateCollectionRow(raw: CsvRow, index: number): ValidatedRow<CollectionParsed> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const push = (f: string, m: string) => errors.push({ field: f, message: m });

  const name = (raw.name ?? '').trim();
  if (!name) push('name', 'Name is required');
  if (name.length > 200) push('name', 'Name must be ≤ 200 chars');

  const cover = (raw.cover_url ?? '').trim();
  if (cover && !/^https?:\/\//i.test(cover)) push('cover_url', 'Must be an http(s) URL');

  const featured = asBool((raw.is_featured ?? '').trim());
  if ((raw.is_featured ?? '').trim() && featured === null) push('is_featured', 'Must be true/false');

  const sortRaw = (raw.sort_order ?? '').trim();
  const sort = sortRaw ? Number(sortRaw) : 0;
  if (sortRaw && !Number.isFinite(sort)) push('sort_order', 'Must be an integer');

  const skus = (raw.product_skus ?? '')
    .split(/[|;]/).map((s) => s.trim()).filter(Boolean);

  const parsed: CollectionParsed | null = errors.length ? null : {
    name,
    description: (raw.description ?? '').trim() || null,
    cover_url: cover || null,
    is_featured: featured ?? false,
    sort_order: Number.isFinite(sort) ? sort : 0,
    product_skus: skus,
  };

  return { index, raw, parsed, errors, warnings };
}
