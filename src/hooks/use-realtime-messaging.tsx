import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useInboxSyncSettings } from "@/lib/inbox/sync-settings";
import { useRealtimeSubscription } from "@/hooks/use-realtime-subscription";
import {
  createConversationInvalidator,
  createEventDeduper,
} from "@/lib/inbox/realtime-invalidation";
import { createReconnectController } from "@/lib/inbox/realtime-backoff";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { sbAny } from "@/lib/supabase/untyped";
import { channelLabel } from "@/lib/inbox/channel-capabilities";
import { externalAccountKeyForConversation } from "@/lib/inbox/external-account-ids";
import { liveChatAccountId } from "@/hooks/use-livechat-accounts";
import { playInboundChime } from "@/lib/notifications/inbound-sound";
import { explainWhatsAppDeliveryFailure } from "@/lib/messaging/whatsapp-delivery-errors";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "paused";

export type PresenceUser = {
  user_id: string;
  online_at: string;
  device: string;
};

type OfflineOp =
  | {
      kind: "message";
      payload: {
        workspace_id: string;
        conversation_id: string;
        body: string | null;
        message_type: "text";
        direction: "outbound";
        status: "queued";
        sent_by: string;
        client_temp_id: string;
      };
    }
  | {
      kind: "read";
      payload: { conversation_id: string };
    };

type Ctx = {
  connectionState: ConnectionState;
  /** Whether realtime subscriptions are enabled for the active workspace. */
  realtimeEnabled: boolean;
  onlineUsers: Record<string, PresenceUser[]>; // user_id -> devices
  isUserOnline: (userId: string | null | undefined) => boolean;
  requestDesktopNotifications: () => Promise<NotificationPermission>;
  notificationsPermission: NotificationPermission | "unsupported";
  queueOffline: (op: OfflineOp) => void;
  pendingOfflineCount: number;
  /** Consecutive failed realtime subscription attempts (0 when healthy). */
  reconnectAttempts: number;
};

const RealtimeContext = createContext<Ctx | null>(null);

const OFFLINE_KEY = "lovable.realtime.offlineQueue.v1";

function loadQueue(): OfflineOp[] {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY);
    return raw ? (JSON.parse(raw) as OfflineOp[]) : [];
  } catch {
    return [];
  }
}
function saveQueue(q: OfflineOp[]) {
  try {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return "mobile";
  if (/Mac/i.test(ua)) return "mac";
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(ua)) return "linux";
  return "web";
}

/** Channel label and sender name for an attention toast. */
async function describeConversation(
  conversationId: string,
): Promise<{
  channel: string;
  rawChannel?: string;
  channelAccountId?: string | null;
  name: string;
  muted: boolean;
}> {
  const { data } = await sbAny(supabase)
    .from("conversations")
    .select("channel, channel_account_id, metadata, contact:contacts(display_name, first_name, last_name, phone)")
    .eq("id", conversationId)
    .maybeSingle();
  const row = (data ?? {}) as {
    channel?: string;
    channel_account_id?: string | null;
    metadata?: Record<string, unknown> | null;
    contact?: { display_name?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
  };
  const muted = row.metadata?.muted === "true" || row.metadata?.muted === true;
  const metadataAccountId = typeof row.metadata?.account_id === "string"
    ? row.metadata.account_id
    : null;
  const chatbotId = typeof row.metadata?.chatbot_id === "string"
    ? row.metadata.chatbot_id
    : null;
  const channelAccountId = row.channel_account_id
    ?? externalAccountKeyForConversation(row.channel, metadataAccountId)
    ?? ((row.channel === "webchat" || row.channel === "livechat") && chatbotId ? liveChatAccountId(chatbotId) : null);
  const contact = row.contact ?? {};
  const name =
    contact.display_name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.phone ||
    "Customer";
  return {
    channel: channelLabel(row.channel),
    rawChannel: row.channel,
    channelAccountId,
    name,
    muted,
  };
}

export function RealtimeMessagingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const userId = user?.id;
  // Per-workspace kill switch: when off, no realtime channels are opened and
  // freshness falls back to the background refetch interval / manual sync.
  const { settings: syncSettings } = useInboxSyncSettings(workspaceId);
  const realtimeEnabled = syncSettings.realtimeEnabled;
  const qc = useQueryClient();
  const router = useRouter();

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [onlineUsers, setOnlineUsers] = useState<Record<string, PresenceUser[]>>(
    {},
  );
  const [notificationsPermission, setNotificationsPermission] = useState<
    NotificationPermission | "unsupported"
  >(() =>
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const queueRef = useRef<OfflineOp[]>([]);
  const hasWindowFocus = useRef(true);

  // Realtime auto-reconnect: a dropped channel bumps this epoch after an
  // exponentially backed-off, jittered delay, which re-runs the subscription
  // effect below (full teardown + resubscribe) instead of leaving the app on
  // stale data until the next manual refresh.
  const [reconnectEpoch, setReconnectEpoch] = useState(0);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const reconnectRef = useRef<ReturnType<typeof createReconnectController> | null>(
    null,
  );
  if (!reconnectRef.current) {
    reconnectRef.current = createReconnectController((attempt) => {
      setReconnectAttempts(attempt);
      setReconnectEpoch((e) => e + 1);
    });
  }
  const reconnect = reconnectRef.current;
  useEffect(() => () => reconnect.cancel(), [reconnect]);

  // Track focus for notifications
  useEffect(() => {
    const onFocus = () => (hasWindowFocus.current = true);
    const onBlur = () => (hasWindowFocus.current = false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // New widget visitors alert agents exactly once per session, even when the
  // same INSERT arrives on more than one channel/tab re-subscription.
  const notifiedVisitorsRef = useRef<Set<string>>(new Set());
  const notifyNewVisitor = useCallback(
    (
      sessionId: string,
      metadata: Record<string, unknown> | null,
      conversationId: string | null,
    ) => {
      if (notifiedVisitorsRef.current.has(sessionId)) return;
      notifiedVisitorsRef.current.add(sessionId);

      const meta = metadata ?? {};
      const name =
        (typeof meta.visitor_name === "string" && meta.visitor_name.trim()) ||
        (typeof meta.visitorName === "string" && meta.visitorName.trim()) ||
        "A website visitor";
      const page =
        (typeof meta.page === "string" && meta.page) ||
        (typeof meta.referrer === "string" && meta.referrer) ||
        "";

      toast.info(`${name} started a live chat`, {
        description: page ? `From ${page}` : "New visitor in the Live Chat widget",
        action: {
          label: "Open Inbox",
          onClick: () => {
            void router.navigate({
              to: "/inbox",
              search: conversationId ? { conversationId } : {},
            } as never);
          },
        },
      });

      if (
        !hasWindowFocus.current &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const n = new Notification("New live chat visitor", {
            body: `${name} just started a chat`,
            tag: `livechat-${sessionId}`,
            icon: "/icon-192.png",
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch {
          /* ignore */
        }
      }
    },
    [router],
  );



  // Load offline queue on mount
  useEffect(() => {
    queueRef.current = loadQueue();
    setPendingOfflineCount(queueRef.current.length);
  }, []);

  const flushQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const q = queueRef.current;
    if (q.length === 0) return;
    const remaining: OfflineOp[] = [];
    for (const op of q) {
      try {
        if (op.kind === "message") {
          const { error } = await sbAny(supabase).from("messages").insert(op.payload);
          if (error) remaining.push(op);
        } else if (op.kind === "read") {
          const { error } = await supabase
            .from("conversations")
            .update({ unread_count: 0 })
            .eq("id", op.payload.conversation_id);
          if (error) remaining.push(op);
        }
      } catch {
        remaining.push(op);
      }
    }
    queueRef.current = remaining;
    saveQueue(remaining);
    setPendingOfflineCount(remaining.length);
    if (remaining.length === 0) {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    }
  }, [qc]);

  const queueOffline = useCallback(
    (op: OfflineOp) => {
      queueRef.current = [...queueRef.current, op];
      saveQueue(queueRef.current);
      setPendingOfflineCount(queueRef.current.length);
      if (navigator.onLine) void flushQueue();
    },
    [flushQueue],
  );

  // Online/offline detection
  useEffect(() => {
    const onOnline = () => {
      setConnectionState("reconnecting");
      void flushQueue();
      // Network is back: skip the remaining backoff and resubscribe now.
      reconnect.scheduleImmediate();
    };
    const onOffline = () => {
      // No point burning retries while the device is offline; the `online`
      // event above restarts the cycle.
      reconnect.cancel();
      setConnectionState("offline");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (!navigator.onLine) setConnectionState("offline");
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flushQueue, reconnect]);

  // Purge stale tenant caches whenever the active workspace changes so badges
  // and lists never render another workspace's rows during a switch. Also
  // flip connection state to "reconnecting" so the UI reflects that realtime
  // channels are being torn down and re-established for the new workspace.
  const previousWorkspaceRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!workspaceId) return;
    const previous = previousWorkspaceRef.current;
    previousWorkspaceRef.current = workspaceId;

    const isForeign = (key: unknown) =>
      Array.isArray(key) && key.length > 1 && key[1] !== workspaceId;
    qc.removeQueries({
      predicate: (q) => {
        const k = q.queryKey as unknown[];
        if (!Array.isArray(k) || k.length === 0) return false;
        const root = k[0];
        if (
          root === "conversations" ||
          root === "conversation-counts" ||
          root === "conversation-channel-unread" ||
          root === "channel-accounts" ||
          root === "external-channel-accounts" ||
          root === "livechat-accounts"
        ) {
          return isForeign(k);
        }
        // messages are keyed by conversationId (not workspace), so on a
        // workspace switch drop them wholesale — the new tenant's open
        // conversation will refetch on mount.
        if (root === "messages" && previous && previous !== workspaceId) {
          return true;
        }
        return false;
      },
    });

    if (previous && previous !== workspaceId) {
      // Signal a resubscription is in progress; the presence channel's
      // SUBSCRIBED callback below will flip this back to "connected".
      setConnectionState("reconnecting");
      // Drop any presence rendered for the previous workspace immediately.
      setOnlineUsers({});
    }

    // Immediately refetch current-tenant counts so the sidebar reflects the
    // new workspace without waiting for the next realtime event.
    qc.invalidateQueries({ queryKey: ["conversation-counts", workspaceId] });
    qc.invalidateQueries({ queryKey: ["conversation-channel-unread", workspaceId] });
    qc.invalidateQueries({ queryKey: ["conversations", workspaceId] });
    qc.invalidateQueries({ queryKey: ["channel-accounts", workspaceId] });
    qc.invalidateQueries({ queryKey: ["external-channel-accounts", workspaceId] });
  }, [workspaceId, qc]);


  // Presence + workspace message sync
  useEffect(() => {
    if (!workspaceId || !userId) return;
    if (!realtimeEnabled) {
      setConnectionState("paused");
      return;
    }
    // Capture the tenant this effect is bound to so late-arriving realtime
    // payloads from a previous subscription cannot invalidate the wrong cache.
    const boundWorkspaceId = workspaceId;
    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const channels: RealtimeChannel[] = [];

    // Single coalesced fan-out for every conversation-derived surface in the
    // app (Inbox list, badges, timeline, activity, notifications, handoff,
    // SLA, dashboard) so realtime — not polling — drives freshness.
    const invalidateConversations = createConversationInvalidator(
      qc,
      boundWorkspaceId,
    );

    // Start each (re)subscription cycle in the reconnecting state so the UI
    // reflects that the previous workspace's channels have been torn down.
    setConnectionState((prev) => (prev === "offline" ? prev : "reconnecting"));

    // Any channel that errors, times out, or closes unexpectedly triggers one
    // shared backed-off resubscribe of the whole set (the controller collapses
    // concurrent failures into a single scheduled retry).
    const handleChannelStatus = (status: string) => {
      if (cancelled) return;
      if (status === "SUBSCRIBED") {
        reconnect.reset();
        setReconnectAttempts(0);
        setConnectionState("connected");
        return;
      }
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        setConnectionState(navigator.onLine ? "reconnecting" : "offline");
        if (navigator.onLine) reconnect.schedule();
      }
    };

    // Presence channel — workspace scoped
    const presence = supabase.channel(`ws-presence:${boundWorkspaceId}`, {
      config: { presence: { key: userId } },
    });

    const syncPresence = () => {
      const state = presence.presenceState() as Record<
        string,
        PresenceUser[]
      >;
      setOnlineUsers(state);
    };

    presence
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .subscribe(async (status) => {
        if (cancelled) return;
        handleChannelStatus(status);
        if (status === "SUBSCRIBED") {
          await presence.track({
            user_id: userId,
            online_at: new Date().toISOString(),
            device: deviceLabel(),
          });
          void flushQueue();
        }
      });
    channels.push(presence);


    // Workspace-wide message stream — desktop notifications, cache updates
    const messagesChan = supabase
      .channel(`ws-msgs:${boundWorkspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `workspace_id=eq.${boundWorkspaceId}`,
        },
        (payload) => {
          if (cancelled) return;
          const m = payload.new as {
            id: string;
            conversation_id: string;
            direction: string;
            body: string | null;
            status?: string | null;
            updated_at?: string | null;
            sent_by: string | null;
            is_internal: boolean;
            workspace_id?: string;
          };
          // Extra defensive check: ignore payloads whose workspace_id no longer
          // matches the current tenant (e.g. after a fast switch).
          if (m.workspace_id && m.workspace_id !== boundWorkspaceId) return;
          // Realtime can redeliver the same INSERT (reconnect, duplicate
          // subscription). Only the first occurrence refreshes caches or
          // raises a notification.
          const fresh = invalidateConversations.schedule(
            m.conversation_id,
            `msg-i:${m.id}`,
          );
          if (!fresh) return;

          // Auto-mark delivered for inbound
          if (m.direction === "inbound") {
            supabase
              .from("messages")
              .update({ delivered_at: new Date().toISOString() })
              .eq("id", m.id)
              .is("delivered_at", null)
              .then(() => {});

            // In-app attention toast with channel and sender, for every inbound message.
            describeConversation(m.conversation_id)
              .then(({ channel, rawChannel, channelAccountId, name, muted }) => {
                if (cancelled) return;
                // Audible cue per channel; internal notes and muted conversations stay silent.
                if (!m.is_internal && !muted) {
                  playInboundChime(rawChannel, boundWorkspaceId, channelAccountId);
                }
                toast.message(`New message on ${channel}`, {
                  description: `${name}: ${(m.body ?? "Sent an attachment").slice(0, 120)}`,
                  action: {
                    label: "Open",
                    onClick: () => router.navigate({ to: "/inbox", search: { conversationId: m.conversation_id } as never }),
                  },
                });
              })
              .catch(() => {});

            // Desktop notification if window blurred
            if (
              !hasWindowFocus.current &&
              !m.is_internal &&
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              try {
                const n = new Notification("New message", {
                  body: m.body?.slice(0, 140) ?? "You have a new message",
                  tag: `conv-${m.conversation_id}`,
                  icon: "/icon-192.png",
                });
                n.onclick = () => {
                  window.focus();
                  n.close();
                };
              } catch {
                /* ignore */
              }
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `workspace_id=eq.${boundWorkspaceId}`,
        },
        (payload) => {
          if (cancelled) return;
          const m = payload.new as {
            id?: string;
            conversation_id: string;
            workspace_id?: string;
            direction?: string;
            status?: string;
            failed_reason?: string | null;
            updated_at?: string | null;
          };
          if (m.workspace_id && m.workspace_id !== boundWorkspaceId) return;
          // Delivery receipts (sent → delivered → read / failed) arrive as
          // UPDATEs from the provider webhook — refresh the thread plus every
          // conversation-derived surface so status chips never lag. The
          // signature carries the revision, so a repeated "delivered" webhook
          // for the same message is dropped instead of re-sorting the list.
          const freshUpdate = invalidateConversations.schedule(
            m.conversation_id,
            m.id
              ? `msg-u:${m.id}:${m.status ?? ""}:${m.updated_at ?? ""}`
              : null,
          );

          // An outbound message the provider rejected needs the agent's attention.
          if (freshUpdate && m.direction === "outbound" && m.status === "failed") {
            describeConversation(m.conversation_id)
              .then(({ channel, name }) => {
                if (cancelled) return;
                const failure = channel === "WhatsApp"
                  ? explainWhatsAppDeliveryFailure(m.failed_reason)
                  : null;
                toast.error(`Message to ${name} failed on ${channel}`, {
                  description: failure?.action ?? (failure?.retryable === false
                    ? failure.summary
                    : "Open the conversation to see the reason and retry."),
                  action: {
                    label: "Open",
                    onClick: () => router.navigate({ to: "/inbox", search: { conversationId: m.conversation_id } as never }),
                  },
                });
              })
              .catch(() => {});
          }

        },

      )
      .subscribe(handleChannelStatus);
    channels.push(messagesChan);

    // Conversation-level sync (unread, assignment, status)
    const convChan = supabase
      .channel(`ws-conv:${boundWorkspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `workspace_id=eq.${boundWorkspaceId}`,
        },
        (payload) => {
          if (cancelled) return;
          const row = (payload.new ?? payload.old) as
            | {
                id?: string;
                workspace_id?: string;
                updated_at?: string | null;
                last_message_at?: string | null;
                unread_count?: number | null;
                status?: string | null;
                assigned_to?: string | null;
              }
            | undefined;
          if (row?.workspace_id && row.workspace_id !== boundWorkspaceId) return;
          invalidateConversations.schedule(
            row?.id ?? null,
            row?.id
              ? [
                  "conv",
                  row.id,
                  payload.eventType,
                  row.updated_at ?? "",
                  row.last_message_at ?? "",
                  row.unread_count ?? "",
                  row.status ?? "",
                  row.assigned_to ?? "",
                ].join(":")
              : null,
          );
        },
      )
      .subscribe(handleChannelStatus);
    channels.push(convChan);

    // Live Chat (widget) sync — widget traffic lands in chatbot_sessions /
    // chatbot_messages and is mirrored into the inbox by the server bridge.
    // Subscribing here means unread counts and the conversation list refresh
    // the moment a visitor message arrives, without waiting for a refetch.
    const invalidateLiveChat = (signature?: string | null) => {
      // Signature-based dedupe keeps widget bursts (a visitor typing several
      // messages, or a redelivered session row) to a single refresh pass.
      if (!invalidateConversations.schedule(null, signature)) return;
      void qc.invalidateQueries({
        queryKey: ["livechat-accounts", boundWorkspaceId],
      });
      void qc.invalidateQueries({ queryKey: ["chatbot-sessions"] });
    };


    const liveChatChan = supabase
      .channel(`ws-livechat:${boundWorkspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chatbot_messages",
          filter: `workspace_id=eq.${boundWorkspaceId}`,
        },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as { id?: string } | undefined;
          invalidateLiveChat(row?.id ? `cb-msg:${row.id}` : null);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chatbot_sessions",
          filter: `workspace_id=eq.${boundWorkspaceId}`,
        },
        (payload) => {
          if (cancelled) return;
          const row = (payload.new ?? payload.old) as
            | {
                id?: string;
                channel?: string | null;
                conversation_id?: string | null;
                metadata?: Record<string, unknown> | null;
                updated_at?: string | null;
                status?: string | null;
              }
            | undefined;
          invalidateLiveChat(
            row?.id
              ? `cb-sess:${row.id}:${payload.eventType}:${row.updated_at ?? ""}:${row.status ?? ""}`
              : null,
          );
          if (row?.conversation_id) {
            qc.invalidateQueries({
              queryKey: ["messages", row.conversation_id],
            });
          }
          // A brand-new widget visitor started a chat → alert agents once.
          if (
            payload.eventType === "INSERT" &&
            row?.id &&
            (row.channel ?? "livechat") === "livechat"
          ) {
            notifyNewVisitor(row.id, row.metadata ?? null, row.conversation_id ?? null);
          }
        },
      )

      .subscribe(handleChannelStatus);
    channels.push(liveChatChan);

    // External account sync — WhatsApp lives in `channel_accounts`, every other
    // network has its own provider table. A connect/disable/token-expiry there
    // changes which accounts the Inbox selector shows and therefore which
    // conversations and unread badges are in scope, so refresh both together.
    const seenAccountEvents = createEventDeduper({ ttlMs: 15_000, max: 200 });
    const invalidateAccounts = (signature?: string | null) => {
      if (signature && !seenAccountEvents.accept(signature)) return;
      qc.invalidateQueries({ queryKey: ["channel-accounts", boundWorkspaceId] });
      qc.invalidateQueries({
        queryKey: ["external-channel-accounts", boundWorkspaceId],
      });
      void qc.invalidateQueries({
        queryKey: ["conversation-channel-unread", boundWorkspaceId],
      });
      void qc.invalidateQueries({
        queryKey: ["conversation-counts", boundWorkspaceId],
      });
      void qc.invalidateQueries({ queryKey: ["conversations", boundWorkspaceId] });
    };

    const accountTables = [
      "channel_accounts",
      "telegram_accounts",
      "messenger_accounts",
      "instagram_accounts",
      "email_accounts",
      "sms_accounts",
    ] as const;

    let accountsChan = supabase.channel(`ws-accounts:${boundWorkspaceId}`);
    for (const table of accountTables) {
      accountsChan = accountsChan.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `workspace_id=eq.${boundWorkspaceId}`,
        },
        (payload) => {
          if (cancelled) return;
          const row = (payload.new ?? payload.old) as
            | { id?: string; workspace_id?: string; updated_at?: string | null }
            | undefined;
          // Guard against payloads queued before a tenant switch.
          if (row?.workspace_id && row.workspace_id !== boundWorkspaceId) return;
          invalidateAccounts(
            row?.id
              ? `acct:${table}:${row.id}:${payload.eventType}:${row.updated_at ?? ""}`
              : null,
          );
        },
      );
    }
    channels.push(accountsChan.subscribe(handleChannelStatus));




    // Heartbeat — updates profiles.last_seen_at
    const beat = () => {
      sbAny(supabase).rpc("heartbeat").then(() => {});
    };
    beat();
    heartbeat = setInterval(beat, 30_000);

    return () => {
      cancelled = true;
      invalidateConversations.cancel();
      if (heartbeat) clearInterval(heartbeat);
      channels.forEach((c) => supabase.removeChannel(c));

    };
  }, [workspaceId, userId, qc, flushQueue, realtimeEnabled, reconnect, reconnectEpoch]);

  const isUserOnline = useCallback(
    (uid: string | null | undefined) => {
      if (!uid) return false;
      return !!onlineUsers[uid]?.length;
    },
    [onlineUsers],
  );

  const requestDesktopNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationsPermission("unsupported");
      return "denied" as NotificationPermission;
    }
    const perm = await Notification.requestPermission();
    setNotificationsPermission(perm);
    return perm;
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      connectionState,
      realtimeEnabled,
      onlineUsers,
      isUserOnline,
      requestDesktopNotifications,
      notificationsPermission,
      queueOffline,
      pendingOfflineCount,
      reconnectAttempts,
    }),
    [
      connectionState,
      realtimeEnabled,
      onlineUsers,
      isUserOnline,
      requestDesktopNotifications,
      notificationsPermission,
      queueOffline,
      pendingOfflineCount,
      reconnectAttempts,
    ],
  );

  return (
    <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtimeMessaging() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    // Safe no-op fallback if consumer renders outside the provider.
    return {
      connectionState: "connecting" as ConnectionState,
      realtimeEnabled: true,
      onlineUsers: {} as Record<string, PresenceUser[]>,
      isUserOnline: () => false,
      requestDesktopNotifications: async () =>
        "default" as NotificationPermission,
      notificationsPermission: "default" as NotificationPermission,
      queueOffline: () => {},
      pendingOfflineCount: 0,
      reconnectAttempts: 0,
    };
  }
  return ctx;
}

/** Live read receipt for the latest outbound message of a conversation. */
export function useConversationReadState(conversationId: string | undefined) {
  const qc = useQueryClient();
  useRealtimeSubscription({
    key: conversationId ? `read:${conversationId}` : null,
    bindings: [
      {
        event: "INSERT",
        schema: "public",
        table: "message_read_receipts",
      },
    ],
    onChange: () =>
      qc.invalidateQueries({ queryKey: ["messages", conversationId] }),
  });
}

