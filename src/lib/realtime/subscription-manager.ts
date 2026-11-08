/**
 * Centralized Supabase Realtime subscription manager.
 *
 * Goals:
 *  1. **Unique channel names** — every physical Supabase channel is created
 *     with a globally-unique topic, so a remount can never collide with an
 *     already-subscribed channel ("cannot add postgres_changes callbacks
 *     after subscribe()").
 *  2. **Idempotent subscribe** — callers that share the same logical `key`
 *     (e.g. `labels:${workspaceId}`) share ONE physical channel via
 *     ref-counting. Multiple hook instances / StrictMode double-mounts do
 *     not spin up duplicate channels.
 *  3. **Guaranteed unsubscribe** — the manager owns the channel lifecycle.
 *     Callers get an `unsubscribe()` handle; the physical channel is torn
 *     down only when the last subscriber leaves.
 *
 * Usage:
 *   const off = subscribeToChanges({
 *     key: `labels:${workspaceId}`,
 *     bindings: [
 *       { event: "*", schema: "public", table: "conversation_labels",
 *         filter: `workspace_id=eq.${workspaceId}` },
 *     ],
 *     onChange: (payload) => { ... },
 *   });
 *   return () => off();
 *
 * See `useRealtimeSubscription` for the idiomatic React hook wrapper.
 */

import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  RealtimePostgresChangesFilter,
  REALTIME_LISTEN_TYPES,
} from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PgEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface PostgresBinding {
  event: PgEvent;
  schema?: string;
  table: string;
  filter?: string;
}

export type PostgresChangePayload = RealtimePostgresChangesPayload<
  Record<string, unknown>
>;

export interface SubscribeOptions {
  /**
   * Logical subscription key. All subscribers sharing the same key share
   * one underlying channel. Include workspace/tenant ids in the key so
   * different tenants never share a channel.
   */
  key: string;
  bindings: PostgresBinding[];
  onChange: (payload: PostgresChangePayload, binding: PostgresBinding) => void;
  onStatus?: (status: string) => void;
}

interface ChannelEntry {
  channel: RealtimeChannel;
  refCount: number;
  subscribers: Set<{
    onChange: SubscribeOptions["onChange"];
    onStatus?: SubscribeOptions["onStatus"];
  }>;
  bindings: PostgresBinding[];
  topic: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, ChannelEntry>();

function makeTopic(key: string): string {
  // Unique per physical channel so Supabase never rejects a resubscribe.
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  // Prefix so devtools show the logical intent.
  return `rt:${key}:${nonce}`;
}

function bindingMatches(b: PostgresBinding, payload: PostgresChangePayload): boolean {
  if (b.event !== "*" && b.event !== payload.eventType) return false;
  if (b.table && payload.table !== b.table) return false;
  if (b.schema && payload.schema !== b.schema) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Subscribe to postgres_changes for a logical `key`. Idempotent: multiple
 * callers with the same key share one channel. Returns an unsubscribe fn.
 */
export function subscribeToChanges(opts: SubscribeOptions): () => void {
  const { key, bindings, onChange, onStatus } = opts;
  const subscriber = { onChange, onStatus };

  let entry = registry.get(key);
  if (!entry) {
    const topic = makeTopic(key);
    const channel = supabase.channel(topic);
    entry = {
      channel,
      refCount: 0,
      subscribers: new Set(),
      bindings,
      topic,
    };

    // Bind every postgres_changes filter BEFORE subscribe(). Doing this
    // once per physical channel avoids the "cannot add callbacks after
    // subscribe()" error class that plagued per-hook channel creation.
    for (const b of bindings) {
      channel.on(
        "postgres_changes" as unknown as `${REALTIME_LISTEN_TYPES.POSTGRES_CHANGES}`,
        {
          event: b.event,
          schema: b.schema ?? "public",
          table: b.table,
          ...(b.filter ? { filter: b.filter } : {}),
        } as RealtimePostgresChangesFilter<PgEvent>,
        (payload: PostgresChangePayload) => {
          const current = registry.get(key);
          if (!current) return;
          for (const s of current.subscribers) {
            if (bindingMatches(b, payload)) {
              try {
                s.onChange(payload, b);
              } catch {
                /* ignore subscriber errors */
              }
            }
          }
        },
      );
    }

    channel.subscribe((status) => {
      const current = registry.get(key);
      if (!current) return;
      for (const s of current.subscribers) {
        try {
          s.onStatus?.(status);
        } catch {
          /* ignore */
        }
      }
    });

    registry.set(key, entry);
  }

  entry.subscribers.add(subscriber);
  entry.refCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = registry.get(key);
    if (!current) return;
    current.subscribers.delete(subscriber);
    current.refCount = Math.max(0, current.refCount - 1);
    if (current.refCount === 0) {
      registry.delete(key);
      try {
        supabase.removeChannel(current.channel);
      } catch {
        /* ignore */
      }
    }
  };
}

/**
 * Subscribe to a presence channel (Supabase presence, not postgres_changes).
 * Presence channels are always uniquely-topic'd per subscriber because they
 * carry per-user `track()` state; ref-counting doesn't apply.
 */
export interface PresenceSubscribeOptions {
  key: string;
  presenceKey: string;
  onSync?: (state: Record<string, unknown[]>) => void;
  onJoin?: (state: Record<string, unknown[]>) => void;
  onLeave?: (state: Record<string, unknown[]>) => void;
  onSubscribed?: (channel: RealtimeChannel) => void | Promise<void>;
}

export function subscribeToPresence(opts: PresenceSubscribeOptions): () => void {
  const topic = makeTopic(opts.key);
  const channel = supabase.channel(topic, {
    config: { presence: { key: opts.presenceKey } },
  });

  const sync = () => {
    const state = channel.presenceState() as Record<string, unknown[]>;
    opts.onSync?.(state);
  };
  channel.on("presence", { event: "sync" }, sync);
  if (opts.onJoin) {
    channel.on("presence", { event: "join" }, () => {
      opts.onJoin?.(channel.presenceState() as Record<string, unknown[]>);
    });
  }
  if (opts.onLeave) {
    channel.on("presence", { event: "leave" }, () => {
      opts.onLeave?.(channel.presenceState() as Record<string, unknown[]>);
    });
  }

  let released = false;
  channel.subscribe(async (status) => {
    if (released) return;
    if (status === "SUBSCRIBED") {
      await opts.onSubscribed?.(channel);
    }
  });

  return () => {
    if (released) return;
    released = true;
    try {
      supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
  };
}

/** Tear down every channel this manager owns (used on org/tenant switch). */
export function resetAllSubscriptions(): void {
  for (const [key, entry] of registry) {
    try {
      supabase.removeChannel(entry.channel);
    } catch {
      /* ignore */
    }
    registry.delete(key);
  }
}

/** Diagnostic: current channel count / keys (dev inspection). */
export function inspectSubscriptions(): { key: string; refs: number; topic: string }[] {
  return Array.from(registry.entries()).map(([key, e]) => ({
    key,
    refs: e.refCount,
    topic: e.topic,
  }));
}
