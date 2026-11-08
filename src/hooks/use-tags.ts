import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sbAny } from "@/lib/supabase/untyped";

export type TagEntity =
  | "contact"
  | "company"
  | "lead"
  | "customer"
  | "deal"
  | "task";

export const TAG_ENTITIES: { value: TagEntity; label: string }[] = [
  { value: "contact", label: "Contacts" },
  { value: "company", label: "Companies" },
  { value: "lead", label: "Leads" },
  { value: "customer", label: "Customers" },
  { value: "deal", label: "Deals" },
  { value: "task", label: "Tasks" },
];

export type SegmentRuleOp =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "has_tag"
  | "is_true"
  | "is_false"
  | "is_empty"
  | "is_not_empty";

export type SegmentCondition = {
  field: string;
  op: SegmentRuleOp;
  value?: unknown;
};

export type SegmentRules = {
  operator: "AND" | "OR";
  conditions: SegmentCondition[];
  entity_type?: TagEntity;
};

export type TagRow = {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  description: string | null;
  parent_id: string | null;
  is_favorite: boolean;
  is_smart: boolean;
  is_ai_generated: boolean;
  rules: SegmentRules;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TagAssignmentRow = {
  id: string;
  workspace_id: string;
  tag_id: string;
  entity_type: TagEntity;
  entity_id: string;
  created_at: string;
};

export type SegmentRow = {
  id: string;
  workspace_id: string;
  entity_type: TagEntity;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  rules: SegmentRules;
  is_favorite: boolean;
  is_shared: boolean;
  is_dynamic: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

/* --------------------------------- Tags ---------------------------------- */

export function useTags() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery({
    queryKey: ["crm-tags", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<TagRow[]> => {
      const { data, error } = await anyFrom("crm_tags")
        .select("*")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as TagRow[];
    },
  });
}

export function useTagsRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("crm-tags-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_tags" }, () =>
        qc.invalidateQueries({ queryKey: ["crm-tags"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_tag_assignments" },
        () => qc.invalidateQueries({ queryKey: ["crm-tag-assignments"] })
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_segments" }, () =>
        qc.invalidateQueries({ queryKey: ["crm-segments"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

export type TagInput = Partial<
  Omit<TagRow, "id" | "workspace_id" | "created_at" | "updated_at" | "deleted_at">
> & { name: string };

export function useCreateTag() {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TagInput) => {
      if (!active?.id) throw new Error("No workspace");
      const { data, error } = await anyFrom("crm_tags")
        .insert({ workspace_id: active.id, ...input })
        .select()
        .single();
      if (error) throw error;
      return data as TagRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-tags"] }),
  });
}

export function useUpdateTag() {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TagInput> }) => {
      if (!active?.id) throw new Error("No workspace");
      const { data, error } = await anyFrom("crm_tags")
        .update(patch)
        .eq("id", id)
        .eq("workspace_id", active.id)
        .select()
        .single();
      if (error) throw error;
      return data as TagRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-tags"] }),
  });
}

export function useDeleteTag() {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!active?.id) throw new Error("No workspace");
      const { error } = await anyFrom("crm_tags")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", active.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-tags"] });
      qc.invalidateQueries({ queryKey: ["crm-tag-assignments"] });
    },
  });
}

/* ------------------------------ Assignments ------------------------------ */

export function useEntityTags(entityType: TagEntity, entityId?: string) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["crm-tag-assignments", active?.id, entityType, entityId],
    enabled: !!active?.id && !!entityId,
    queryFn: async (): Promise<TagAssignmentRow[]> => {
      const { data, error } = await anyFrom("crm_tag_assignments")
        .select("*")
        .eq("workspace_id", active!.id)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId!);
      if (error) throw error;
      return (data || []) as TagAssignmentRow[];
    },
  });
}

export function useAssignmentsForEntities(entityType: TagEntity, entityIds: string[]) {
  const { active } = useCurrentWorkspace();
  const key = useMemo(() => [...entityIds].sort().join(","), [entityIds]);
  return useQuery({
    queryKey: ["crm-tag-assignments", active?.id, entityType, "bulk", key],
    enabled: !!active?.id && entityIds.length > 0,
    queryFn: async (): Promise<TagAssignmentRow[]> => {
      const { data, error } = await anyFrom("crm_tag_assignments")
        .select("*")
        .eq("workspace_id", active!.id)
        .eq("entity_type", entityType)
        .in("entity_id", entityIds);
      if (error) throw error;
      return (data || []) as TagAssignmentRow[];
    },
  });
}

export function useAssignTag() {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { tagId: string; entityType: TagEntity; entityId: string }) => {
      if (!active?.id) throw new Error("No workspace");
      const { error } = await anyFrom("crm_tag_assignments").insert({
        workspace_id: active.id,
        tag_id: params.tagId,
        entity_type: params.entityType,
        entity_id: params.entityId,
      });
      if (error && !String(error.message).includes("duplicate")) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-tag-assignments"] }),
  });
}

export function useUnassignTag() {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { tagId: string; entityType: TagEntity; entityId: string }) => {
      if (!active?.id) throw new Error("No workspace");
      const { error } = await anyFrom("crm_tag_assignments")
        .delete()
        .eq("workspace_id", active.id)
        .eq("tag_id", params.tagId)
        .eq("entity_type", params.entityType)
        .eq("entity_id", params.entityId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-tag-assignments"] }),
  });
}

export function useBulkAssignTag() {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      tagId: string;
      entityType: TagEntity;
      entityIds: string[];
    }) => {
      if (!active?.id) throw new Error("No workspace");
      const rows = params.entityIds.map((id) => ({
        workspace_id: active.id,
        tag_id: params.tagId,
        entity_type: params.entityType,
        entity_id: id,
      }));
      const { error } = await anyFrom("crm_tag_assignments").upsert(rows, {
        onConflict: "tag_id,entity_type,entity_id",
        ignoreDuplicates: true,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-tag-assignments"] }),
  });
}

/* ------------------------------- Segments -------------------------------- */

export function useSegments(entityType?: TagEntity) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["crm-segments", active?.id, entityType ?? "all"],
    enabled: !!active?.id,
    queryFn: async (): Promise<SegmentRow[]> => {
      let q = anyFrom("crm_segments")
        .select("*")
        .eq("workspace_id", active!.id)
        .is("deleted_at", null)
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (entityType) q = q.eq("entity_type", entityType);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as SegmentRow[];
    },
  });
}

export type SegmentInput = Partial<
  Omit<SegmentRow, "id" | "workspace_id" | "created_at" | "updated_at" | "deleted_at">
> & { name: string; entity_type: TagEntity };

export function useCreateSegment() {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SegmentInput) => {
      if (!active?.id) throw new Error("No workspace");
      const { data, error } = await anyFrom("crm_segments")
        .insert({ workspace_id: active.id, ...input })
        .select()
        .single();
      if (error) throw error;
      return data as SegmentRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-segments"] }),
  });
}

export function useUpdateSegment() {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SegmentInput> }) => {
      if (!active?.id) throw new Error("No workspace");
      const { data, error } = await anyFrom("crm_segments")
        .update(patch)
        .eq("id", id)
        .eq("workspace_id", active.id)
        .select()
        .single();
      if (error) throw error;
      return data as SegmentRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-segments"] }),
  });
}

export function useDeleteSegment() {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!active?.id) throw new Error("No workspace");
      const { error } = await anyFrom("crm_segments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", active.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-segments"] }),
  });
}

/* --------------------------- Rule evaluation ----------------------------- */

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), obj);
}

export function matchesRules(entity: any, rules: SegmentRules, tagIds: string[] = []): boolean {
  if (!rules?.conditions?.length) return true;
  const op = rules.operator ?? "AND";
  const results = rules.conditions.map((c) => matchCondition(entity, c, tagIds));
  return op === "AND" ? results.every(Boolean) : results.some(Boolean);
}

function matchCondition(entity: any, c: SegmentCondition, tagIds: string[]): boolean {
  const v = c.field === "tags" ? tagIds : get(entity, c.field);
  switch (c.op) {
    case "eq":
      return v === c.value;
    case "neq":
      return v !== c.value;
    case "contains":
      return typeof v === "string" && v.toLowerCase().includes(String(c.value ?? "").toLowerCase());
    case "not_contains":
      return typeof v === "string" && !v.toLowerCase().includes(String(c.value ?? "").toLowerCase());
    case "starts_with":
      return typeof v === "string" && v.toLowerCase().startsWith(String(c.value ?? "").toLowerCase());
    case "gt":
      return typeof v === "number" && v > Number(c.value);
    case "gte":
      return typeof v === "number" && v >= Number(c.value);
    case "lt":
      return typeof v === "number" && v < Number(c.value);
    case "lte":
      return typeof v === "number" && v <= Number(c.value);
    case "in":
      return Array.isArray(c.value) && (c.value as unknown[]).includes(v as never);
    case "has_tag":
      return Array.isArray(tagIds) && tagIds.includes(String(c.value));
    case "is_true":
      return Boolean(v) === true;
    case "is_false":
      return Boolean(v) === false;
    case "is_empty":
      return v == null || v === "" || (Array.isArray(v) && v.length === 0);
    case "is_not_empty":
      return !(v == null || v === "" || (Array.isArray(v) && v.length === 0));
    default:
      return false;
  }
}

/* ------------------------------- Analytics ------------------------------- */

export function useTagAnalytics() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["crm-tag-analytics", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const [{ data: tags }, { data: assigns }] = await Promise.all([
        anyFrom("crm_tags")
          .select("id,name,color,is_favorite,is_smart,is_ai_generated")
          .eq("workspace_id", active!.id)
          .is("deleted_at", null),
        anyFrom("crm_tag_assignments")
          .select("tag_id,entity_type")
          .eq("workspace_id", active!.id),
      ]);
      const counts = new Map<string, Record<string, number>>();
      for (const a of (assigns || []) as { tag_id: string; entity_type: string }[]) {
        const rec = counts.get(a.tag_id) ?? {};
        rec[a.entity_type] = (rec[a.entity_type] ?? 0) + 1;
        rec.total = (rec.total ?? 0) + 1;
        counts.set(a.tag_id, rec);
      }
      return ((tags || []) as any[]).map((t) => ({
        ...t,
        counts: counts.get(t.id) ?? { total: 0 },
      }));
    },
  });
}
