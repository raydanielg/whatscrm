import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sbAny } from "@/lib/supabase/untyped";

export type CustomFieldEntity =
  | "contact"
  | "company"
  | "lead"
  | "customer"
  | "deal"
  | "task";

export type CustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "decimal"
  | "currency"
  | "email"
  | "phone"
  | "url"
  | "date"
  | "datetime"
  | "boolean"
  | "checkbox"
  | "switch"
  | "select"
  | "multi_select"
  | "radio"
  | "file"
  | "image"
  | "relationship";

export type CustomFieldOption = { label: string; value: string };

export type CustomFieldDefinition = {
  id: string;
  workspace_id: string;
  entity_type: CustomFieldEntity;
  key: string;
  label: string;
  field_type: CustomFieldType;
  options: CustomFieldOption[];
  default_value: unknown;
  is_required: boolean;
  is_unique: boolean;
  is_visible: boolean;
  position: number;
  description: string | null;
  placeholder: string | null;
  help_text: string | null;
  validation: Record<string, unknown>;
  relationship_entity: string | null;
  section: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

export const CUSTOM_FIELD_ENTITIES: { value: CustomFieldEntity; label: string }[] = [
  { value: "contact", label: "Contacts" },
  { value: "company", label: "Companies" },
  { value: "lead", label: "Leads" },
  { value: "customer", label: "Customers" },
  { value: "deal", label: "Deals" },
  { value: "task", label: "Tasks" },
];

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "checkbox", label: "Checkbox" },
  { value: "switch", label: "Switch" },
  { value: "select", label: "Dropdown" },
  { value: "multi_select", label: "Multi Select" },
  { value: "radio", label: "Radio" },
  { value: "file", label: "File Upload" },
  { value: "image", label: "Image Upload" },
  { value: "relationship", label: "Relationship" },
];

export function useCustomFields(entity?: CustomFieldEntity) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery({
    queryKey: ["custom-fields", workspaceId, entity ?? "all"],
    enabled: !!workspaceId,
    queryFn: async (): Promise<CustomFieldDefinition[]> => {
      let q = anyFrom("custom_field_definitions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (entity) q = q.eq("entity_type", entity);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CustomFieldDefinition[];
    },
  });
}

export function useCustomFieldsRealtime() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`custom-fields-rt:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "custom_field_definitions", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["custom-fields", workspaceId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, workspaceId]);
}

export type CustomFieldInput = Partial<
  Omit<CustomFieldDefinition, "id" | "workspace_id" | "created_at" | "updated_at" | "deleted_at">
> & {
  entity_type: CustomFieldEntity;
  key: string;
  label: string;
  field_type: CustomFieldType;
};

export function useCreateCustomField() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: CustomFieldInput) => {
      if (!active?.id) throw new Error("No workspace");
      const payload = {
        workspace_id: active.id,
        options: input.options ?? [],
        validation: input.validation ?? {},
        is_required: input.is_required ?? false,
        is_unique: input.is_unique ?? false,
        is_visible: input.is_visible ?? true,
        position: input.position ?? 0,
        ...input,
      };
      const { data, error } = await anyFrom("custom_field_definitions")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as CustomFieldDefinition;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-fields"] }),
  });
}

export function useUpdateCustomField() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CustomFieldInput> }) => {
      if (!active?.id) throw new Error("No workspace");
      const changes = { ...patch };
      delete changes.entity_type;
      const { data, error } = await anyFrom("custom_field_definitions")
        .update(changes)
        .eq("id", id)
        .eq("workspace_id", active.id)
        .is("deleted_at", null)
        .select()
        .single();
      if (error) throw error;
      return data as CustomFieldDefinition;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-fields"] }),
  });
}

export function useDeleteCustomField() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!active?.id) throw new Error("No workspace");
      const { data, error } = await anyFrom("custom_field_definitions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", active.id)
        .is("deleted_at", null)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("Field not found in this workspace");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-fields"] }),
  });
}

/** Upload a file to the custom-fields bucket, path scoped to workspace. */
export async function uploadCustomFieldFile(params: {
  workspaceId: string;
  entity: CustomFieldEntity;
  fieldKey: string;
  file: File;
}): Promise<{ path: string; url: string }> {
  const ext = params.file.name.split(".").pop() ?? "bin";
  const path = `${params.workspaceId}/${params.entity}/${params.fieldKey}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("custom-fields")
    .upload(path, params.file, { upsert: false });
  if (error) throw error;
  const { data, error: urlError } = await supabase.storage
    .from("custom-fields")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (urlError || !data?.signedUrl) throw urlError ?? new Error("Could not create file access URL");
  return { path, url: data.signedUrl };
}
