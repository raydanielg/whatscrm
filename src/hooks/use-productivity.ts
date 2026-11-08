import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

export type MessageTemplate = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  shortcut: string | null;
  body: string;
  category: string | null;
  language: string | null;
  is_shared: boolean;
  is_favorite: boolean;
  usage_count: number;
  last_used_at: string | null;
  variables: unknown[];
  attachments: unknown[];
  created_at: string;
  updated_at: string;
};

export type MessageDraft = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  user_id: string;
  body: string;
  metadata: Record<string, unknown>;
  updated_at: string;
  created_at: string;
};

export type ScheduledMessage = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  created_by: string | null;
  body: string;
  message_type: string;
  scheduled_for: string;
  status: "pending" | "sent" | "cancelled" | "failed";
  attachments: unknown[];
  metadata: Record<string, unknown>;
  sent_at: string | null;
  sent_message_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

/* -------------------------------------------------------------------------- */
/*                                  Templates                                 */
/* -------------------------------------------------------------------------- */

export function useMessageTemplates(search?: string) {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  const workspaceId = active?.id;

  const query = useQuery({
    queryKey: ["message-templates", workspaceId, search ?? ""],
    enabled: !!workspaceId,
    queryFn: async (): Promise<MessageTemplate[]> => {
      let q = anyFrom("message_templates")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("is_favorite", { ascending: false })
        .order("usage_count", { ascending: false })
        .order("updated_at", { ascending: false });
      if (search && search.trim().length > 0) {
        const term = `%${sanitizeSearchTerm(search.trim())}%`;
        q = q.or(`name.ilike.${term},body.ilike.${term},shortcut.ilike.${term}`);
      }
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return (data ?? []) as MessageTemplate[];
    },
  });

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`message-templates:${workspaceId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_templates", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["message-templates", workspaceId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [workspaceId, qc]);

  return query;
}

export function useRecentTemplates(limit = 6) {
  const { data, ...rest } = useMessageTemplates();
  const recent = useMemo(() => {
    return (data ?? [])
      .filter((t) => t.last_used_at)
      .sort((a, b) => (b.last_used_at ?? "").localeCompare(a.last_used_at ?? ""))
      .slice(0, limit);
  }, [data, limit]);
  return { data: recent, ...rest };
}

export function useFavoriteTemplates() {
  const { data, ...rest } = useMessageTemplates();
  const favorites = useMemo(() => (data ?? []).filter((t) => t.is_favorite), [data]);
  return { data: favorites, ...rest };
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      body: string;
      shortcut?: string | null;
      category?: string | null;
      is_shared?: boolean;
      is_favorite?: boolean;
    }) => {
      if (!active?.id || !user?.id) throw new Error("Missing context");
      const { error, data } = await anyFrom("message_templates")
        .insert({
          workspace_id: active.id,
          created_by: user.id,
          name: input.name,
          body: input.body,
          shortcut: input.shortcut?.trim() || null,
          category: input.category ?? null,
          is_shared: input.is_shared ?? true,
          is_favorite: input.is_favorite ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as MessageTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["message-templates"] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<MessageTemplate> & { id: string }) => {
      const { id, ...patch } = input;
      const { error } = await anyFrom("message_templates").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["message-templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("message_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["message-templates"] }),
  });
}

export function useRegisterTemplateUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: MessageTemplate) => {
      const { error } = await anyFrom("message_templates")
        .update({
          usage_count: (template.usage_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["message-templates"] }),
  });
}

/**
 * Render a template body, replacing {{variables}} with values from context.
 */
export function renderTemplate(body: string, ctx: Record<string, string | undefined | null>) {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, key) => {
    const v = ctx[key];
    return v == null ? `{{${key}}}` : String(v);
  });
}

/* -------------------------------------------------------------------------- */
/*                                   Drafts                                   */
/* -------------------------------------------------------------------------- */

export function useMessageDraft(conversationId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["message-draft", conversationId, user?.id],
    enabled: !!conversationId && !!user?.id,
    queryFn: async (): Promise<MessageDraft | null> => {
      const { data, error } = await anyFrom("message_drafts")
        .select("*")
        .eq("conversation_id", conversationId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MessageDraft | null;
    },
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["message-draft", conversationId, user?.id] });

  return { ...query, refresh };
}

export function useSaveDraft() {
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversation_id: string; body: string }) => {
      if (!active?.id || !user?.id) throw new Error("Missing context");
      if (!input.body.trim()) {
        const { error } = await anyFrom("message_drafts")
          .delete()
          .eq("conversation_id", input.conversation_id)
          .eq("user_id", user.id);
        if (error) throw error;
        return null;
      }
      const { error } = await anyFrom("message_drafts").upsert(
        {
          workspace_id: active.id,
          conversation_id: input.conversation_id,
          user_id: user.id,
          body: input.body,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["message-draft", vars.conversation_id, user?.id] });
      qc.invalidateQueries({ queryKey: ["my-drafts", user?.id] });
    },
  });
}

export function useMyDrafts() {
  const { user } = useAuth();
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["my-drafts", user?.id, active?.id],
    enabled: !!user?.id && !!active?.id,
    queryFn: async (): Promise<MessageDraft[]> => {
      const { data, error } = await anyFrom("message_drafts")
        .select("*")
        .eq("user_id", user!.id)
        .eq("workspace_id", active!.id)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as MessageDraft[];
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                             Scheduled Messages                             */
/* -------------------------------------------------------------------------- */

export function useScheduledMessages(conversationId?: string) {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  const workspaceId = active?.id;

  const query = useQuery({
    queryKey: ["scheduled-messages", workspaceId, conversationId ?? "all"],
    enabled: !!workspaceId,
    queryFn: async (): Promise<ScheduledMessage[]> => {
      let q = anyFrom("scheduled_messages")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .eq("status", "pending")
        .order("scheduled_for", { ascending: true });
      if (conversationId) q = q.eq("conversation_id", conversationId);
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return (data ?? []) as ScheduledMessage[];
    },
  });

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`scheduled-messages:${workspaceId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scheduled_messages", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["scheduled-messages", workspaceId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [workspaceId, qc]);

  return query;
}

export function useScheduleMessage() {
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      conversation_id: string;
      body: string;
      message_type?: string;
      scheduled_for: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!active?.id || !user?.id) throw new Error("Missing context");
      const { error } = await anyFrom("scheduled_messages").insert({
        workspace_id: active.id,
        conversation_id: input.conversation_id,
        created_by: user.id,
        body: input.body,
        message_type: input.message_type ?? "text",
        scheduled_for: input.scheduled_for,
        metadata: input.metadata ?? {},
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-messages"] }),
  });
}

export function useCancelScheduledMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("scheduled_messages")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-messages"] }),
  });
}
