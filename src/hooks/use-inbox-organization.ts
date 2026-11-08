import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeSubscription } from "@/hooks/use-realtime-subscription";
import { sbAny } from "@/lib/supabase/untyped";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase.rpc as any)(name, args);


/* --------------------------------- Labels --------------------------------- */

export type Label = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  color: string | null;
  description: string | null;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function useLabels() {
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const qc = useQueryClient();
  const q = useQuery<Label[]>({
    queryKey: ["labels", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await anyFrom("conversation_labels")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Label[];
    },
  });
  useRealtimeSubscription({
    key: workspaceId ? `labels:${workspaceId}` : null,
    bindings: [
      {
        event: "*",
        schema: "public",
        table: "conversation_labels",
        filter: workspaceId ? `workspace_id=eq.${workspaceId}` : undefined,
      },
    ],
    onChange: () => qc.invalidateQueries({ queryKey: ["labels", workspaceId] }),
  });

  return q;
}

export function useUpsertLabel() {
  const { active: workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (l: Partial<Label> & { name: string }) => {
      if (!workspace) throw new Error("No workspace");
      const payload = {
        ...l,
        workspace_id: workspace.id,
        slug: l.slug ?? slugify(l.name),
      };
      const { data, error } = l.id
        ? await anyFrom("conversation_labels").update(payload).eq("id", l.id).select().single()
        : await anyFrom("conversation_labels").insert(payload).select().single();
      if (error) throw error;
      return data as Label;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labels"] }),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("conversation_labels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labels"] }),
  });
}

/* ------------------------------ Saved filters ----------------------------- */

export type SavedFilter = {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  query: Record<string, unknown>;
  scope: "personal" | "shared";
  is_pinned: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function useSavedFilters() {
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const qc = useQueryClient();
  const q = useQuery<SavedFilter[]>({
    queryKey: ["saved_filters", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await anyFrom("saved_filters")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("is_pinned", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SavedFilter[];
    },
  });
  useRealtimeSubscription({
    key: workspaceId ? `saved_filters:${workspaceId}` : null,
    bindings: [
      {
        event: "*",
        schema: "public",
        table: "saved_filters",
        filter: workspaceId ? `workspace_id=eq.${workspaceId}` : undefined,
      },
    ],
    onChange: () =>
      qc.invalidateQueries({ queryKey: ["saved_filters", workspaceId] }),
  });

  return q;
}

export function useUpsertSavedFilter() {
  const { active: workspace } = useCurrentWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      f: Partial<SavedFilter> & { name: string; query: Record<string, unknown> },
    ) => {
      if (!workspace || !user) throw new Error("Not ready");
      const payload = {
        ...f,
        workspace_id: workspace.id,
        owner_id: f.owner_id ?? user.id,
      };
      const { data, error } = f.id
        ? await anyFrom("saved_filters").update(payload).eq("id", f.id).select().single()
        : await anyFrom("saved_filters").insert(payload).select().single();
      if (error) throw error;
      return data as SavedFilter;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved_filters"] }),
  });
}

export function useDeleteSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("saved_filters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved_filters"] }),
  });
}

/* ----------------------------- Advanced search ---------------------------- */

export type SearchKind = "conversation" | "message" | "contact" | "attachment";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  conversation_id: string | null;
  title: string | null;
  snippet: string | null;
  score: number;
  created_at: string;
  meta: Record<string, unknown>;
};

export function useAdvancedSearch(
  q: string,
  kinds: SearchKind[] = ["conversation", "message", "contact", "attachment"],
) {
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);
  return useQuery<SearchHit[]>({
    queryKey: ["inbox-search", workspaceId, debounced, kinds.slice().sort().join(",")],
    enabled: !!workspaceId && debounced.trim().length > 1,
    queryFn: async () => {
      const { data, error } = await rpc("search_inbox", {
        _workspace_id: workspaceId,
        _q: debounced,
        _kinds: kinds,
        _limit: 25,
      });
      if (error) throw error;
      return (data ?? []) as SearchHit[];
    },
  });
}

/* -------------------------------- Bulk ops -------------------------------- */

export function useBulkUpdateConversations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Record<string, unknown> }) => {
      if (ids.length === 0) return 0;
      const { data, error } = await rpc("bulk_update_conversations", { _ids: ids, _patch: patch });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
    },
  });
}

export function useBulkTagConversations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, labelIds }: { ids: string[]; labelIds: string[] }) => {
      if (ids.length === 0 || labelIds.length === 0) return 0;
      const { data, error } = await rpc("bulk_tag_conversations", {
        _ids: ids,
        _label_ids: labelIds,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

/* --------------------------------- Export --------------------------------- */

export function useExportConversations() {
  const { active: workspace } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!workspace || ids.length === 0) return null;
      const { data, error } = await anyFrom("conversations")
        .select(
          "id, subject, status, priority, channel, last_message_at, last_message_preview, assigned_to, contact:contacts(display_name, email, phone), created_at",
        )
        .in("id", ids);
      if (error) throw error;
      const rows: Record<string, unknown>[] = data ?? [];
      const headers = [
        "id",
        "subject",
        "status",
        "priority",
        "channel",
        "contact_name",
        "contact_email",
        "contact_phone",
        "last_message_at",
        "last_message_preview",
        "assigned_to",
        "created_at",
      ];
      const escape = (v: unknown) => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      };
      const csv = [
        headers.join(","),
        ...rows.map((r) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c = (r as any).contact ?? {};
          return [
            r.id,
            r.subject,
            r.status,
            r.priority,
            r.channel,
            c.display_name,
            c.email,
            c.phone,
            r.last_message_at,
            r.last_message_preview,
            r.assigned_to,
            r.created_at,
          ]
            .map(escape)
            .join(",");
        }),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conversations-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return csv;
    },
  });
}
