/**
 * Segment filter definition + evaluator for `customer_segments`.
 *
 * Filter definitions are stored on `customer_segments.filter_definition`
 * as JSON in the shape `{ logic, conditions[] }`. This module owns:
 *  - the TypeScript shape of a condition
 *  - the mapping from a condition to a PostgREST filter fragment
 *  - a helper that applies the whole rule set to a Supabase query builder
 *
 * Filters run against `public.contacts` (workspace-scoped, non-deleted,
 * non-archived, do_not_contact respected). Kept intentionally client-safe
 * so both the editor preview and any server-side materialization can share
 * the same evaluator.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SegmentLogic = "AND" | "OR";

/** All supported condition shapes. Discriminated by `field`. */
export type SegmentCondition =
  | { field: "tags"; op: "contains_any" | "contains_all" | "not_contains"; values: string[] }
  | {
      field: "last_seen_at";
      op: "within_days" | "older_than_days" | "never" | "ever";
      days?: number;
    }
  | { field: "lifecycle_stage"; op: "is" | "is_not"; value: string }
  | { field: "customer_status"; op: "is" | "is_not"; value: string }
  | { field: "source"; op: "is" | "is_not"; value: string }
  | { field: "do_not_contact"; op: "is"; value: boolean }
  | { field: "custom_field"; op: "equals" | "not_equals" | "contains"; key: string; value: string };

export type SegmentFilterDefinition = {
  logic: SegmentLogic;
  conditions: SegmentCondition[];
};

export const EMPTY_DEFINITION: SegmentFilterDefinition = { logic: "AND", conditions: [] };

/** Human-readable label used across the editor and segment cards. */
export function describeCondition(c: SegmentCondition): string {
  switch (c.field) {
    case "tags": {
      const vals = c.values.filter(Boolean).join(", ") || "—";
      if (c.op === "contains_any") return `Tag matches any of: ${vals}`;
      if (c.op === "contains_all") return `Tag matches all of: ${vals}`;
      return `Tag not in: ${vals}`;
    }
    case "last_seen_at":
      if (c.op === "never") return "Never active";
      if (c.op === "ever") return "Active at least once";
      if (c.op === "within_days") return `Active in last ${c.days ?? 0} days`;
      return `Inactive for more than ${c.days ?? 0} days`;
    case "lifecycle_stage":
      return `Lifecycle stage ${c.op === "is" ? "is" : "is not"} "${c.value}"`;
    case "customer_status":
      return `Status ${c.op === "is" ? "is" : "is not"} "${c.value}"`;
    case "source":
      return `Source ${c.op === "is" ? "is" : "is not"} "${c.value}"`;
    case "do_not_contact":
      return c.value ? "Do-not-contact ON" : "Do-not-contact OFF";
    case "custom_field": {
      const op = c.op === "equals" ? "=" : c.op === "not_equals" ? "≠" : "contains";
      return `Custom field "${c.key}" ${op} "${c.value}"`;
    }
    default:
      return "Unknown rule";
  }
}

/**
 * Convert a single condition into PostgREST filter args. Returns tuples of
 * `[column, op, value]` for use with either `.filter()` (AND mode) or as a
 * comma-joined string inside `.or()` (OR mode).
 *
 * Returns `null` for incomplete rules so we can silently skip them in the
 * preview rather than error out mid-edit.
 */
export type PostgrestPart = { column: string; op: string; value: string };

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Math.max(0, Math.floor(days)));
  return d.toISOString();
}

/** PostgREST array literal: `{a,b,c}`. Escapes commas/braces conservatively. */
function pgArray(values: string[]): string {
  const clean = values.map((v) => v.trim()).filter(Boolean).map((v) => v.replace(/[{},"]/g, ""));
  return `{${clean.join(",")}}`;
}

export function conditionToParts(c: SegmentCondition): PostgrestPart[] | null {
  switch (c.field) {
    case "tags": {
      const vals = (c.values ?? []).map((v) => v.trim()).filter(Boolean);
      if (vals.length === 0) return null;
      if (c.op === "contains_any") return [{ column: "tags", op: "ov", value: pgArray(vals) }];
      if (c.op === "contains_all") return [{ column: "tags", op: "cs", value: pgArray(vals) }];
      // `not_contains` → NOT overlaps
      return [{ column: "tags", op: "not.ov", value: pgArray(vals) }];
    }
    case "last_seen_at": {
      if (c.op === "never") return [{ column: "last_seen_at", op: "is", value: "null" }];
      if (c.op === "ever") return [{ column: "last_seen_at", op: "not.is", value: "null" }];
      const days = Number(c.days ?? 0);
      if (!Number.isFinite(days) || days < 0) return null;
      const iso = daysAgoIso(days);
      if (c.op === "within_days") return [{ column: "last_seen_at", op: "gte", value: iso }];
      return [{ column: "last_seen_at", op: "lt", value: iso }];
    }
    case "lifecycle_stage":
    case "customer_status":
    case "source": {
      const v = (c.value ?? "").trim();
      if (!v) return null;
      return [{ column: c.field, op: c.op === "is" ? "eq" : "neq", value: v }];
    }
    case "do_not_contact":
      return [{ column: "do_not_contact", op: "is", value: c.value ? "true" : "false" }];
    case "custom_field": {
      const key = (c.key ?? "").trim();
      const val = (c.value ?? "").trim();
      if (!key || !val) return null;
      const column = `custom_fields->>${key}`;
      if (c.op === "equals") return [{ column, op: "eq", value: val }];
      if (c.op === "not_equals") return [{ column, op: "neq", value: val }];
      return [{ column, op: "ilike", value: `%${val}%` }];
    }
    default:
      return null;
  }
}

/**
 * Apply the segment definition to a Supabase contacts query. Returns the
 * (mutated-copy) builder ready to add `.select(...)` or run.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applySegmentFilter(query: any, def: SegmentFilterDefinition): any {
  const parts = (def.conditions ?? [])
    .map(conditionToParts)
    .filter((p): p is PostgrestPart[] => Array.isArray(p) && p.length > 0)
    .flat();

  if (parts.length === 0) return query;

  if (def.logic === "OR") {
    const encoded = parts.map((p) => `${p.column}.${p.op}.${p.value}`).join(",");
    return query.or(encoded);
  }

  let q = query;
  for (const p of parts) q = q.filter(p.column, p.op, p.value);
  return q;
}

/**
 * Convenience: build a filtered "count only" contacts query for a workspace
 * and return `{ count }`. Applies the standard "eligible contact" filters
 * (workspace scope, non-deleted, non-archived).
 */
export async function countSegmentMembers(
  supabase: SupabaseClient,
  workspaceId: string,
  def: SegmentFilterDefinition,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any)
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .eq("is_archived", false);
  q = applySegmentFilter(q, def);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}
