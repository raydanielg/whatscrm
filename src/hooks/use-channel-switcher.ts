import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { InboxChannel, ConversationRow } from "./use-conversations";
import { CHANNEL_LABELS, providerToChannelOrNull } from "@/lib/inbox/channel-capabilities";
import {
  parseChannelSwitcherAccounts,
  type ChannelSwitcherAccount,
} from "@/lib/messaging/channel-account-schema";

export type ChannelStatus = "active" | "degraded" | "unavailable" | "unknown";

export type ChannelOption = {
  channel: InboxChannel;
  label: string;
  status: ChannelStatus;
  statusReason?: string | null;
  verified: boolean;
  hasIdentity: boolean;
  hasAccount: boolean;
  externalId?: string | null;
  accountId?: string | null;
  identityLastSeenAt?: string | null;
  lastUsedAt?: string | null;
  lastMessageStatus?: string | null;
  isCurrent: boolean;
  isPreferred: boolean;
  isPrimary: boolean;
  isFallback: boolean;
  isLastUsed: boolean;
  canReply: boolean;
};

/** Shared label map + provider normaliser (single source of truth). */
const CHANNEL_LABEL = CHANNEL_LABELS;
const providerToChannel = providerToChannelOrNull;

type MetaBag = Record<string, unknown> | null | undefined;
const readChannel = (m: MetaBag, key: string): InboxChannel | null => {
  const v = m && typeof m === "object" ? (m as Record<string, unknown>)[key] : null;
  return typeof v === "string" ? (v as InboxChannel) : null;
};

/**
 * Aggregates every channel we could plausibly use for the current conversation:
 * from the contact's channel_identities, the workspace's channel_accounts,
 * and this conversation's own metadata (primary/fallback/preferred hints).
 */
export function useChannelSwitcher(conversation: ConversationRow | null | undefined) {
  const contactId = conversation?.contact_id ?? null;
  const workspaceId = conversation?.workspace_id ?? null;
  const currentChannel = conversation?.channel ?? null;

  const identitiesQ = useQuery({
    enabled: !!contactId,
    queryKey: ["channel-identities", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_identities")
        .select("channel, external_id, verified, last_seen_at, display_name")
        .eq("contact_id", contactId!)
        .order("last_seen_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        channel: InboxChannel;
        external_id: string;
        verified: boolean;
        last_seen_at: string | null;
        display_name: string | null;
      }>;
    },
  });

  const accountsQ = useQuery({
    enabled: !!workspaceId,
    // NOTE: must NOT collide with `useChannelAccounts` (["channel-accounts", ws]),
    // which caches the server-function payload in a different shape. Sharing the
    // key let a non-array/foreign-shaped value land here → "accounts is not iterable".
    queryKey: ["channel-switcher-accounts", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_accounts")
        .select("id, provider, status, status_reason, is_default, display_name")
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      // Typed fallback: invalid rows are dropped, the result is always an array.
      return parseChannelSwitcherAccounts(data) satisfies ChannelSwitcherAccount[];
    },
  });

  // Recent outbound message per channel for this contact (last used).
  const lastUsedQ = useQuery({
    enabled: !!contactId,
    queryKey: ["channel-last-used", contactId],
    queryFn: async () => {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, channel")
        .eq("contact_id", contactId!)
        .limit(50);
      const ids = (convs ?? []).map((c) => c.id);
      if (ids.length === 0) return {} as Record<string, { at: string; status: string }>;
      const { data: msgs } = await supabase
        .from("messages")
        .select("conversation_id, created_at, status, direction")
        .in("conversation_id", ids)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(200);
      const byChannel: Record<string, { at: string; status: string }> = {};
      const convChannel = new Map((convs ?? []).map((c) => [c.id, c.channel as string]));
      for (const m of (msgs ?? []) as Array<{
        conversation_id: string;
        created_at: string;
        status: string;
      }>) {
        const ch = convChannel.get(m.conversation_id);
        if (!ch) continue;
        if (!byChannel[ch]) byChannel[ch] = { at: m.created_at, status: m.status };
      }
      return byChannel;
    },
  });

  const meta = (conversation?.metadata ?? null) as MetaBag;
  const preferredChannel = readChannel(meta, "preferred_channel");
  const primaryChannel = readChannel(meta, "primary_channel");
  const fallbackChannel = readChannel(meta, "fallback_channel");

  const options = useMemo<ChannelOption[]>(() => {
    if (!conversation) return [];
    const identities = Array.isArray(identitiesQ.data) ? identitiesQ.data : [];
    const accounts = Array.isArray(accountsQ.data) ? accountsQ.data : [];
    const lastUsed = lastUsedQ.data && typeof lastUsedQ.data === "object" ? lastUsedQ.data : {};

    const bucket = new Map<InboxChannel, ChannelOption>();
    const upsert = (channel: InboxChannel, patch: Partial<ChannelOption>) => {
      const prev = bucket.get(channel);
      const base: ChannelOption = prev ?? {
        channel,
        label: CHANNEL_LABEL[channel] ?? channel,
        status: "unknown",
        verified: false,
        hasIdentity: false,
        hasAccount: false,
        isCurrent: currentChannel === channel,
        isPreferred: preferredChannel === channel,
        isPrimary: primaryChannel === channel,
        isFallback: fallbackChannel === channel,
        isLastUsed: false,
        canReply: false,
      };
      bucket.set(channel, { ...base, ...patch });
    };

    for (const id of identities) {
      upsert(id.channel, {
        hasIdentity: true,
        verified: id.verified,
        externalId: id.external_id,
        identityLastSeenAt: id.last_seen_at,
      });
    }
    for (const acc of accounts) {
      const ch = providerToChannel(acc.provider);
      if (!ch) continue;
      const st: ChannelStatus =
        acc.status === "active" ? "active" : acc.status === "degraded" ? "degraded" : "unavailable";
      const existing = bucket.get(ch);
      // Prefer the account whose status is best, then is_default.
      const better =
        !existing?.hasAccount ||
        (st === "active" && existing.status !== "active") ||
        (acc.is_default && !existing.accountId);
      if (better) {
        upsert(ch, {
          hasAccount: true,
          accountId: acc.id,
          status: st,
          statusReason: acc.status_reason,
        });
      }
    }
    for (const [ch, info] of Object.entries(lastUsed)) {
      const key = ch as InboxChannel;
      upsert(key, { lastUsedAt: info.at, lastMessageStatus: info.status });
    }
    // Always ensure the current channel is present, even without identity/account.
    if (currentChannel) upsert(currentChannel, {});

    // Compute canReply and lastUsed flag.
    const list = Array.from(bucket.values()).map((o) => ({
      ...o,
      canReply: o.hasAccount && o.status !== "unavailable",
    }));

    // Determine last-used-across-all-channels flag.
    let mostRecent: { channel: InboxChannel; at: string } | null = null;
    for (const o of list) {
      if (o.lastUsedAt && (!mostRecent || o.lastUsedAt > mostRecent.at)) {
        mostRecent = { channel: o.channel, at: o.lastUsedAt };
      }
    }
    return list
      .map((o) => ({ ...o, isLastUsed: mostRecent?.channel === o.channel }))
      .sort((a, b) => {
        // current > preferred > primary > has identity > verified > alpha
        const score = (x: ChannelOption) =>
          (x.isCurrent ? 100 : 0) +
          (x.isPreferred ? 40 : 0) +
          (x.isPrimary ? 30 : 0) +
          (x.isLastUsed ? 20 : 0) +
          (x.hasIdentity ? 8 : 0) +
          (x.canReply ? 4 : 0);
        return score(b) - score(a);
      });
  }, [
    conversation,
    identitiesQ.data,
    accountsQ.data,
    lastUsedQ.data,
    currentChannel,
    preferredChannel,
    primaryChannel,
    fallbackChannel,
  ]);

  const lastUsedChannel = options.find((o) => o.isLastUsed)?.channel ?? null;
  const currentOption = options.find((o) => o.isCurrent) ?? null;
  const hasFailure =
    !!currentOption &&
    (currentOption.status === "unavailable" ||
      currentOption.status === "degraded" ||
      currentOption.lastMessageStatus === "failed");

  const suggestedFallback = useMemo<ChannelOption | null>(() => {
    if (!hasFailure) return null;
    const explicit = fallbackChannel
      ? options.find((o) => o.channel === fallbackChannel && o.canReply)
      : null;
    if (explicit) return explicit;
    const preferred = options.find((o) => o.isPreferred && o.canReply && !o.isCurrent);
    if (preferred) return preferred;
    return options.find((o) => o.canReply && !o.isCurrent) ?? null;
  }, [hasFailure, options, fallbackChannel]);

  const qc = useQueryClient();

  const switchChannel = useMutation({
    mutationFn: async (target: ChannelOption) => {
      if (!conversation) throw new Error("No conversation");
      const prevMeta = (conversation.metadata ?? {}) as Record<string, unknown>;
      const nextMeta = {
        ...prevMeta,
        last_channel: conversation.channel,
        channel_switched_at: new Date().toISOString(),
      } as unknown as never;
      const { error } = await supabase
        .from("conversations")
        .update({
          channel: target.channel,
          channel_account_id: target.accountId ?? null,
          metadata: nextMeta,
        })
        .eq("id", conversation.id);
      if (error) throw error;
      return target;
    },
    onSuccess: (target) => {
      toast.success(`Now replying via ${target.label}`);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", conversation?.id] });
    },
    onError: (e) => toast.error(`Couldn't switch channel: ${(e as Error).message}`),
  });

  const setChannelRole = useMutation({
    mutationFn: async (args: {
      role: "preferred" | "primary" | "fallback";
      channel: InboxChannel;
      enabled: boolean;
    }) => {
      if (!conversation) throw new Error("No conversation");
      const key = `${args.role}_channel`;
      const prevMeta = (conversation.metadata ?? {}) as Record<string, unknown>;
      const nextMeta = { ...prevMeta };
      if (args.enabled) nextMeta[key] = args.channel;
      else delete nextMeta[key];
      const { error } = await supabase
        .from("conversations")
        .update({ metadata: nextMeta as unknown as never })
        .eq("id", conversation.id);
      if (error) throw error;
      return args;
    },
    onSuccess: ({ role, channel, enabled }) => {
      toast.success(
        enabled ? `Set ${CHANNEL_LABEL[channel] ?? channel} as ${role}` : `Removed ${role} channel`,
      );
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", conversation?.id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return {
    options,
    isLoading: identitiesQ.isLoading || accountsQ.isLoading,
    currentChannel,
    preferredChannel,
    primaryChannel,
    fallbackChannel,
    lastUsedChannel,
    hasFailure,
    suggestedFallback,
    switchChannel,
    setChannelRole,
  };
}

export { CHANNEL_LABEL };
