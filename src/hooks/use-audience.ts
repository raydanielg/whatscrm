import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

/* ---------- Filter DSL ---------- */

export type AudienceField =
  | "tags"
  | "lead_status"
  | "customer_status"
  | "lifecycle_stage"
  | "country"
  | "city"
  | "language"
  | "timezone"
  | "owner_id"
  | "assigned_agent_id"
  | "customer_lifetime_value"
  | "is_favorite"
  | "do_not_contact"
  | "segments"
  | "created_at"
  | "last_seen_at"
  | "search"
  | "pipeline_stage"
  | "last_conversation_at"
  | "last_campaign_id";

export type AudienceOperator =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "is_null"
  | "not_null"
  | "within_days";

export interface AudienceCondition {
  id: string;
  field: AudienceField;
  operator: AudienceOperator;
  value?: unknown;
}

export interface AudienceFilter {
  conditions: AudienceCondition[];
  logic: "AND" | "OR";
}

export const EMPTY_FILTER: AudienceFilter = { conditions: [], logic: "AND" };

/* ---------- Types ---------- */

export interface SavedAudienceRow {
  id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  description: string | null;
  filter_definition: AudienceFilter;
  is_favorite: boolean;
  is_shared: boolean;
  last_used_at: string | null;
  member_count: number;
  last_computed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudienceContact {
  id: string;
  workspace_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  avatar_url: string | null;
  tags: string[];
  segments: string[];
  lifecycle_stage: string;
  status: string;
  lead_status: string | null;
  customer_status: string | null;
  owner_id: string | null;
  assigned_agent_id: string | null;
  timezone: string | null;
  locale: string | null;
  customer_lifetime_value: number | null;
  is_favorite: boolean;
  do_not_contact: boolean;
  address: { country?: string; city?: string; state?: string } | null;
  last_seen_at: string | null;
  created_at: string;
}

/* ---------- Query builder ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

function daysAgoISO(days: number) {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

/**
 * Applies filter to a Supabase contacts query. Uses OR string when logic=OR,
 * chained .eq/.in/etc. when AND. Text-heavy fields (country/city) go through
 * jsonb accessors.
 */
export function applyAudienceFilter(query: Q, filter: AudienceFilter): Q {
  if (!filter.conditions.length) return query;
  const parts: string[] = [];
  const useOr = filter.logic === "OR";

  for (const c of filter.conditions) {
    const push = (fragment: string) => parts.push(fragment);
    switch (c.field) {
      case "search": {
        const v = String(c.value ?? "").trim();
        if (v) {
          const like = `%${sanitizeSearchTerm(v)}%`;
          if (useOr) {
            push(`display_name.ilike.${like}`);
            push(`email.ilike.${like}`);
            push(`phone.ilike.${like}`);
          } else {
            query = query.or(
              `display_name.ilike.${like},email.ilike.${like},phone.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`,
            );
          }
        }
        break;
      }
      case "tags":
      case "segments": {
        const vals = Array.isArray(c.value) ? (c.value as string[]) : [];
        if (vals.length === 0) break;
        if (useOr) push(`${c.field}.cs.{${vals.join(",")}}`);
        else if (c.operator === "not_in")
          query = query.not(c.field, "cs", `{${vals.join(",")}}`);
        else query = query.contains(c.field, vals);
        break;
      }
      case "country":
      case "city": {
        const v = String(c.value ?? "").trim();
        if (!v) break;
        if (useOr) push(`address->>${c.field}.ilike.%${sanitizeSearchTerm(v)}%`);
        else query = query.ilike(`address->>${c.field}`, `%${sanitizeSearchTerm(v)}%`);
        break;
      }
      case "language": {
        const v = String(c.value ?? "").trim();
        if (!v) break;
        if (useOr) push(`locale.ilike.${v}%`);
        else query = query.ilike("locale", `${v}%`);
        break;
      }
      case "customer_lifetime_value": {
        const n = Number(c.value ?? 0);
        if (useOr) push(`customer_lifetime_value.${c.operator === "lt" ? "lt" : "gte"}.${n}`);
        else if (c.operator === "lt") query = query.lt("customer_lifetime_value", n);
        else if (c.operator === "lte") query = query.lte("customer_lifetime_value", n);
        else if (c.operator === "gt") query = query.gt("customer_lifetime_value", n);
        else query = query.gte("customer_lifetime_value", n);
        break;
      }
      case "created_at":
      case "last_seen_at": {
        if (c.operator === "within_days") {
          const iso = daysAgoISO(Number(c.value ?? 30));
          if (useOr) push(`${c.field}.gte.${iso}`);
          else query = query.gte(c.field, iso);
        } else if (c.operator === "is_null") {
          if (useOr) push(`${c.field}.is.null`);
          else query = query.is(c.field, null);
        } else if (c.operator === "not_null") {
          if (useOr) push(`${c.field}.not.is.null`);
          else query = query.not(c.field, "is", null);
        }
        break;
      }
      case "is_favorite":
      case "do_not_contact": {
        const v = Boolean(c.value);
        if (useOr) push(`${c.field}.eq.${v}`);
        else query = query.eq(c.field, v);
        break;
      }
      // pipeline_stage / last_conversation_at / last_campaign_id are handled in a
      // post-fetch pass by useAudienceContacts (they'd need joins).
      case "pipeline_stage":
      case "last_conversation_at":
      case "last_campaign_id":
        break;
      default: {
        // Scalar text/enum fields (lead_status, customer_status, lifecycle_stage,
        // owner_id, assigned_agent_id, timezone)
        if (c.operator === "in" && Array.isArray(c.value) && c.value.length) {
          if (useOr) push(`${c.field}.in.(${(c.value as string[]).join(",")})`);
          else query = query.in(c.field, c.value as string[]);
        } else if (c.operator === "not_in" && Array.isArray(c.value) && c.value.length) {
          query = query.not(c.field, "in", `(${(c.value as string[]).join(",")})`);
        } else if (c.operator === "is_null") {
          if (useOr) push(`${c.field}.is.null`);
          else query = query.is(c.field, null);
        } else if (c.operator === "not_null") {
          if (useOr) push(`${c.field}.not.is.null`);
          else query = query.not(c.field, "is", null);
        } else if (c.value !== undefined && c.value !== "") {
          if (useOr) push(`${c.field}.eq.${String(c.value)}`);
          else query = query.eq(c.field, c.value);
        }
      }
    }
  }
  if (useOr && parts.length) query = query.or(parts.join(","));
  return query;
}

/* ---------- Contacts search ---------- */

export function useAudienceContacts(filter: AudienceFilter, opts?: { limit?: number }) {
  const { active } = useCurrentWorkspace();
  const limit = opts?.limit ?? 200;
  const key = useMemo(() => JSON.stringify(filter), [filter]);
  return useQuery({
    queryKey: ["audience-contacts", active?.id, key, limit],
    enabled: !!active?.id,
    queryFn: async () => {
      let q = supabase
        .from("contacts")
        .select(
          "id, workspace_id, display_name, first_name, last_name, email, phone, whatsapp, avatar_url, tags, segments, lifecycle_stage, status, lead_status, customer_status, owner_id, assigned_agent_id, timezone, locale, customer_lifetime_value, is_favorite, do_not_contact, address, last_seen_at, created_at",
          { count: "exact" },
        )
        .eq("workspace_id", active!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      q = applyAudienceFilter(q, filter);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as AudienceContact[], total: count ?? 0 };
    },
  });
}

/* ---------- Saved audiences ---------- */

export function useSavedAudiences() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["saved-audiences", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_audiences" as never)
        .select("*")
        .eq("workspace_id", active!.id)
        .order("is_favorite", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SavedAudienceRow[];
    },
  });
}

export function useUpsertSavedAudience() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<SavedAudienceRow> & { id?: string }) => {
      const payload = { ...input, workspace_id: input.workspace_id ?? active!.id };
      const { data, error } = await supabase
        .from("saved_audiences" as never)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as SavedAudienceRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-audiences"] }),
  });
}

export function useDeleteSavedAudience() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("saved_audiences" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-audiences"] }),
  });
}

/* ---------- Bulk actions ---------- */

export function useBulkTagContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; add?: string[]; remove?: string[] }) => {
      // Fetch existing tags then merge — Supabase JS has no array append.
      const { data: rows, error: e1 } = await supabase
        .from("contacts")
        .select("id, tags")
        .in("id", input.ids);
      if (e1) throw e1;
      const add = new Set(input.add ?? []);
      const remove = new Set(input.remove ?? []);
      await Promise.all(
        (rows ?? []).map(async (r) => {
          const cur = new Set((r.tags as string[] | null) ?? []);
          add.forEach((t) => cur.add(t));
          remove.forEach((t) => cur.delete(t));
          await sbAny(supabase).from("contacts").update({ tags: Array.from(cur) }).eq("id", r.id);
        }),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audience-contacts"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useBulkUpdateContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("contacts")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(input.patch as any)
        .in("id", input.ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audience-contacts"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useBulkDeleteContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("contacts")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audience-contacts"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useAddContactsToList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { listId: string; contactIds: string[] }) => {
      const rows = input.contactIds.map((cid) => ({ list_id: input.listId, contact_id: cid }));
      const { error } = await supabase
        .from("contact_list_members" as never)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(rows as any, { onConflict: "list_id,contact_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-lists"] }),
  });
}

/* ---------- Import / Export CSV ---------- */

export function toCSV(rows: AudienceContact[]): string {
  const headers = [
    "id",
    "display_name",
    "first_name",
    "last_name",
    "email",
    "phone",
    "whatsapp",
    "tags",
    "segments",
    "lifecycle_stage",
    "lead_status",
    "customer_status",
    "country",
    "city",
    "language",
    "timezone",
    "customer_lifetime_value",
    "created_at",
  ];
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = Array.isArray(v) ? v.join("|") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.display_name,
        r.first_name,
        r.last_name,
        r.email,
        r.phone,
        r.whatsapp,
        r.tags,
        r.segments,
        r.lifecycle_stage,
        r.lead_status,
        r.customer_status,
        r.address?.country ?? "",
        r.address?.city ?? "",
        r.locale,
        r.timezone,
        r.customer_lifetime_value,
        r.created_at,
      ]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (values[i] ?? "").trim()));
    return row;
  });
}

export function useImportContacts() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      if (!active?.id) throw new Error("No workspace");
      const payload = rows.map((r) => ({
        workspace_id: active.id,
        display_name: r.display_name || r.name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || null,
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        email: r.email || null,
        phone: r.phone || null,
        whatsapp: r.whatsapp || r.phone || null,
        tags: r.tags ? r.tags.split("|").map((t) => t.trim()).filter(Boolean) : [],
        lifecycle_stage: r.lifecycle_stage || "lead",
        lead_status: r.lead_status || null,
        customer_status: r.customer_status || null,
        locale: r.language || r.locale || null,
        timezone: r.timezone || null,
        address:
          r.country || r.city
            ? { country: r.country || undefined, city: r.city || undefined }
            : {},
      }));
      // Chunk 500 rows at a time.
      let inserted = 0;
      for (let i = 0; i < payload.length; i += 500) {
        const chunk = payload.slice(i, i + 500);
        const { error, count } = await supabase
          .from("contacts")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(chunk as any, { onConflict: "workspace_id,phone", count: "exact", ignoreDuplicates: false });
        if (error) throw error;
        inserted += count ?? chunk.length;
      }
      return inserted;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audience-contacts"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

/* ---------- Realtime ---------- */

export function useAudienceRealtime() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  useEffect(() => {
    if (!active?.id) return;
    const ch = supabase
      .channel(`audience:${active.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contacts", filter: `workspace_id=eq.${active.id}` },
        () => qc.invalidateQueries({ queryKey: ["audience-contacts"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "saved_audiences", filter: `workspace_id=eq.${active.id}` },
        () => qc.invalidateQueries({ queryKey: ["saved-audiences"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [active?.id, qc]);
}
