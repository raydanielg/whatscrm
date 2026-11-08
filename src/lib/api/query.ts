/**
 * Shared query helper for v1 REST endpoints.
 * Parses standard REST params: pagination, sorting, filtering, search, sparse fieldsets.
 *
 *   ?limit=50&offset=0
 *   ?sort=-created_at,name
 *   ?filter[status]=open&filter[priority]=high
 *   ?search=alice
 *   ?fields=id,name,email
 *
 * Only whitelisted columns may be filtered/sorted on to prevent injection.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";

export interface QuerySpec {
  filterable: readonly string[];
  sortable: readonly string[];
  searchable?: readonly string[];
  defaultSort?: string; // e.g. "-created_at"
  maxLimit?: number;
}

export interface ParsedQuery {
  limit: number;
  offset: number;
  sort: Array<{ column: string; ascending: boolean }>;
  filters: Array<{ column: string; op: "eq" | "in" | "gte" | "lte" | "ilike"; value: unknown }>;
  search: string | null;
  fields: string[] | null;
}

export function parseQuery(url: URL, spec: QuerySpec): ParsedQuery {
  const maxLimit = spec.maxLimit ?? 200;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50") || 50, 1), maxLimit);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? "0") || 0, 0);

  const sortParam = url.searchParams.get("sort") ?? spec.defaultSort ?? "-created_at";
  const sort = sortParam
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const ascending = !raw.startsWith("-");
      const column = raw.replace(/^-/, "");
      return { column, ascending };
    })
    .filter((s) => spec.sortable.includes(s.column));

  const filters: ParsedQuery["filters"] = [];
  url.searchParams.forEach((value, key) => {
    const m = /^filter\[([a-z0-9_]+)\](?:\[(eq|in|gte|lte|ilike)\])?$/i.exec(key);
    if (!m) return;
    const column = m[1];
    const op = (m[2] ?? "eq") as ParsedQuery["filters"][number]["op"];
    if (!spec.filterable.includes(column)) return;
    if (op === "in") {
      filters.push({ column, op, value: value.split(",").map((v) => v.trim()).filter(Boolean) });
    } else if (op === "ilike") {
      filters.push({ column, op, value: `%${value}%` });
    } else {
      filters.push({ column, op, value });
    }
  });

  const search = url.searchParams.get("search")?.trim() || null;
  const fieldsRaw = url.searchParams.get("fields");
  const fields = fieldsRaw ? fieldsRaw.split(",").map((f) => f.trim()).filter(Boolean) : null;

  return { limit, offset, sort, filters, search, fields };
}

export function applyQuery<T>(
  builder: any,
  parsed: ParsedQuery,
  spec: QuerySpec,
): any {
  for (const f of parsed.filters) {
    switch (f.op) {
      case "eq": builder = builder.eq(f.column, f.value); break;
      case "in": builder = builder.in(f.column, f.value as unknown[]); break;
      case "gte": builder = builder.gte(f.column, f.value); break;
      case "lte": builder = builder.lte(f.column, f.value); break;
      case "ilike": builder = builder.ilike(f.column, f.value); break;
    }
  }
  if (parsed.search && spec.searchable && spec.searchable.length > 0) {
    const clean = parsed.search.replace(/[%,]/g, "");
    const orExpr = spec.searchable.map((c) => `${c}.ilike.%${sanitizeSearchTerm(clean)}%`).join(",");
    builder = builder.or(orExpr);
  }
  if (parsed.sort.length === 0) {
    builder = builder.order("created_at", { ascending: false });
  } else {
    for (const s of parsed.sort) builder = builder.order(s.column, { ascending: s.ascending });
  }
  builder = builder.range(parsed.offset, parsed.offset + parsed.limit - 1);
  return builder as T;
}

export function selectFields(defaults: string, fields: string[] | null): string {
  if (!fields || fields.length === 0) return defaults;
  const allowed = new Set(defaults.split(",").map((s) => s.trim()));
  const chosen = fields.filter((f) => allowed.has(f));
  return chosen.length > 0 ? chosen.join(", ") : defaults;
}
