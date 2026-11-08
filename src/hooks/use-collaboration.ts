import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentWorkspace, useWorkspaceMembers, type WorkspaceMemberRow } from "@/hooks/use-workspace";
import { sbAny } from "@/lib/supabase/untyped";

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

export type ConversationNote = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  author_id: string | null;
  body: string;
  mentions: string[];
  is_pinned: boolean;
  pinned_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type ConversationParticipant = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  user_id: string | null;
  contact_id: string | null;
  role: string; // agent | follower | watcher | owner
  is_muted: boolean;
  joined_at: string;
  last_read_at: string | null;
  last_typed_at: string | null;
  left_at: string | null;
};

export type ConversationActivityRow = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  actor_id: string | null;
  activity_type: string;
  data: Record<string, unknown>;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

/* -------------------------------------------------------------------------- */
/*                             Internal / Team Notes                          */
/* -------------------------------------------------------------------------- */

export function useConversationNotes(conversationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["conversation-notes", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<ConversationNote[]> => {
      const { data, error } = await anyFrom("conversation_notes")
        .select("*")
        .eq("conversation_id", conversationId!)
        .is("deleted_at", null)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as ConversationNote[];
      const authorIds = Array.from(
        new Set(rows.map((r) => r.author_id).filter(Boolean) as string[]),
      );
      if (authorIds.length === 0) return rows;
      const { data: profiles } = await anyFrom("profiles")
        .select("id, display_name, avatar_url")
        .in("id", authorIds);
      type Author = { id: string; display_name: string | null; avatar_url: string | null };
      const byId = new Map<string, Author>(
        ((profiles ?? []) as Author[]).map((p) => [p.id, p]),
      );
      return rows.map((r) => ({ ...r, author: r.author_id ? byId.get(r.author_id) ?? null : null }));
    },
  });

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`conv-notes:${conversationId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_notes", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["conversation-notes", conversationId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, qc]);

  return query;
}

export function useCreateNote(conversationId: string | undefined, workspaceId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { body: string; mentions?: string[]; is_pinned?: boolean }) => {
      if (!conversationId || !workspaceId) throw new Error("Missing conversation/workspace");
      const { error } = await anyFrom("conversation_notes").insert({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        author_id: user?.id ?? null,
        body: input.body,
        mentions: input.mentions ?? [],
        is_pinned: input.is_pinned ?? false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation-notes", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversation-activity", conversationId] });
    },
  });
}

export function useUpdateNote(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; body?: string; is_pinned?: boolean; mentions?: string[] }) => {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.body !== undefined) {
        patch.body = input.body;
        patch.edited_at = new Date().toISOString();
      }
      if (input.is_pinned !== undefined) patch.is_pinned = input.is_pinned;
      if (input.mentions !== undefined) patch.mentions = input.mentions;
      const { error } = await anyFrom("conversation_notes").update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation-notes", conversationId] }),
  });
}

export function useDeleteNote(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("conversation_notes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation-notes", conversationId] }),
  });
}

/* -------------------------------------------------------------------------- */
/*                         Participants / Followers / Watchers                */
/* -------------------------------------------------------------------------- */

export function useConversationParticipants(conversationId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["conversation-participants", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<ConversationParticipant[]> => {
      const { data, error } = await anyFrom("conversation_participants")
        .select("*")
        .eq("conversation_id", conversationId!)
        .is("left_at", null);
      if (error) throw error;
      return (data ?? []) as ConversationParticipant[];
    },
  });

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`conv-participants:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_participants", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["conversation-participants", conversationId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, qc]);

  return query;
}

export function useAddParticipant(conversationId: string | undefined, workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { user_id: string; role?: "follower" | "watcher" | "agent" }) => {
      if (!conversationId || !workspaceId) throw new Error("Missing context");
      const { error } = await anyFrom("conversation_participants").insert({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        user_id: input.user_id,
        role: input.role ?? "follower",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation-participants", conversationId] }),
  });
}

export function useRemoveParticipant(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("conversation_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation-participants", conversationId] }),
  });
}

/* -------------------------------------------------------------------------- */
/*                       Assignment / Reassign / Transfer                     */
/* -------------------------------------------------------------------------- */

/**
 * Assign / reassign / clear-assignment. Uses the `assign_conversation` RPC
 * so business logic (permission checks, SLA start via trigger, etc.) stays
 * in one place. When a `reason` is supplied on reassignment, an extra
 * `reassignment_note` activity row is inserted for auditability.
 */
export function useAssignConversation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      conversation_id: string;
      assigned_to: string | null;
      reason?: string;
    }) => {
      const { error } = await sbAny(supabase).rpc("assign_conversation", {
        _conversation_id: input.conversation_id,
        _assignee: (input.assigned_to ?? null) as unknown as string,
      });
      if (error) throw error;
      if (input.reason && input.assigned_to) {
        await anyFrom("conversation_activity").insert({
          conversation_id: input.conversation_id,
          activity_type: "reassignment_note",
          actor_id: user?.id ?? null,
          data: { reason: input.reason, to: input.assigned_to },
        });
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation-activity", vars.conversation_id] });
    },
  });
}


/* -------------------------------------------------------------------------- */
/*                            Activity / Timeline                             */
/* -------------------------------------------------------------------------- */

export function useConversationActivity(conversationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["conversation-activity", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<ConversationActivityRow[]> => {
      const { data, error } = await anyFrom("conversation_activity")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ConversationActivityRow[];
    },
  });

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`conv-activity:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_activity", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["conversation-activity", conversationId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, qc]);

  return query;
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

export function useTeamDirectory(): { members: WorkspaceMemberRow[]; byId: Map<string, WorkspaceMemberRow> } {
  const { active } = useCurrentWorkspace();
  const q = useWorkspaceMembers(active?.id);
  const members = q.data ?? [];
  const byId = new Map(members.map((m) => [m.user_id, m]));
  return { members, byId };
}
