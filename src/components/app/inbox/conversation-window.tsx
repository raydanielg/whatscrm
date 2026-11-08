import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useTenantTimezone } from "@/hooks/use-timezone";
import { isSameZonedDay } from "@/lib/datetime/timezone";

import { cn } from "@/lib/utils";

import { useMessages, useResumeQueuedMessages, type MessageRow } from "@/hooks/use-messages";
import {
  useTypingIndicators,
  useMarkAsRead,
  type ConversationRow,
} from "@/hooks/use-conversations";

import { useAuth } from "@/hooks/use-auth";
import { clearManualUnreadHold } from "@/lib/inbox/manual-unread";
import { MessageBubble, DayDivider, extractContactCards } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import { ForwardMessageDialog } from "./forward-message-dialog";
import { AssignMessageTaskDialog } from "./assign-message-task-dialog";
import { AddMessageNoteDialog } from "./add-message-note-dialog";
import { OfflineQueueBanner } from "./offline-queue-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { useMyProfile } from "@/hooks/use-profile";
import { resolveAppTimeFormat } from "@/lib/i18n/time-format";

type Props = {
  conversation: ConversationRow;
};

export function ConversationWindow({ conversation }: Props) {
  const { user } = useAuth();
  const { config: platform } = usePlatformRuntime();
  const { data: profile } = useMyProfile();
  const timeFormat = resolveAppTimeFormat(profile?.time_format, platform.localization.timeFormat);
  const { messages, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(
    conversation.id,
  );
  const safeMessages = Array.isArray(messages) ? messages : [];
  const { data: typing } = useTypingIndicators(conversation.id);
  const markRead = useMarkAsRead();
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [forwardTarget, setForwardTarget] = useState<MessageRow | null>(null);
  const [taskMessage, setTaskMessage] = useState<MessageRow | null>(null);
  const [noteMessage, setNoteMessage] = useState<MessageRow | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  // True while the viewport should stay pinned to the latest message —
  // set on conversation open/switch, cleared once the user scrolls away
  // from the bottom (e.g. to read older messages).
  const pinnedToBottomRef = useRef(true);
  const lastReadSyncRef = useRef<string | null>(null);
  // Anchor scroll position when older messages are prepended so the viewport
  // does not jump to the top on mobile.
  const preservedScrollRef = useRef<{ height: number; top: number } | null>(null);

  // Resume delivery for messages left stuck at `queued` (dropped send request).
  const resumeQueued = useResumeQueuedMessages();
  const resumeAttemptRef = useRef<string | null>(null);
  const stuckQueuedId = useMemo(() => {
    const cutoff = Date.now() - 20_000;
    const stuck = safeMessages.find(
      (m) =>
        m.direction === "outbound" &&
        m.status === "queued" &&
        !String(m.id).startsWith("temp-") &&
        new Date(m.created_at).getTime() < cutoff,
    );
    return stuck?.id ?? null;
  }, [safeMessages]);

  useEffect(() => {
    if (!stuckQueuedId) return;
    const key = `${conversation.id}:${stuckQueuedId}`;
    if (resumeAttemptRef.current === key) return;
    resumeAttemptRef.current = key;
    resumeQueued.mutate(conversation.id);
    // `resumeQueued` is a stable mutation object; retry is guarded by the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, stuckQueuedId]);

  const othersTyping = (Array.isArray(typing) ? typing : []).filter((t) => t.user_id !== user?.id);
  const latestInboundMessageId = useMemo(
    () =>
      safeMessages
        .slice()
        .reverse()
        .find((m) => m.direction === "inbound" && !m.is_internal)?.id ?? null,
    [safeMessages],
  );

  // Prefill candidates for the "Share contact" modal: most recent contact-card
  // attachment in the thread first, then the conversation's recipient.
  const contactPrefill = useMemo(() => {
    const seen = new Set<string>();
    const cards: {
      name?: string;
      phone?: string;
      email?: string;
      source: "attachment" | "recipient";
      existingContactId?: string | null;
    }[] = [];
    for (let i = safeMessages.length - 1; i >= 0; i--) {
      const m = safeMessages[i];
      if (!m?.metadata) continue;
      let extracted: {
        name?: string;
        phone?: string;
        email?: string;
        existingContactId?: string | null;
      }[] = [];
      try {
        extracted = extractContactCards(m.metadata);
      } catch {
        continue;
      }
      for (const c of extracted) {
        const k = `${c.name ?? ""}|${c.phone ?? ""}|${c.email ?? ""}`;
        if (seen.has(k)) continue;
        seen.add(k);
        cards.push({
          name: c.name,
          phone: c.phone,
          email: c.email,
          existingContactId: c.existingContactId ?? null,
          source: "attachment",
        });
      }
    }
    const c = conversation.contact;
    if (c) {
      const name =
        c.display_name ?? [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ?? undefined;
      const recipient = {
        name: name || undefined,
        phone: c.phone ?? undefined,
        email: c.email ?? undefined,
      };
      const k = `${recipient.name ?? ""}|${recipient.phone ?? ""}|${recipient.email ?? ""}`;
      if ((recipient.name || recipient.phone || recipient.email) && !seen.has(k)) {
        cards.push({
          ...recipient,
          source: "recipient",
          existingContactId: c.id ?? null,
        });
      }
    }
    return cards;
  }, [safeMessages, conversation.contact]);

  // Opening the thread again is an explicit read, even if it was just flagged
  // unread. Old delayed read requests from the previous mount remain guarded.
  useEffect(() => {
    clearManualUnreadHold(conversation.id);
  }, [conversation.id]);

  // Mark as read on open and when a new inbound message arrives while open.
  useEffect(() => {
    const readKey = `${conversation.id}:${latestInboundMessageId ?? "none"}`;
    const previousKey = lastReadSyncRef.current;
    const firstSyncForConversation = !previousKey?.startsWith(`${conversation.id}:`);
    const hasUnread = conversation.unread_count > 0;
    const hasNewInbound = !!latestInboundMessageId && readKey !== previousKey;

    if (!hasUnread && firstSyncForConversation) {
      lastReadSyncRef.current = readKey;
      return;
    }

    if (!hasUnread && !hasNewInbound) return;

    lastReadSyncRef.current = readKey;
    markRead.mutate({
      conversationId: conversation.id,
      optimisticConversation: conversation,
      assumeUnread: hasNewInbound,
    });

    // Run once more after webhook/conversation counters settle so an open
    // conversation cannot retain a late unread increment from the backend.
    // Deliberately NOT cancelled on unmount: navigating back to the list
    // (very common well under 900ms) used to cancel this via the effect's
    // cleanup, so a background list refetch landing between the optimistic
    // zero and the real DB commit could leave the row stuck showing the old
    // unread count with nothing left to correct it. The mutation itself
    // doesn't depend on this component staying mounted.
    const conversationId = conversation.id;
    window.setTimeout(() => markRead.mutate(conversationId), 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.unread_count, latestInboundMessageId]);

  // Switching conversations reuses this same mounted component — reset the
  // scroll bookkeeping so the next message-count effect treats the new
  // thread as a fresh load and jumps to the bottom instead of leaving the
  // scroll position (and `prevCountRef`) from the previously open thread.
  useLayoutEffect(() => {
    prevCountRef.current = 0;
    preservedScrollRef.current = null;
    pinnedToBottomRef.current = true;
  }, [conversation.id]);

  // Track whether the viewport is near the bottom so late-loading content
  // (images, embeds) doesn't yank the user down if they've scrolled up to
  // read older messages, but keeps pinning them to the latest message while
  // they haven't.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      pinnedToBottomRef.current = distanceFromBottom < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [conversation.id]);

  // Attachments (images, etc.) inside messages finish loading after the
  // initial render and grow the content height, which otherwise leaves the
  // viewport short of the true bottom. Re-pin to the latest message whenever
  // the content height changes while the user is still at the bottom.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (pinnedToBottomRef.current) {
        const scroller = scrollRef.current;
        scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "instant" });
      }
    });
    ro.observe(content);
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => ro.disconnect();
    // Re-attach once the message list actually mounts (it doesn't exist
    // yet during the loading-skeleton state), and whenever the message
    // count changes (new node to observe isn't needed, but keeps this
    // resilient if the content node is ever replaced).
  }, [conversation.id, isLoading, safeMessages.length]);

  // Auto-scroll on new messages (only if near bottom) and restore position
  // when older messages are prepended by the infinite loader.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || isLoading) return;
    const prevCount = prevCountRef.current;
    const isNew = safeMessages.length > prevCount;

    // Older-message prepend: restore the previous scroll offset from bottom.
    if (isNew && preservedScrollRef.current && prevCount > 0) {
      const { height, top } = preservedScrollRef.current;
      const delta = el.scrollHeight - height;
      if (delta > 0) el.scrollTo({ top: top + delta, behavior: "instant" });
      preservedScrollRef.current = null;
      prevCountRef.current = safeMessages.length;
      return;
    }

    if (isNew && pinnedToBottomRef.current) {
      // Pin this scroller immediately: smooth scrolling emits intermediate
      // positions that look like scrolling away and disable attachment pinning.
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
    }
    prevCountRef.current = safeMessages.length;
  }, [conversation.id, isLoading, safeMessages]);

  // Infinite scroll upward (load older). Snapshot scroll geometry BEFORE
  // fetching so the effect above can restore position after the prepend.
  useEffect(() => {
    const el = topSentinelRef.current;
    const scroller = scrollRef.current;
    if (!el || !scroller || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          preservedScrollRef.current = {
            height: scroller.scrollHeight,
            top: scroller.scrollTop,
          };
          fetchNextPage();
        }
      },
      { root: scroller, rootMargin: "160px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const tenantTimezone = useTenantTimezone();
  const groups = useMemo(
    () => groupByDay(safeMessages, tenantTimezone),
    [safeMessages, tenantTimezone],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 relative">
      <OfflineQueueBanner />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch] [overflow-anchor:none] px-3 sm:px-6 py-4 bg-chat-pattern"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 78% 58% at 18% 8%, color-mix(in oklab, var(--primary) 20%, transparent), transparent 68%)",
            "radial-gradient(ellipse 88% 72% at 82% 100%, color-mix(in oklab, var(--accent) 12%, transparent), #0000000d 72%)",
            "radial-gradient(color-mix(in oklab, var(--muted-foreground) 10%, transparent) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "auto, auto, 10px 10px",
        }}
      >
        <div ref={topSentinelRef} />
        {isFetchingNextPage && (
          <div className="text-center text-xs text-muted-foreground py-2">
            Loading earlier messages
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
                <Skeleton className="h-10 w-52 rounded-control" />
              </div>
            ))}
          </div>
        ) : safeMessages.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">
            No messages yet. Say hello 👋
          </div>
        ) : (
          <div ref={contentRef} className="space-y-2 max-w-4xl mx-auto">
            {groups.map((g) => (
              <div key={g.key}>
                <DayDivider date={g.date} />
                <div className="space-y-1.5">
                  {g.items.map((m, idx) => {
                    const prev = g.items[idx - 1];
                    const isOwn = m.direction === "outbound";
                    const sameSender =
                      prev && prev.direction === m.direction && prev.sent_by === m.sent_by;
                    return (
                      <MessageBubble
                        key={m.id}
                        message={m}
                        isOwn={isOwn}
                        showAvatar={!sameSender}
                        currentUserId={user?.id}
                        timeFormat={timeFormat}
                        contact={conversation.contact}
                        onReply={setReplyTo}
                        onForward={setForwardTarget}
                        onAssignTask={setTaskMessage}
                        onAddNote={setNoteMessage}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

            {othersTyping.length > 0 && (
              <div className="flex items-end gap-2 animate-fade-in">
                <div className="w-8" />
                <div className="bg-card border border-border rounded-control rounded-bl-md px-4 py-3 shadow-sm">
                  <TypingDots />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <MessageComposer
        conversationId={conversation.id}
        workspaceId={conversation.workspace_id}
        channel={conversation.channel}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        contactPrefill={contactPrefill}
        contactId={conversation.contact_id}
      />

      <ForwardMessageDialog
        open={!!forwardTarget}
        onOpenChange={(o) => !o && setForwardTarget(null)}
        message={forwardTarget}
        excludeConversationId={conversation.id}
      />

      <AssignMessageTaskDialog
        open={!!taskMessage}
        onOpenChange={(o) => !o && setTaskMessage(null)}
        message={taskMessage}
        conversation={conversation}
      />

      <AddMessageNoteDialog
        open={!!noteMessage}
        onOpenChange={(o) => !o && setNoteMessage(null)}
        message={noteMessage}
      />
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" />
    </div>
  );
}

function groupByDay(messages: MessageRow[], timezone: string) {
  const groups: { key: string; date: Date; items: MessageRow[] }[] = [];
  for (const m of messages) {
    const d = new Date(m.created_at);
    const last = groups[groups.length - 1];
    if (last && isSameZonedDay(last.date, d, timezone)) {
      last.items.push(m);
    } else {
      groups.push({ key: d.toDateString(), date: d, items: [m] });
    }
  }
  return groups;
}
