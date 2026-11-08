import { useEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeSubscription } from "@/hooks/use-realtime-subscription";
import { providerToChannelOrNull } from "@/lib/inbox/channel-capabilities";
import { liveChatBotId, liveChatAccountId } from "@/hooks/use-livechat-accounts";
import {
  externalAccountKeyForConversation,
  parseExternalAccountId,
} from "@/lib/inbox/external-account-ids";
import { mergeConversationPages } from "@/lib/inbox/conversation-merge";
import { useInboxSyncSettings } from "@/lib/inbox/sync-settings";
import { backgroundSyncQueryOptions, useBackgroundSyncNotice } from "@/lib/inbox/background-sync";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";
import {
  clearManualUnreadHold,
  holdManualUnread,
  isManualUnreadHeld,
  trackReadWrite,
  waitForReadWrites,
} from "@/lib/inbox/manual-unread";

/**
 * Debug flag for conversation counts. Enable at runtime with:
 *   localStorage.setItem("debug:counts", "1")
 * or via env: VITE_DEBUG_COUNTS=1
 * Disable: localStorage.removeItem("debug:counts")
 */
function isCountsDebugEnabled(): boolean {
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem("debug:counts")) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (import.meta.env?.VITE_DEBUG_COUNTS === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

function useCountsDebugLogger(
  q: { dataUpdatedAt: number; isFetching: boolean; status: string; data: unknown },
  workspaceId: string | undefined,
  inboxId: string | null | undefined,
) {
  const lastUpdatedAt = useRef(0);
  const lastFetching = useRef(false);
  useEffect(() => {
    if (!isCountsDebugEnabled()) return;
    if (q.isFetching && !lastFetching.current) {
      // eslint-disable-next-line no-console
      console.log("[counts] invalidated → fetching", {
        workspaceId,
        inboxId,
        status: q.status,
      });
    }
    lastFetching.current = q.isFetching;
    if (q.dataUpdatedAt && q.dataUpdatedAt !== lastUpdatedAt.current) {
      lastUpdatedAt.current = q.dataUpdatedAt;
      // eslint-disable-next-line no-console
      console.log("[counts] data updated", {
        workspaceId,
        inboxId,
        at: new Date(q.dataUpdatedAt).toISOString(),
        data: q.data,
      });
    }
  }, [q.isFetching, q.dataUpdatedAt, q.status, q.data, workspaceId, inboxId]);
}

export type ConversationStatus = "open" | "pending" | "resolved" | "snoozed";

export type ConversationPriority = "low" | "normal" | "high" | "urgent";

export type InboxChannel =
  | "whatsapp"
  | "email"
  | "sms"
  | "webchat"
  | "instagram"
  | "messenger"
  | "telegram"
  | "facebook"
  | "youtube"
  | "linkedin"
  | "tiktok"
  | "voice"
  | "other";

export type ConversationFilter =
  | "all"
  | "unread"
  | "mine"
  | "unassigned"
  | "open"
  | "pending"
  | "resolved"
  | "archived"
  | "snoozed"
  | "starred";

export type ConversationSort = "recent" | "oldest" | "priority" | "unread";

type ConversationCountBuckets = {
  all: number;
  unread: number;
  mine: number;
  unassigned: number;
  open: number;
  pending: number;
  resolved: number;
  archived: number;
};

export type ConversationCounts = ConversationCountBuckets & {
  /** Unread-only badge counts for inbox navigation buckets. */
  badges: ConversationCountBuckets;
};

export type ConversationRow = {
  id: string;
  workspace_id: string;
  inbox_id: string | null;
  contact_id: string;
  channel: InboxChannel;
  channel_account_id?: string | null;
  status: ConversationStatus;
  priority: ConversationPriority;
  subject: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_from: string | null;
  unread_count: number;
  assigned_to: string | null;
  assigned_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  snoozed_until: string | null;
  is_archived: boolean;
  metadata: Record<string, unknown>;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  contact?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    phone: string | null;
    email: string | null;
    avatar_url: string | null;
    last_seen_at: string | null;
  } | null;
  labels?: Array<{ id: string; name: string; color: string | null }>;
  assignee?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

// Erase select-string literal types to keep tsc fast.
const sel = (s: string): string => s;

const PAGE_SIZE = 30;

type ListParams = {
  filter: ConversationFilter;
  inboxId?: string | null;
  search?: string;
  sort?: ConversationSort;
  labelIds?: string[];
  channels?: InboxChannel[];
  priority?: ConversationPriority[];
  /** Narrow to one connected account (`conversations.channel_account_id`). */
  accountId?: string | null;
};

/**
 * Single source of truth for "which conversations exist in this Inbox".
 *
 * Both the conversation list and the unread badge query MUST apply exactly
 * these base filters, otherwise badges can count rows the list never shows
 * (or vice versa) after a channel switch.
 */
export function applyInboxScope<T>(
  q: T,
  opts: { workspaceId: string; inboxId?: string | null },
): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (q as any)
    .eq("workspace_id", opts.workspaceId)
    .is("deleted_at", null)
    // Seeded/demo rows are flagged `is_demo` and must never reach the Inbox.
    .eq("is_demo", false);
  if (opts.inboxId) query = query.eq("inbox_id", opts.inboxId);
  return query as T;
}

/** Infinite conversation list, workspace + inbox scoped. */

export function useConversations(params: ListParams) {
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const workspaceId = active?.id;
  const userId = user?.id;
  const qc = useQueryClient();
  const { settings: syncSettings } = useInboxSyncSettings(workspaceId);

  const useKeyset = !params.sort || params.sort === "recent" || params.sort === "oldest";
  const ascending = params.sort === "oldest";

  type PageParam =
    | { kind: "initial" }
    | { kind: "keyset"; lma: string | null; id: string }
    | { kind: "offset"; offset: number };

  const query = useInfiniteQuery({
    queryKey: ["conversations", workspaceId, params],
    enabled: !!workspaceId,
    initialPageParam: { kind: "initial" } as PageParam,
    getNextPageParam: (last: ConversationRow[], all, lastParam) => {
      if (last.length < PAGE_SIZE) return undefined;
      if (useKeyset) {
        const tail = last[last.length - 1];
        if (!tail) return undefined;
        return { kind: "keyset", lma: tail.last_message_at, id: tail.id } as PageParam;
      }
      const prev = (lastParam as PageParam) ?? { kind: "initial" };
      const prevOffset = prev.kind === "offset" ? prev.offset : 0;
      return { kind: "offset", offset: prevOffset + PAGE_SIZE } as PageParam;
    },
    queryFn: async ({ pageParam }) => {
      const param = (pageParam as PageParam) ?? { kind: "initial" };

      let q = supabase.from("conversations").select(
        sel(`id, workspace_id, inbox_id, contact_id, channel, channel_account_id, status, priority,
           subject, last_message_at, last_message_preview, last_message_from,
           unread_count, assigned_to, assigned_at, first_response_at,
           resolved_at, snoozed_until, is_archived, metadata, ai_summary,
           created_at, updated_at,
           contact:contacts!conversations_contact_id_fkey(id, name, first_name, last_name, display_name, phone, email, avatar_url, last_seen_at),
           assignee:profiles!conversations_assigned_to_profiles_fkey(id, display_name, avatar_url),
           label_assignments:conversation_label_assignments(label:conversation_labels(id, name, color))`),
      );
      q = applyInboxScope(q, { workspaceId: workspaceId!, inboxId: params.inboxId });

      // Filters
      switch (params.filter) {
        case "unread":
          q = q.gt("unread_count", 0).eq("is_archived", false);
          break;
        case "mine":
          if (userId) q = q.eq("assigned_to", userId);
          q = q.eq("is_archived", false);
          break;
        case "unassigned":
          q = q.is("assigned_to", null).eq("is_archived", false);
          break;
        case "open":
        case "pending":
        case "resolved":
        case "snoozed":
          q = q.eq("status", params.filter).eq("is_archived", false);
          break;
        case "archived":
          q = q.eq("is_archived", true);
          break;
        case "starred":
          q = q.eq("metadata->>starred", "true").eq("is_archived", false);
          break;
        case "all":
        default:
          q = q.eq("is_archived", false);
      }

      if (params.channels && params.channels.length > 0) {
        q = q.in("channel", params.channels);
      }
      if (params.accountId) {
        // Live Chat accounts are chatbots, not `channel_accounts` rows.
        const botId = liveChatBotId(params.accountId);
        // Telegram/Messenger/Instagram accounts live in provider tables and are
        // linked through `metadata.account_id` (the FK on channel_account_id
        // only accepts `channel_accounts` rows).
        const external = parseExternalAccountId(params.accountId);
        if (botId) q = q.eq("metadata->>chatbot_id", botId);
        else if (external) {
          q = q.eq("channel", external.channel).eq("metadata->>account_id", external.rowId);
        } else q = q.eq("channel_account_id", params.accountId);
      }

      if (params.priority && params.priority.length > 0) {
        q = q.in("priority", params.priority);
      }

      if (params.search && params.search.trim().length > 0) {
        // Unified search: conversation subject/preview + contact identity
        // (name, phone, email) + message body text, scoped to the same
        // workspace and to the channels currently selected in the UI.
        // PostgREST `or()` is a flat string, so commas/parens/asterisks in the
        // raw term must be stripped before interpolation.
        const term = params.search
          .trim()
          .replace(/[,()*"\\]/g, " ")
          .trim();
        if (term.length > 0) {
          const like = `%${sanitizeSearchTerm(term)}%`;
          const digits = term.replace(/[^\d]/g, "");

          // 1) Contacts whose name / phone / email matches.
          const contactQ = supabase
            .from("contacts")
            .select(sel("id"))
            .eq("workspace_id", workspaceId!)
            .or(
              [
                `display_name.ilike.${like}`,
                `first_name.ilike.${like}`,
                `last_name.ilike.${like}`,
                `email.ilike.${like}`,
                `phone.ilike.${like}`,
                ...(digits.length >= 3 ? [`phone.ilike.%${sanitizeSearchTerm(digits)}%`] : []),
              ].join(","),
            )
            .limit(500);
          // 2) Conversations containing a message whose body matches.
          const messageQ = supabase
            .from("messages")
            .select(sel("conversation_id"))
            .eq("workspace_id", workspaceId!)
            .eq("is_demo", false)
            .ilike("body", like)
            .limit(500);

          const [contactRes, messageRes] = await Promise.all([contactQ, messageQ]);

          const contactIds = Array.from(
            new Set(((contactRes.data ?? []) as unknown as Array<{ id: string }>).map((r) => r.id)),
          );
          const convIds = Array.from(
            new Set(
              ((messageRes.data ?? []) as unknown as Array<{ conversation_id: string | null }>)
                .map((r) => r.conversation_id)
                .filter((v): v is string => !!v),
            ),
          );

          const clauses = [`subject.ilike.${like}`, `last_message_preview.ilike.${like}`];
          if (contactIds.length > 0) clauses.push(`contact_id.in.(${contactIds.join(",")})`);
          if (convIds.length > 0) clauses.push(`id.in.(${convIds.join(",")})`);

          q = q.or(clauses.join(","));
        }
      }

      // Conversations without `last_message_at` (freshly created, imported, or
      // channel rows whose first inbound message has not landed yet) must still
      // appear on the first page — only keyset pagination needs a non-null
      // cursor column, so the null filter is scoped to keyset follow-up pages.
      switch (params.sort) {
        case "oldest":
          q = q
            .order("last_message_at", { ascending: true, nullsFirst: false })
            .order("id", { ascending: true });
          break;
        case "priority":
          q = q
            .order("priority", { ascending: false })
            .order("last_message_at", { ascending: false, nullsFirst: false });
          break;
        case "unread":
          q = q
            .order("unread_count", { ascending: false })
            .order("last_message_at", { ascending: false, nullsFirst: false });
          break;
        case "recent":
        default:
          q = q
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false });
      }

      if (useKeyset && param.kind === "keyset") {
        // Row-value comparison via PostgREST or(): (lma < X) OR (lma = X AND id < Y)
        const cmp = ascending ? "gt" : "lt";
        const lma = param.lma;
        const id = param.id;
        // Null timestamps sort after dated rows. Keep them in the dated cursor
        // transition, then paginate the undated tail by its stable ID order.
        if (lma === null) {
          q = q.is("last_message_at", null);
          q = ascending ? q.gt("id", id) : q.lt("id", id);
        } else {
          q = q.or(`last_message_at.${cmp}.${lma},and(last_message_at.eq.${lma},id.${cmp}.${id}),last_message_at.is.null`);
        }
        q = q.limit(PAGE_SIZE);
      } else if (!useKeyset) {
        const offset = param.kind === "offset" ? param.offset : 0;
        q = q.range(offset, offset + PAGE_SIZE - 1);
      } else {
        // initial keyset page
        q = q.limit(PAGE_SIZE);
      }

      const { data, error } = await q;
      if (error) throw error;

      // Flatten label assignments
      return (data ?? []).map((row: any) => ({
        ...row,
        labels:
          row.label_assignments?.map((la: any) => la.label).filter((l: unknown) => l != null) ?? [],
      })) as ConversationRow[];
    },
    // Background refetch cadence is a per-workspace user preference; 0 = off
    // (realtime invalidations still update the list).
    refetchInterval: syncSettings.refetchIntervalMs || false,
    // Keep the current rows mounted while a refetch (or its retries) run, so
    // a failing background sync never blanks the list.
    placeholderData: keepPreviousData,
    // Automatic retry with backoff; only exhausted attempts reach the user.
    ...backgroundSyncQueryOptions,
  });

  // Realtime updates for the conversation list are handled centrally by
  // `RealtimeMessagingProvider` (workspace-scoped channel), which invalidates
  // the ["conversations"] key on any relevant change. Keeping a second
  // per-hook subscription here caused duplicate websocket channels and
  // double invalidations on every inbound message.

  // Merge pages through the scope guard so a cached page from a previous
  // channel/account selection (or a realtime writer that touched every
  // ["conversations", ws] entry) can never render rows outside the active
  // selection while the refetch for the new selection is in flight.
  const conversations = useMemo(() => {
    const merged = mergeConversationPages<ConversationRow>(query.data?.pages, {
      workspaceId,
      channels: params.channels,
      accountId: params.accountId ?? null,
      // Recency sorts are re-applied after merging so in-place realtime /
      // optimistic patches can't leave a bumped thread in a stale slot.
      sortByRecency: useKeyset ? (ascending ? "asc" : "desc") : null,
    });
    // Pinned threads float to the top of the default recency view. Stable
    // partition, so relative recency order is kept inside each group. Only
    // rows already loaded are considered; pinned rows on later pages surface
    // once they're paged in.
    if (useKeyset && !ascending) {
      const isPinned = (c: ConversationRow) => {
        const m = (c.metadata ?? {}) as Record<string, unknown>;
        return m.pinned === true || m.pinned === "true";
      };
      return [...merged.filter(isPinned), ...merged.filter((c) => !isPinned(c))];
    }
    return merged;
  }, [query.data, workspaceId, params.channels, params.accountId, useKeyset, ascending]);

  // Every completed list fetch (including silent background ones) also
  // recalculates the badge sources, so unread numbers can never lag behind the
  // rows that are already on screen. `refetchQueries` on active queries keeps
  // the previous data mounted — no spinners, no flicker.
  const listUpdatedAt = query.dataUpdatedAt;
  useEffect(() => {
    if (!workspaceId || !listUpdatedAt) return;
    void qc.refetchQueries({
      predicate: (q) =>
        (q.queryKey[0] === "conversation-counts" ||
          q.queryKey[0] === "conversation-channel-unread") &&
        q.queryKey[1] === workspaceId,
      type: "active",
    });
  }, [qc, workspaceId, listUpdatedAt]);

  // Silent while retrying; a single clear message once retries are exhausted.
  useBackgroundSyncNotice({
    label: "conversations",
    isError: query.isError,
    error: query.error,
    hasCachedData: conversations.length > 0,
    enabled: !!workspaceId,
    onRetry: () => void query.refetch(),
  });

  return { ...query, conversations, syncFailed: query.isError };
}

/** Live counts per sidebar filter. */
export function useConversationCounts(inboxId?: string | null) {
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const workspaceId = active?.id;
  const userId = user?.id;
  const { settings: syncSettings } = useInboxSyncSettings(workspaceId);

  const q = useQuery({
    queryKey: ["conversation-counts", workspaceId, inboxId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (isCountsDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.log("[counts] refetch:start", { workspaceId, inboxId });
      }
      const { measureCountsRpc } = await import("@/lib/metrics/counts-metrics");
      const { data, error } = await measureCountsRpc(
        { workspaceId: workspaceId ?? null, inboxId: inboxId ?? null },
        async () =>
          await sbAny(supabase).rpc("get_conversation_counts", {
            _workspace_id: workspaceId!,
            _inbox_id: inboxId ?? undefined,
            _user_id: userId ?? undefined,
          }),
      );

      if (error) throw error;
      const zeroBuckets: ConversationCountBuckets = {
        all: 0,
        unread: 0,
        mine: 0,
        unassigned: 0,
        open: 0,
        pending: 0,
        resolved: 0,
        archived: 0,
      };
      const raw = (data ?? {}) as Partial<ConversationCountBuckets> & {
        badges?: Partial<ConversationCountBuckets>;
      };
      const num = (v: unknown) => (typeof v === "number" ? v : v == null ? 0 : Number(v) || 0);
      const result: ConversationCounts = {
        all: num(raw.all),
        unread: num(raw.unread),
        mine: num(raw.mine),
        unassigned: num(raw.unassigned),
        open: num(raw.open),
        pending: num(raw.pending),
        resolved: num(raw.resolved),
        archived: num(raw.archived),
        badges: {
          ...zeroBuckets,
          all: num(raw.badges?.all),
          unread: num(raw.badges?.unread),
          mine: num(raw.badges?.mine),
          unassigned: num(raw.badges?.unassigned),
          open: num(raw.badges?.open),
          pending: num(raw.badges?.pending),
          resolved: num(raw.badges?.resolved),
          archived: num(raw.badges?.archived),
        },
      };
      if (isCountsDebugEnabled()) {
        const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
        // eslint-disable-next-line no-console
        console.log("[counts] refetch:done", {
          workspaceId,
          inboxId,
          ms: Math.round(t1 - t0),
          ...result,
        });
      }
      return result;
    },
    // Graceful degradation: keep last successful counts visible while a
    // refetch fails, so the inbox and sidebar still render usable numbers.
    placeholderData: keepPreviousData,
    // Shared automatic retry policy (backoff + jitter, no retry on
    // permission/validation errors) — counts never throw into a boundary.
    ...backgroundSyncQueryOptions,
    refetchInterval: syncSettings.refetchIntervalMs || false,
    // Silent freshness: recalc badges on focus/reconnect without a spinner.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
  });

  useCountsDebugLogger(q, workspaceId, inboxId);
  useBackgroundSyncNotice({
    label: "inbox counts",
    isError: q.isError,
    error: q.error,
    hasCachedData: !!q.data,
    enabled: !!workspaceId,
    onRetry: () => void q.refetch(),
  });

  const isStale = q.isError && !!q.data;
  return { ...q, isStale };
}

/** A single unread row as returned by the channel-unread query. */
export type UnreadCountRow = {
  channel: string | null;
  unread_count: number | null;
  channel_account_id?: string | null;
  /**
   * Live chat conversations carry their chatbot ("account") in metadata;
   * Telegram/Messenger/Instagram carry their provider-table row id there.
   */
  metadata?: { chatbot_id?: string | null; account_id?: string | null } | null;
};

export type ChannelUnreadCounts = {
  /** Unread totals per *normalized* inbox channel (all provider variants merged). */
  byChannel: Partial<Record<InboxChannel, number>>;
  /** Unread totals per connected account id, for per-account badges. */
  byAccount: Record<string, number>;
};

/**
 * Pure aggregation used by {@link useChannelUnreadCounts}. Exported so the
 * normalization contract (e.g. `whatsapp_cloud` / `whatsapp_qr` /
 * `meta_whatsapp` all rolling up into one `whatsapp` bucket) is unit-testable
 * without a database.
 */
export function aggregateChannelUnread(rows: UnreadCountRow[]): ChannelUnreadCounts {
  const byChannel: Partial<Record<InboxChannel, number>> = {};
  const byAccount: Record<string, number> = {};
  for (const row of rows) {
    const n = Number(row.unread_count) || 0;
    if (n <= 0) continue;
    const ch = providerToChannelOrNull(row.channel);
    if (ch) byChannel[ch] = (byChannel[ch] ?? 0) + n;
    if (row.channel_account_id) {
      byAccount[row.channel_account_id] = (byAccount[row.channel_account_id] ?? 0) + n;
    }
    const botId = row.metadata?.chatbot_id;
    if (botId) {
      const key = liveChatAccountId(botId);
      byAccount[key] = (byAccount[key] ?? 0) + n;
    }
    // Telegram / Messenger / Instagram accounts live in their own tables and
    // are linked through `metadata.account_id`.
    const externalKey = externalAccountKeyForConversation(ch, row.metadata?.account_id);
    if (externalKey) byAccount[externalKey] = (byAccount[externalKey] ?? 0) + n;
  }

  return { byChannel, byAccount };
}

/**
 * Unread message counts grouped by normalized channel (and by connected
 * account), for the channel/account selector.
 * Scoped to the current workspace (and inbox when provided); demo rows and
 * archived/deleted conversations are excluded, matching the list query.
 */
export function useChannelUnreadCounts(inboxId?: string | null) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const { settings: syncSettings } = useInboxSyncSettings(workspaceId);

  const q = useQuery({
    queryKey: ["conversation-channel-unread", workspaceId, inboxId],
    enabled: !!workspaceId,
    placeholderData: keepPreviousData,
    ...backgroundSyncQueryOptions,
    refetchInterval: syncSettings.refetchIntervalMs || false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,

    queryFn: async (): Promise<ChannelUnreadCounts> => {
      // Same base scope as the conversation list — badges and list rows must
      // always be derived from the identical row set.
      const q = applyInboxScope(
        supabase
          .from("conversations")
          .select(sel("channel, unread_count, channel_account_id, metadata")),
        { workspaceId: workspaceId!, inboxId },
      )
        .eq("is_archived", false)
        .gt("unread_count", 0);
      const { data, error } = await q;

      if (error) throw error;
      return aggregateChannelUnread((data ?? []) as unknown as UnreadCountRow[]);
    },
  });

  useBackgroundSyncNotice({
    label: "unread badges",
    isError: q.isError,
    error: q.error,
    hasCachedData: !!q.data,
    enabled: !!workspaceId,
    onRetry: () => void q.refetch(),
  });

  return q;
}

// Background-sync error surfacing now lives in
// `@/lib/inbox/background-sync` (`useBackgroundSyncNotice`), shared by the
// conversation list, counts, and unread-badge queries.

/** Live typing indicators for a conversation. */
export function useTypingIndicators(conversationId: string | undefined) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["typing", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data } = await supabase
        .from("conversation_typing")
        .select("user_id, started_at, expires_at")
        .eq("conversation_id", conversationId!)
        .gt("expires_at", new Date().toISOString());
      return data ?? [];
    },
    refetchInterval: 4000,
  });

  useRealtimeSubscription({
    key: conversationId && workspaceId ? `typing:${conversationId}` : null,
    bindings: [
      {
        event: "*",
        schema: "public",
        table: "conversation_typing",
        filter: conversationId ? `conversation_id=eq.${conversationId}` : undefined,
      },
    ],
    onChange: () => qc.invalidateQueries({ queryKey: ["typing", conversationId] }),
  });

  // Rows carry a short TTL. Between refetches an expired row would keep the
  // "typing" label stuck on screen, so prune locally on a 1s tick.
  const rows = Array.isArray(q.data) ? q.data : [];
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!rows.length) return;
    const t = window.setInterval(() => setTick((n: number) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [rows.length]);

  const live = useMemo(() => {
    void tick;
    const now = Date.now();
    return rows.filter((r: any) => !r?.expires_at || new Date(r.expires_at).getTime() > now);
  }, [rows, tick]);

  return { ...q, data: live } as typeof q;
}

/**
 * Workspace-wide typing indicators, keyed by conversation id.
 * Powers the "typing" preview in the conversation list without needing one
 * subscription per row.
 */
export function useWorkspaceTypingIndicators() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["typing", "workspace", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("conversation_typing")
        .select("conversation_id, user_id, expires_at")
        .eq("workspace_id", workspaceId!)
        .gt("expires_at", new Date().toISOString());
      return data ?? [];
    },
    refetchInterval: 4000,
  });

  useRealtimeSubscription({
    key: workspaceId ? `typing-ws:${workspaceId}` : null,
    bindings: [
      {
        event: "*",
        schema: "public",
        table: "conversation_typing",
        filter: workspaceId ? `workspace_id=eq.${workspaceId}` : undefined,
      },
    ],
    onChange: () => qc.invalidateQueries({ queryKey: ["typing", "workspace", workspaceId] }),
  });

  const rows = Array.isArray(q.data) ? q.data : [];
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!rows.length) return;
    const t = window.setInterval(() => setTick((n: number) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [rows.length]);

  return useMemo(() => {
    void tick;
    const now = Date.now();
    const map: Record<string, string[]> = {};
    for (const r of rows as any[]) {
      if (!r?.conversation_id) continue;
      if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue;
      (map[r.conversation_id] ??= []).push(r.user_id);
    }
    return map;
  }, [rows, tick]);
}

/** Patch a conversation row across every cached list. Returns a snapshot restorer. */
function patchConversationInCaches(
  qc: ReturnType<typeof useQueryClient>,
  workspaceId: string | undefined,
  conversationId: string,
  patch: (row: any) => any,
): { restore: () => void; prev: ConversationRow | undefined } {
  const snapshots: Array<[readonly unknown[], unknown]> = qc.getQueriesData({
    queryKey: ["conversations", workspaceId],
  }) as Array<[readonly unknown[], unknown]>;
  let prev: ConversationRow | undefined;
  qc.setQueriesData<any>({ queryKey: ["conversations", workspaceId] }, (data: any) => {
    if (!data) return data;
    const applyToArr = (arr: any[]) =>
      (arr ?? []).map((c) => {
        if (c?.id !== conversationId) return c;
        if (!prev) prev = c as ConversationRow;
        return patch(c);
      });
    if (data.pages) return { ...data, pages: data.pages.map(applyToArr) };
    if (Array.isArray(data)) return applyToArr(data);
    return data;
  });
  return {
    prev,
    restore: () => {
      for (const [key, value] of snapshots) qc.setQueryData(key as any, value);
    },
  };
}

/** Apply bucket count deltas to every cached conversation-counts entry. */
function applyCountDeltas(
  qc: ReturnType<typeof useQueryClient>,
  workspaceId: string | undefined,
  deltas: Partial<Record<keyof ConversationCountBuckets, number>>,
  badgeDeltas: Partial<Record<keyof ConversationCountBuckets, number>> = {},
): () => void {
  const snapshots = qc.getQueriesData<ConversationCounts>({
    queryKey: ["conversation-counts", workspaceId],
  });
  const clampBuckets = (
    src: ConversationCountBuckets,
    d: Partial<Record<keyof ConversationCountBuckets, number>>,
  ): ConversationCountBuckets => {
    const out = { ...src };
    for (const [k, v] of Object.entries(d)) {
      const key = k as keyof ConversationCountBuckets;
      out[key] = Math.max(0, Number(out[key] ?? 0) + Number(v ?? 0));
    }
    return out;
  };
  qc.setQueriesData<ConversationCounts>(
    { queryKey: ["conversation-counts", workspaceId] },
    (prev) => {
      if (!prev) return prev;
      const nextBuckets = clampBuckets(prev, deltas);
      const badges = prev.badges ?? { ...prev };
      const nextBadges = clampBuckets(badges as ConversationCountBuckets, badgeDeltas);
      return { ...prev, ...nextBuckets, unread: nextBuckets.unread, badges: nextBadges };
    },
  );

  return () => {
    for (const [key, value] of snapshots) qc.setQueryData(key as any, value);
  };
}

export function useToggleStar() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      metadata: Record<string, unknown> | null;
      starred: boolean;
    }) => {
      const next = { ...(input.metadata ?? {}), starred: input.starred };
      const { error } = await supabase
        .from("conversations")
        .update({ metadata: next })
        .eq("id", input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["conversations", active?.id] });
      const snap = patchConversationInCaches(qc, active?.id, input.id, (row) => ({
        ...row,
        metadata: { ...(row.metadata ?? {}), starred: input.starred },
      }));
      return snap;
    },
    onError: (_e, _v, ctx) => {
      ctx?.restore?.();
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["conversations", active?.id] });
    },
  });
}

/** Generic conversation column update with optimistic bucket-aware cache updates. */
export function useUpdateConversation() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("conversations")
        .update(input.patch as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["conversations", active?.id] });
      await qc.cancelQueries({ queryKey: ["conversation-counts", active?.id] });

      const rowSnap = patchConversationInCaches(qc, active?.id, input.id, (row) => ({
        ...row,
        ...input.patch,
      }));

      const prev = rowSnap.prev;
      const deltas: Partial<Record<keyof ConversationCountBuckets, number>> = {};
      const badgeDeltas: Partial<Record<keyof ConversationCountBuckets, number>> = {};
      const patch = input.patch as Partial<ConversationRow>;
      const unread = Number(prev?.unread_count ?? 0);
      const wasArchived = !!prev?.is_archived;
      const oldStatus = prev?.status;
      const newStatus = (patch.status ?? oldStatus) as ConversationStatus | undefined;
      const newArchived = patch.is_archived ?? wasArchived;
      const oldAssignee = prev?.assigned_to ?? null;
      const newAssignee = "assigned_to" in patch ? (patch.assigned_to ?? null) : oldAssignee;

      // Archive transitions
      if (!wasArchived && newArchived) {
        deltas.archived = (deltas.archived ?? 0) + 1;
        if (unread > 0) badgeDeltas.archived = (badgeDeltas.archived ?? 0) + 1;
        // Remove from non-archive buckets
        deltas.all = (deltas.all ?? 0) - 1;
        if (unread > 0) badgeDeltas.all = (badgeDeltas.all ?? 0) - 1;
        if (
          oldStatus &&
          (oldStatus === "open" || oldStatus === "pending" || oldStatus === "resolved")
        ) {
          deltas[oldStatus] = (deltas[oldStatus] ?? 0) - 1;
          if (unread > 0) badgeDeltas[oldStatus] = (badgeDeltas[oldStatus] ?? 0) - 1;
        }
        if (oldAssignee === user?.id) {
          deltas.mine = (deltas.mine ?? 0) - 1;
          if (unread > 0) badgeDeltas.mine = (badgeDeltas.mine ?? 0) - 1;
        }
        if (!oldAssignee) {
          deltas.unassigned = (deltas.unassigned ?? 0) - 1;
          if (unread > 0) badgeDeltas.unassigned = (badgeDeltas.unassigned ?? 0) - 1;
        }
      } else if (wasArchived && !newArchived) {
        deltas.archived = (deltas.archived ?? 0) - 1;
        if (unread > 0) badgeDeltas.archived = (badgeDeltas.archived ?? 0) - 1;
        deltas.all = (deltas.all ?? 0) + 1;
        if (unread > 0) badgeDeltas.all = (badgeDeltas.all ?? 0) + 1;
        if (
          newStatus &&
          (newStatus === "open" || newStatus === "pending" || newStatus === "resolved")
        ) {
          deltas[newStatus] = (deltas[newStatus] ?? 0) + 1;
          if (unread > 0) badgeDeltas[newStatus] = (badgeDeltas[newStatus] ?? 0) + 1;
        }
        if (newAssignee === user?.id) {
          deltas.mine = (deltas.mine ?? 0) + 1;
          if (unread > 0) badgeDeltas.mine = (badgeDeltas.mine ?? 0) + 1;
        }
        if (!newAssignee) {
          deltas.unassigned = (deltas.unassigned ?? 0) + 1;
          if (unread > 0) badgeDeltas.unassigned = (badgeDeltas.unassigned ?? 0) + 1;
        }
      } else if (!wasArchived && !newArchived) {
        // Status transition
        if (oldStatus !== newStatus) {
          if (oldStatus === "open" || oldStatus === "pending" || oldStatus === "resolved") {
            deltas[oldStatus] = (deltas[oldStatus] ?? 0) - 1;
            if (unread > 0) badgeDeltas[oldStatus] = (badgeDeltas[oldStatus] ?? 0) - 1;
          }
          if (newStatus === "open" || newStatus === "pending" || newStatus === "resolved") {
            deltas[newStatus] = (deltas[newStatus] ?? 0) + 1;
            if (unread > 0) badgeDeltas[newStatus] = (badgeDeltas[newStatus] ?? 0) + 1;
          }
        }
        // Assignment transition
        if (oldAssignee !== newAssignee) {
          if (oldAssignee === user?.id) {
            deltas.mine = (deltas.mine ?? 0) - 1;
            if (unread > 0) badgeDeltas.mine = (badgeDeltas.mine ?? 0) - 1;
          }
          if (newAssignee === user?.id) {
            deltas.mine = (deltas.mine ?? 0) + 1;
            if (unread > 0) badgeDeltas.mine = (badgeDeltas.mine ?? 0) + 1;
          }
          if (!oldAssignee) {
            deltas.unassigned = (deltas.unassigned ?? 0) - 1;
            if (unread > 0) badgeDeltas.unassigned = (badgeDeltas.unassigned ?? 0) - 1;
          }
          if (!newAssignee) {
            deltas.unassigned = (deltas.unassigned ?? 0) + 1;
            if (unread > 0) badgeDeltas.unassigned = (badgeDeltas.unassigned ?? 0) + 1;
          }
        }
      }

      const restoreCounts = applyCountDeltas(qc, active?.id, deltas, badgeDeltas);
      return { restoreRow: rowSnap.restore, restoreCounts };
    },
    onError: (_e, _v, ctx) => {
      ctx?.restoreRow?.();
      ctx?.restoreCounts?.();
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["conversations", active?.id] });
      qc.invalidateQueries({ queryKey: ["conversation-counts", active?.id] });
    },
  });
}

/** Toggle a boolean-ish flag stored in conversations.metadata. */
export function useToggleMetaFlag() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      metadata: Record<string, unknown> | null;
      key: string;
      value: boolean;
    }) => {
      const next = { ...(input.metadata ?? {}), [input.key]: input.value };
      const { error } = await supabase
        .from("conversations")
        .update({ metadata: next as never })
        .eq("id", input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["conversations", active?.id] });
      return patchConversationInCaches(qc, active?.id, input.id, (row) => ({
        ...row,
        metadata: { ...(row.metadata ?? {}), [input.key]: input.value },
      }));
    },
    onError: (_e, _v, ctx) => {
      ctx?.restore?.();
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["conversations", active?.id] });
    },
  });
}

/** Mark an open conversation unread and keep the Inbox badge/filter in sync. */
export function useMarkAsUnread() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (conversation: ConversationRow) => {
      const workspaceId = active?.id;
      if (!workspaceId || conversation.workspace_id !== workspaceId) {
        throw new Error("The conversation is not in the active workspace.");
      }

      // A read request may already be in flight when the user clicks the menu.
      // Let it finish before writing the explicit unread state.
      await waitForReadWrites(conversation.id);
      const { data, error } = await supabase
        .from("conversations")
        .update({ unread_count: 1 })
        .eq("id", conversation.id)
        .eq("workspace_id", workspaceId)
        .eq("unread_count", 0)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (data) return;

      // A concurrent inbound message may have made it unread already. Also
      // distinguish that case from an inaccessible/deleted conversation.
      const existing = await supabase
        .from("conversations")
        .select("unread_count")
        .eq("id", conversation.id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data || existing.data.unread_count < 1) {
        throw new Error("Could not mark this conversation unread.");
      }
    },
    onMutate: async (conversation) => {
      holdManualUnread(conversation.id);
      const workspaceId = active?.id;
      await Promise.all([
        qc.cancelQueries({ queryKey: ["conversations", workspaceId] }),
        qc.cancelQueries({ queryKey: ["conversation-counts", workspaceId] }),
        qc.cancelQueries({ queryKey: ["conversation-channel-unread", workspaceId] }),
      ]);
      const rowSnapshot = patchConversationInCaches(qc, workspaceId, conversation.id, (row) => ({
        ...row,
        unread_count: Math.max(1, Number(row.unread_count ?? 0)),
      }));
      const previous = rowSnapshot.prev ?? conversation;
      const wasUnread = Number(previous.unread_count ?? 0) > 0;
      const badgeDeltas: Partial<Record<keyof ConversationCountBuckets, number>> = {};
      const deltas: Partial<Record<keyof ConversationCountBuckets, number>> = {};
      if (!wasUnread) {
        if (previous.is_archived) {
          badgeDeltas.archived = 1;
        } else {
          deltas.unread = 1;
          badgeDeltas.all = 1;
          badgeDeltas.unread = 1;
          if (
            previous.status === "open" ||
            previous.status === "pending" ||
            previous.status === "resolved"
          ) {
            badgeDeltas[previous.status] = 1;
          }
          if (previous.assigned_to === user?.id) badgeDeltas.mine = 1;
          if (!previous.assigned_to) badgeDeltas.unassigned = 1;
        }
      }
      const restoreCounts = applyCountDeltas(qc, workspaceId, deltas, badgeDeltas);
      return { restoreRow: rowSnapshot.restore, restoreCounts };
    },
    onError: (_error, conversation, context) => {
      clearManualUnreadHold(conversation.id);
      context?.restoreRow();
      context?.restoreCounts();
    },
    onSettled: (_data, _error, conversation) => {
      const workspaceId = conversation.workspace_id;
      qc.invalidateQueries({ queryKey: ["conversations", workspaceId] });
      qc.invalidateQueries({ queryKey: ["conversation", workspaceId, conversation.id] });
      qc.invalidateQueries({ queryKey: ["conversation-counts", workspaceId] });
      qc.invalidateQueries({ queryKey: ["conversation-channel-unread", workspaceId] });
    },
  });
}

export function useMarkAsRead() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  type MarkAsReadInput =
    | string
    | {
        conversationId: string;
        optimisticConversation?: ConversationRow;
        /** Use when the conversation is open and a fresh inbound message just arrived. */
        assumeUnread?: boolean;
      };
  return useMutation({
    mutationFn: async (input: MarkAsReadInput) => {
      const conversationId = typeof input === "string" ? input : input.conversationId;
      if (isManualUnreadHeld(conversationId)) return;
      const write = (async () => {
        const { error } = await supabase
          .from("conversations")
          .update({ unread_count: 0 })
          .eq("id", conversationId);
        if (error) throw error;
      })();
      await trackReadWrite(conversationId, write);
    },
    onMutate: async (input: MarkAsReadInput) => {
      const conversationId = typeof input === "string" ? input : input.conversationId;
      if (isManualUnreadHeld(conversationId)) return;
      const optimisticConversation =
        typeof input === "string" ? undefined : input.optimisticConversation;
      const assumeUnread = typeof input !== "string" && input.assumeUnread;
      const workspaceId = active?.id;
      await qc.cancelQueries({ queryKey: ["conversations", workspaceId] });
      await qc.cancelQueries({ queryKey: ["conversation-counts", workspaceId] });
      await qc.cancelQueries({ queryKey: ["conversation-channel-unread", workspaceId] });

      // Find the conversation's current unread_count from any cached list.
      let prevUnread = Math.max(assumeUnread ? 1 : 0, optimisticConversation?.unread_count ?? 0);
      let prevConversation:
        | Pick<
            ConversationRow,
            "assigned_to" | "is_archived" | "status" | "channel" | "channel_account_id" | "metadata"
          >
        | undefined = optimisticConversation;
      const listCaches = qc.getQueriesData<any>({ queryKey: ["conversations", workspaceId] });
      for (const [, data] of listCaches) {
        const pages = data?.pages ?? (Array.isArray(data) ? [data] : []);
        for (const page of pages) {
          const hit = (page ?? []).find((c: any) => c?.id === conversationId);
          if (hit) {
            if (typeof hit.unread_count === "number")
              prevUnread = Math.max(prevUnread, hit.unread_count);
            prevConversation = hit;
            break;
          }
        }
        if (prevUnread) break;
      }

      // Optimistically zero out unread on cached conversation rows.
      qc.setQueriesData<any>({ queryKey: ["conversations", workspaceId] }, (data: any) => {
        if (!data) return data;
        const patch = (arr: any[]) =>
          (arr ?? []).map((c) => (c?.id === conversationId ? { ...c, unread_count: 0 } : c));
        if (data.pages) return { ...data, pages: data.pages.map(patch) };
        if (Array.isArray(data)) return patch(data);
        return data;
      });

      // Optimistically decrement counts.
      if (prevUnread > 0) {
        const dec = (n: unknown) => Math.max(0, Number(n ?? 0) - 1);
        qc.setQueriesData<ConversationCounts>(
          { queryKey: ["conversation-counts", workspaceId] },
          (prev) => {
            if (!prev) return prev;
            const badges: ConversationCountBuckets = {
              all: prev.badges?.all ?? prev.unread ?? 0,
              unread: prev.badges?.unread ?? prev.unread ?? 0,
              mine: prev.badges?.mine ?? 0,
              unassigned: prev.badges?.unassigned ?? 0,
              open: prev.badges?.open ?? 0,
              pending: prev.badges?.pending ?? 0,
              resolved: prev.badges?.resolved ?? 0,
              archived: prev.badges?.archived ?? 0,
            };
            badges.all = dec(badges.all);
            badges.unread = dec(badges.unread);
            if (prevConversation?.is_archived) {
              badges.archived = dec(badges.archived);
            } else {
              if (prevConversation?.status === "open") {
                badges.open = dec(badges.open);
              } else if (prevConversation?.status === "pending") {
                badges.pending = dec(badges.pending);
              } else if (prevConversation?.status === "resolved") {
                badges.resolved = dec(badges.resolved);
              }
              if (prevConversation?.assigned_to === user?.id) badges.mine = dec(badges.mine);
              if (!prevConversation?.assigned_to) badges.unassigned = dec(badges.unassigned);
            }
            return { ...prev, unread: dec(prev.unread), badges };
          },
        );

        // Same badge numbers feed the channel/account switcher's per-channel
        // counts — without this patch they only catch up after the mutation
        // settles and its invalidate round-trips, which reads as "the count
        // didn't update" for the second or two that takes.
        qc.setQueriesData<ChannelUnreadCounts>(
          { queryKey: ["conversation-channel-unread", workspaceId] },
          (prev) => {
            if (!prev) return prev;
            const byChannel = { ...prev.byChannel };
            const byAccount = { ...prev.byAccount };
            const ch = providerToChannelOrNull(prevConversation?.channel ?? null);
            if (ch && byChannel[ch] != null) {
              byChannel[ch] = Math.max(0, (byChannel[ch] ?? 0) - prevUnread);
            }
            const accountId = prevConversation?.channel_account_id;
            if (accountId && byAccount[accountId] != null) {
              byAccount[accountId] = Math.max(0, (byAccount[accountId] ?? 0) - prevUnread);
            }
            const botId = (prevConversation?.metadata as { chatbot_id?: string | null } | undefined)
              ?.chatbot_id;
            if (botId) {
              const key = liveChatAccountId(botId);
              if (byAccount[key] != null)
                byAccount[key] = Math.max(0, (byAccount[key] ?? 0) - prevUnread);
            }
            const externalKey = externalAccountKeyForConversation(
              ch,
              (prevConversation?.metadata as { account_id?: string | null } | undefined)
                ?.account_id,
            );
            if (externalKey && byAccount[externalKey] != null) {
              byAccount[externalKey] = Math.max(0, (byAccount[externalKey] ?? 0) - prevUnread);
            }
            return { byChannel, byAccount };
          },
        );
      }

      return { prevUnread };
    },
    onError: (_e, _id, _ctx) => {
      qc.invalidateQueries({ queryKey: ["conversations", active?.id] });
      qc.invalidateQueries({ queryKey: ["conversation", active?.id] });
      qc.invalidateQueries({ queryKey: ["conversation-counts", active?.id] });
      qc.invalidateQueries({ queryKey: ["conversation-channel-unread", active?.id] });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["conversations", active?.id] });
      qc.invalidateQueries({ queryKey: ["conversation", active?.id] });
      qc.invalidateQueries({ queryKey: ["conversation-counts", active?.id] });
      qc.invalidateQueries({ queryKey: ["conversation-channel-unread", active?.id] });
    },
  });
}

/** IntersectionObserver ref helper for infinite scroll. */
export function useInfiniteScroll(onIntersect: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onIntersect();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onIntersect, enabled]);
  return ref;
}
