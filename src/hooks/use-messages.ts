import { useEffect, useMemo, useCallback, useRef } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeSubscription } from "@/hooks/use-realtime-subscription";
import { deliverOutboundMessage, retryFailedOutboundMessage } from "@/lib/inbox/outbound.functions";
import { recordMessageAttachment } from "@/lib/messaging/message-attachments";

import type { Database } from "@/integrations/supabase/types";
import { sbAny } from "@/lib/supabase/untyped";
import { useInboxSyncSettings } from "@/lib/inbox/sync-settings";

export type MessageStatus = Database["public"]["Enums"]["message_status"];
export type MessageType = Database["public"]["Enums"]["message_type"];
export type MessageDirection = Database["public"]["Enums"]["message_direction"];

export type MessageReactions = Record<string, string[]>; // emoji -> user ids
export type MessageMetadata = {
  reactions?: MessageReactions;
  location?: { lat: number; lng: number; label?: string };
  contact_card?: { name: string; phone?: string; email?: string };
  /** Buttons/list previews, or a raw WhatsApp interactive payload (e.g. Flows). */
  interactive?:
    | { type: "buttons" | "list"; title?: string; options: string[] }
    | ({ type: string } & Record<string, unknown>);
  /** Telegram-only poll attachment (message_type = "poll"). */
  poll?: { question: string; options: string[] };
  /** Calendar invite details shown alongside an outbound .ics document. */
  event?: {
    title: string;
    start: string;
    end?: string;
    location?: string;
    description?: string;
  };

  forwarded?: boolean;
  [k: string]: unknown;
};

/** @deprecated `poll` is now a regular `MessageType` value; use `MessageType` directly. */
export type ComposerMessageType = MessageType;

export type MessageRow = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  client_temp_id: string | null;
  direction: MessageDirection;
  message_type: MessageType;
  status: MessageStatus;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  media_size: number | null;
  media_duration_seconds: number | null;
  media_thumbnail_url: string | null;
  reply_to_id: string | null;
  sent_by: string | null;
  from_address: string | null;
  to_address: string | null;
  is_internal: boolean;
  metadata: MessageMetadata;
  provider_message_id: string | null;
  external_message_id?: string | null;
  failed_reason: string | null;
  delivered_at: string | null;
  read_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  reply_to?: {
    id: string;
    body: string | null;
    message_type: MessageType;
    direction: MessageDirection;
    sent_by: string | null;
  } | null;
};

const PAGE_SIZE = 40;

const sel = (s: string): string => s;

const SELECT: string = `
  id, workspace_id, conversation_id, client_temp_id, direction, message_type, status,
  body, media_url, media_type, media_size, media_duration_seconds, media_thumbnail_url,
  reply_to_id, sent_by, from_address, to_address, is_internal, metadata,
  provider_message_id, external_message_id, failed_reason, delivered_at, read_at, edited_at, deleted_at,
  created_at, updated_at,
  reply_to:reply_to_id(id, body, message_type, direction, sent_by)
`;

async function hydrateSenders(rows: MessageRow[]): Promise<MessageRow[]> {
  const ids = Array.from(new Set(rows.map((r) => r.sent_by).filter((v): v is string => !!v)));
  if (ids.length === 0) return rows;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", ids);
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    sender: r.sent_by ? ((byId.get(r.sent_by) as MessageRow["sender"]) ?? null) : null,
  }));
}

/** Historical WhatsApp replies stored only the provider context in metadata. */
async function hydrateReplyContexts(
  rows: MessageRow[], workspaceId: string, conversationId: string,
): Promise<MessageRow[]> {
  const contextId = (row: MessageRow): string | null =>
    typeof row.metadata?.context_message_id === "string" ? row.metadata.context_message_id : null;
  const targets = new Map<string, MessageRow>();
  for (const row of rows) {
    if (row.external_message_id) targets.set(row.external_message_id, row);
    if (row.provider_message_id) targets.set(row.provider_message_id, row);
  }
  const missing = [...new Set(rows
    .filter((row) => !row.reply_to)
    .map(contextId)
    .filter((id): id is string => !!id && !targets.has(id)))];
  if (missing.length) {
    const columns = "id, body, message_type, direction, sent_by, external_message_id, provider_message_id";
    const [external, provider] = await Promise.all([
      sbAny(supabase).from("messages").select(columns)
        .eq("workspace_id", workspaceId).eq("conversation_id", conversationId)
        .in("external_message_id", missing),
      sbAny(supabase).from("messages").select(columns)
        .eq("workspace_id", workspaceId).eq("conversation_id", conversationId)
        .in("provider_message_id", missing),
    ]);
    for (const row of [...(external.data ?? []), ...(provider.data ?? [])] as MessageRow[]) {
      if (row.external_message_id) targets.set(row.external_message_id, row);
      if (row.provider_message_id) targets.set(row.provider_message_id, row);
    }
  }
  return rows.map((row) => {
    if (row.reply_to) return row;
    const target = targets.get(contextId(row) ?? "");
    if (!target) return row;
    return {
      ...row,
      reply_to: {
        id: target.id,
        body: target.body,
        message_type: target.message_type,
        direction: target.direction,
        sent_by: target.sent_by,
      },
    };
  });
}

export function useMessages(conversationId: string | undefined) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const qc = useQueryClient();
  const { settings: syncSettings } = useInboxSyncSettings(workspaceId);

  const query = useInfiniteQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId && !!workspaceId,
    refetchInterval: syncSettings.refetchIntervalMs || false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialPageParam: null as string | null,
    getNextPageParam: (last: MessageRow[]) =>
      last.length < PAGE_SIZE ? undefined : last[last.length - 1]?.created_at,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("messages")
        .select(sel(SELECT))
        .eq("conversation_id", conversationId!)
        .eq("workspace_id", workspaceId!)
        // Seeded/demo messages are flagged `is_demo` and never render in a thread.
        .eq("is_demo", false)
        .order("created_at", { ascending: false })

        .limit(PAGE_SIZE);
      if (pageParam) q = q.lt("created_at", pageParam as string);
      const { data, error } = await q;
      if (error) throw error;
      const rows = await hydrateReplyContexts((data ?? []) as unknown as MessageRow[], workspaceId!, conversationId!);
      return hydrateSenders(rows);
    },
  });

  // Realtime updates for the current conversation (idempotent, shared).
  useRealtimeSubscription({
    key: conversationId && syncSettings.realtimeEnabled ? `msgs:${conversationId}` : null,
    bindings: [
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: conversationId ? `conversation_id=eq.${conversationId}` : undefined,
      },
    ],
    onChange: () => qc.invalidateQueries({ queryKey: ["messages", conversationId] }),
  });

  // Oldest -> newest
  const messages = useMemo(() => {
    const pages = query.data?.pages;
    if (!Array.isArray(pages)) return [];

    // Older deployments briefly cached the message query in a non-infinite
    // shape. Never pass that stale value into the thread renderer: retain only
    // actual page arrays and valid message rows until the refetch replaces it.
    return pages
      .filter((page): page is MessageRow[] => Array.isArray(page))
      .flat()
      .filter((message): message is MessageRow => {
        return !!message && typeof message === "object" && typeof message.id === "string";
      })
      .slice()
      .reverse();
  }, [query.data]);

  return { ...query, messages };
}

export type SendMessageInput = {
  conversationId: string;
  body?: string;
  messageType?: ComposerMessageType;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaSize?: number | null;
  mediaDurationSeconds?: number | null;
  replyToId?: string | null;
  toAddress?: string | null;
  metadata?: MessageMetadata;
};

export function useSendMessage() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: SendMessageInput) => {
      if (!active?.id || !user?.id) throw new Error("Not ready");
      const clientTempId = crypto.randomUUID();
      const { data, error } = await supabase
        .from("messages")
        .insert({
          workspace_id: active.id,
          conversation_id: input.conversationId,
          direction: "outbound" as const,
          message_type: input.messageType ?? "text",
          status: "queued" as const,
          body: input.body ?? null,
          media_url: input.mediaUrl ?? null,
          media_type: input.mediaType ?? null,
          media_size: input.mediaSize ?? null,
          media_duration_seconds: input.mediaDurationSeconds ?? null,
          reply_to_id: input.replyToId ?? null,
          to_address: input.toAddress ?? null,
          sent_by: user.id,
          client_temp_id: clientTempId,
          metadata: (input.metadata ?? {}) as never,
        })
        .select(sel(SELECT))
        .single();
      if (error) throw error;

      const messageId = (data as unknown as { id: string }).id;

      // Persist the attachment record BEFORE delivery so the file stays
      // discoverable app-wide (CRM files, search, lightbox) even if the
      // provider send fails and the message is retried later.
      const meta = (input.metadata ?? {}) as MessageMetadata;
      const mediaPath = typeof meta.media_path === "string" ? meta.media_path : null;
      if (mediaPath || input.mediaUrl) {
        try {
          await recordMessageAttachment({
            workspaceId: active.id,
            messageId,
            storagePath: mediaPath,
            url: mediaPath ? null : (input.mediaUrl ?? null),
            fileName: typeof meta.media_name === "string" ? meta.media_name : null,
            mimeType: input.mediaType ?? null,
            sizeBytes: input.mediaSize ?? null,
            durationSeconds: input.mediaDurationSeconds ?? null,
            uploadedBy: user.id,
          });
        } catch (attachErr) {
          // Never block sending on attachment bookkeeping.
          console.error("Failed to record message attachment", attachErr);
        }
      }

      // Deliver to the external channel (Messenger / Instagram / Telegram).
      // Channels without an outbound provider are acked locally server-side.
      const result = await deliverOutboundMessage({ data: { messageId } });
      if (result.status === "failed") {
        throw new Error(result.error ?? "Message could not be delivered");
      }

      return data as unknown as MessageRow;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["messages", input.conversationId] });
      const previous = qc.getQueryData<{ pages: MessageRow[][] }>([
        "messages",
        input.conversationId,
      ]);
      const optimistic: MessageRow = {
        id: `temp-${crypto.randomUUID()}`,
        workspace_id: active?.id ?? "",
        conversation_id: input.conversationId,
        client_temp_id: null,
        direction: "outbound",
        message_type: input.messageType ?? "text",
        status: "queued",
        body: input.body ?? null,
        media_url: input.mediaUrl ?? null,
        media_type: input.mediaType ?? null,
        media_size: input.mediaSize ?? null,
        media_duration_seconds: input.mediaDurationSeconds ?? null,
        media_thumbnail_url: null,
        reply_to_id: input.replyToId ?? null,
        sent_by: user?.id ?? null,
        from_address: null,
        to_address: input.toAddress ?? null,
        is_internal: false,
        metadata: input.metadata ?? {},
        provider_message_id: null,
        failed_reason: null,
        delivered_at: null,
        read_at: null,
        edited_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sender: null,
        reply_to: null,
      };
      qc.setQueryData<{ pages: MessageRow[][]; pageParams: unknown[] }>(
        ["messages", input.conversationId],
        (old) => {
          if (!old) {
            return { pages: [[optimistic]], pageParams: [null] };
          }
          const pages = [...old.pages];
          pages[0] = [optimistic, ...(pages[0] ?? [])];
          return { ...old, pages };
        },
      );
      return { previous };
    },
    onError: (_e, input, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["messages", input.conversationId], ctx.previous);
      }
    },
    onSettled: (_d, _e, input) => {
      qc.invalidateQueries({ queryKey: ["messages", input.conversationId] });
    },
  });
}

export function useEditMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; body: string; conversationId: string }) => {
      const { error } = await supabase
        .from("messages")
        .update({ body: input.body, edited_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["messages", v.conversationId] }),
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; conversationId: string }) => {
      const { error } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["messages", v.conversationId] }),
  });
}

export function useRetryMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; conversationId: string }) => {
      const result = await retryFailedOutboundMessage({ data: { messageId: input.id } });
      if (result.status === "failed") {
        throw new Error(result.error ?? "Message could not be delivered");
      }
      if (result.status === "skipped") {
        throw new Error("The message changed while retrying. Refresh the conversation before sending again.");
      }
    },
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: ["messages", v.conversationId] }),
  });
}

/**
 * Re-deliver messages stuck at `queued` — e.g. when the original send request
 * was dropped by the network after the row was already inserted.
 */
export function useResumeQueuedMessages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { resumeQueuedMessages } = await import("@/lib/inbox/outbound.functions");
      return resumeQueuedMessages({ data: { conversationId } });
    },
    onSettled: (_d, _e, conversationId) =>
      qc.invalidateQueries({ queryKey: ["messages", conversationId] }),
  });
}

export function useReactToMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      emoji: string;
      conversationId: string;
      current: MessageMetadata;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");
      const reactions: MessageReactions = { ...(input.current.reactions ?? {}) };
      const users = new Set(reactions[input.emoji] ?? []);
      const wasReacted = users.has(user.id);
      if (wasReacted) users.delete(user.id);
      else users.add(user.id);
      if (users.size === 0) delete reactions[input.emoji];
      else reactions[input.emoji] = [...users];
      const nextMeta = { ...input.current, reactions };
      const { error } = await supabase
        .from("messages")
        .update({ metadata: nextMeta as never })
        .eq("id", input.id);
      if (error) throw error;

      // The row above only updates our own copy — push the actual reaction
      // (or its removal, as an empty emoji) to WhatsApp so the customer sees
      // it too. Best-effort: the local reaction already stuck, so a failed
      // push here is logged, not surfaced as a blocking error.
      const { deliverReaction } = await import("@/lib/inbox/outbound.functions");
      deliverReaction({
        data: { messageId: input.id, emoji: wasReacted ? "" : input.emoji },
      }).catch((err) => console.warn("[react] failed to push reaction to channel:", err));
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["messages", v.conversationId] }),
  });
}

export function useForwardMessage() {
  const send = useSendMessage();
  return useCallback(
    async (source: MessageRow, targetConversationId: string) => {
      await send.mutateAsync({
        conversationId: targetConversationId,
        body: source.body ?? undefined,
        messageType: source.message_type,
        mediaUrl: source.media_url,
        mediaType: source.media_type,
        mediaSize: source.media_size,
        mediaDurationSeconds: source.media_duration_seconds,
        metadata: { ...source.metadata, forwarded: true },
      });
    },
    [send],
  );
}

/** Upload a file to `attachments` bucket, return signed URL + storage path. */
export async function uploadAttachment(
  workspaceId: string,
  conversationId: string,
  file: File | Blob,
  filename?: string,
): Promise<{ url: string; size: number; type: string; path: string }> {
  // Validate & build a key that matches the bucket RLS path format
  // (`<workspaceId>/<conversationId>/<filename>`) before any network call,
  // so bad ids fail fast with a clear error instead of an RLS violation.
  const { buildAttachmentKey } = await import("@/lib/messaging/attachment-key");
  const key = buildAttachmentKey({ workspaceId, conversationId, filename });
  const { error } = await supabase.storage.from("attachments").upload(key, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: (file as File).type || undefined,
  });
  if (error) throw error;
  const { data: signed, error: signErr } = await supabase.storage
    .from("attachments")
    .createSignedUrl(key, 60 * 60 * 24 * 7);
  if (signErr) throw signErr;
  return {
    url: signed.signedUrl,
    size: (file as File).size ?? 0,
    type: (file as File).type ?? "application/octet-stream",
    path: key,
  };
}

/**
 * Broadcast that the current user is typing in a conversation.
 *
 * Throttled to one write per 2s (the row has a 6s TTL) so a fast typist does
 * not fire a database upsert per keystroke. The returned function exposes
 * `.stop()` to clear the indicator immediately on send/blur/unmount.
 */
export function useBroadcastTyping(conversationId: string | undefined) {
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const lastSentRef = useRef(0);
  const workspaceId = active?.id;
  const userId = user?.id;

  const stop = useCallback(async () => {
    if (!conversationId || !userId) return;
    lastSentRef.current = 0;
    await supabase
      .from("conversation_typing")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
  }, [conversationId, userId]);

  const broadcast = useMemo(() => {
    const fn = async () => {
      if (!conversationId || !workspaceId || !userId) return;
      const now = Date.now();
      if (now - lastSentRef.current < 2000) return;
      lastSentRef.current = now;
      await sbAny(supabase)
        .from("conversation_typing")
        .upsert(
          {
            conversation_id: conversationId,
            workspace_id: workspaceId,
            user_id: userId,
            started_at: new Date(now).toISOString(),
            expires_at: new Date(now + 6000).toISOString(),
          },
          { onConflict: "conversation_id,user_id" },
        );
    };
    return Object.assign(fn, { stop });
  }, [conversationId, workspaceId, userId, stop]);

  // Clear a lingering indicator when leaving the thread.
  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return broadcast;
}
