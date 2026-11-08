import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Send,
  Search,
  MessageCircle,
  Instagram,
  Mail,
  MessageSquare,
  Phone,
  Globe,
  Radio,
  Paperclip,
  Image as ImageIcon,
  Mic,
  FileText,
  Sparkles,
  StickyNote,
  CheckCheck,
  Check,
  AlertCircle,
  Clock,
  User as UserIcon,
  Filter,
  Calendar as CalendarIcon,
  X,
  RotateCw,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  listMyConversations,
  getConversationDetail,
  addConversationNote,
  markConversationRead,
} from "@/lib/client-portal/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePendingMessages, type PendingMessage } from "@/hooks/use-pending-messages";
import { usePortalAttachments } from "@/hooks/use-portal-attachments";
import {
  AttachmentPreviews,
  BubbleAttachments,
} from "@/components/client-portal/attachment-previews";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/client/conversations")({
  component: ConversationsPage,
});

type Channel = "whatsapp" | "instagram" | "messenger" | "telegram" | "email" | "livechat" | "sms";
type StatusFilter = "open" | "pending" | "resolved" | "snoozed";

const CHANNEL_META: Record<
  Channel,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "text-emerald-600 bg-emerald-500/10" },
  instagram: { label: "Instagram", icon: Instagram, color: "text-pink-600 bg-pink-500/10" },
  messenger: { label: "Messenger", icon: MessageSquare, color: "text-blue-600 bg-blue-500/10" },
  telegram: { label: "Telegram", icon: Send, color: "text-sky-600 bg-sky-500/10" },
  email: { label: "Email", icon: Mail, color: "text-amber-600 bg-amber-500/10" },
  livechat: { label: "Live Chat", icon: Globe, color: "text-primary bg-primary/10" },
  sms: { label: "SMS", icon: Phone, color: "text-slate-600 bg-slate-500/10" },
};

// Underlying DB channel value (webchat) mapped to portal channel key
function toPortalChannel(raw: string | null | undefined): Channel {
  if (!raw) return "livechat";
  if (raw === "webchat") return "livechat";
  if (raw in CHANNEL_META) return raw as Channel;
  return "livechat";
}

function ConversationsPage() {
  const listFn = useServerFn(listMyConversations);
  const detailFn = useServerFn(getConversationDetail);
  const noteFn = useServerFn(addConversationNote);
  const readFn = useServerFn(markConversationRead);
  const qc = useQueryClient();

  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [status, setStatus] = useState<StatusFilter | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  type DateRange = { from?: Date; to?: Date };
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const listArgs = useMemo(() => {
    const from = dateRange.from ? new Date(dateRange.from) : undefined;
    if (from) from.setHours(0, 0, 0, 0);
    const to = dateRange.to ? new Date(dateRange.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    return {
      q: debouncedQ || undefined,
      channel: channel === "all" ? undefined : channel,
      status: status === "all" ? undefined : status,
      from: from?.toISOString(),
      to: to?.toISOString(),
      unread_only: unreadOnly || undefined,
      limit: 100,
    };
  }, [debouncedQ, channel, status, dateRange, unreadOnly]);

  const listQ = useQuery({
    queryKey: ["portal-conversations", listArgs],
    queryFn: () => listFn({ data: listArgs }),
  });

  const detailQ = useQuery({
    queryKey: ["portal-conversation", selected],
    queryFn: () => detailFn({ data: { conversation_id: selected! } }),
    enabled: !!selected,
  });

  // Auto-select first conversation
  useEffect(() => {
    if (!selected && listQ.data && listQ.data.length > 0) setSelected(listQ.data[0].id);
  }, [listQ.data, selected]);

  // Mark read + realtime subscription on the selected conversation.
  // Optimistically zero the unread badge everywhere so the UI clears instantly,
  // then persist server-side and invalidate to reconcile.
  useEffect(() => {
    if (!selected) return;
    // Optimistic: clear unread on the selected row in every cached list query.
    qc.setQueriesData<Array<{ id: string; unread_count?: number | null }>>(
      { queryKey: ["portal-conversations"] },
      (old) => old?.map((c) => (c.id === selected ? { ...c, unread_count: 0 } : c)) ?? old,
    );
    readFn({ data: { conversation_id: selected, last_read_at: new Date().toISOString() } })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["portal-conversations"] });
        qc.invalidateQueries({ queryKey: ["portal-widget-read-state", selected] });
      })
      .catch(() => 0);
    const ch = supabase
      .channel(`portal-conv-${selected}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selected}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["portal-conversation", selected] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${selected}` },
        () => {
          qc.invalidateQueries({ queryKey: ["portal-conversation", selected] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selected, qc, readFn]);

  // Realtime subscription for the conversation list — refresh instantly on
  // any conversation change (unread_count triggers) or new message insert so
  // list badges stay live without polling.
  useEffect(() => {
    const invalidateList = () => {
      qc.invalidateQueries({ queryKey: ["portal-conversations"] });
    };
    const ch = supabase
      .channel("portal-conv-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        invalidateList,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        invalidateList,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const { pending, send, retry, discard, isSending } = usePendingMessages(selected, [
    ["portal-conversation", selected],
    ["portal-conversations"],
  ]);
  const attachments = usePortalAttachments(selected);

  const submitReply = () => {
    const body = draft.trim();
    if (!selected) return;
    const ready = attachments.consumeReady();
    if (!body && ready.length === 0) return;
    if (!attachments.canSend) return;
    send(body, ready);
    setDraft("");
  };

  const noteMut = useMutation({
    mutationFn: (body: string) => noteFn({ data: { conversation_id: selected!, body } }),
    onSuccess: () => {
      toast.success("Note saved");
      qc.invalidateQueries({ queryKey: ["portal-conversation", selected] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convs = listQ.data ?? [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px] gap-4 h-[calc(100vh-160px)]">
      {/* ---------- Left: filters + list ---------- */}
      <aside className="rounded-control border border-border bg-surface flex flex-col min-h-0">
        <div className="p-3 border-b border-border space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search conversations"
              className="pl-8 h-9"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <FilterChip active={channel === "all"} onClick={() => setChannel("all")}>
              All
            </FilterChip>
            {(Object.keys(CHANNEL_META) as Channel[]).map((c) => {
              const M = CHANNEL_META[c];
              return (
                <FilterChip key={c} active={channel === c} onClick={() => setChannel(c)}>
                  <M.icon className="w-3 h-3" /> {M.label}
                </FilterChip>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "open", "pending", "resolved", "snoozed"] as const).map((s) => (
              <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
                <span className="capitalize">{s}</span>
              </FilterChip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { key: "1d", label: "24h", days: 1 },
                { key: "7d", label: "7 days", days: 7 },
                { key: "30d", label: "30 days", days: 30 },
                { key: "90d", label: "90 days", days: 90 },
              ] as const
            ).map((r) => {
              const from = new Date();
              from.setDate(from.getDate() - r.days);
              const active =
                dateRange.from?.toDateString() === from.toDateString() && !dateRange.to;
              return (
                <FilterChip
                  key={r.key}
                  active={active}
                  onClick={() => setDateRange(active ? {} : { from })}
                >
                  <Clock className="w-3 h-3" /> {r.label}
                </FilterChip>
              );
            })}
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] border transition",
                    dateRange.from || dateRange.to
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted",
                  )}
                >
                  <CalendarIcon className="w-3 h-3" />
                  {dateRange.from && dateRange.to
                    ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d")}`
                    : dateRange.from
                      ? `From ${format(dateRange.from, "MMM d, yyyy")}`
                      : "Custom range"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange.from ? { from: dateRange.from, to: dateRange.to } : undefined}
                  onSelect={(r) => setDateRange({ from: r?.from, to: r?.to })}
                  numberOfMonths={2}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
                <div className="flex justify-between border-t border-border p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDateRange({});
                    }}
                  >
                    Clear
                  </Button>
                  <Button size="sm" onClick={() => setDateOpen(false)}>
                    Done
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            {(dateRange.from || dateRange.to) && (
              <button
                type="button"
                aria-label="Clear date range"
                onClick={() => setDateRange({})}
                className="inline-flex items-center rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <Label
              htmlFor="unread-only-toggle"
              className="text-xs text-muted-foreground cursor-pointer"
            >
              Unread only
            </Label>
            <Switch id="unread-only-toggle" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {listQ.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading
            </div>
          ) : convs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Filter className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No conversations match your filters.
            </div>
          ) : (
            convs.map((c) => {
              const ch = toPortalChannel(c.channel);
              const M = CHANNEL_META[ch];
              const active = selected === c.id;
              const unread = (c.unread_count ?? 0) > 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  aria-label={
                    unread
                      ? `${c.subject ?? M.label}, ${c.unread_count} unread`
                      : (c.subject ?? M.label)
                  }
                  className={cn(
                    "w-full text-left px-3 py-3 border-b border-border/40 hover:bg-background transition group relative",
                    active && "bg-background",
                    unread && !active && "bg-primary/[0.04]",
                  )}
                >
                  {unread && (
                    <span
                      aria-hidden
                      className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary"
                    />
                  )}
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        "relative w-8 h-8 rounded-control grid place-items-center shrink-0",
                        M.color,
                      )}
                    >
                      <M.icon className="w-4 h-4" />
                      {unread && (
                        <span
                          aria-hidden
                          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-destructive ring-2 ring-surface"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={cn(
                            "text-sm truncate flex-1",
                            unread ? "font-semibold text-foreground" : "font-medium",
                          )}
                        >
                          {c.subject ?? M.label}
                        </p>
                        <span
                          className={cn(
                            "text-[11px] shrink-0",
                            unread ? "text-primary font-medium" : "text-muted-foreground",
                          )}
                        >
                          {c.last_message_at ? relTime(c.last_message_at) : ""}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "text-xs truncate mt-0.5",
                          unread ? "text-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        {c.last_message_preview ?? "—"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <StatusPill status={c.status} />
                        {unread && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold min-w-[18px] text-center">
                            {(c.unread_count ?? 0) > 9 ? "9+" : c.unread_count}
                          </span>
                        )}
                        {c.agent && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            · {c.agent.display_name ?? "Agent"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ---------- Center: timeline ---------- */}
      <section className="rounded-control border border-border bg-surface flex flex-col min-h-0 overflow-hidden">
        {!selected ? (
          <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
            Select a conversation to view messages
          </div>
        ) : detailQ.isLoading || !detailQ.data ? (
          <div className="flex-1 grid place-items-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ConversationView
            detail={detailQ.data}
            draft={draft}
            setDraft={setDraft}
            onSend={submitReply}
            sending={isSending}
            pending={pending}
            onRetry={retry}
            onDiscard={discard}
            attachments={attachments}
          />
        )}
      </section>

      {/* ---------- Right: side panel ---------- */}
      <aside className="hidden xl:flex rounded-control border border-border bg-surface flex-col min-h-0 overflow-hidden">
        {selected && detailQ.data ? (
          <SidePanel
            detail={detailQ.data}
            onAddNote={(body) => noteMut.mutate(body)}
            adding={noteMut.isPending}
          />
        ) : (
          <div className="flex-1 grid place-items-center text-sm text-muted-foreground p-6 text-center">
            Details, attachments, AI summary and notes will appear here.
          </div>
        )}
      </aside>
    </div>
  );
}

/* ---------------- Timeline ---------------- */

function ConversationView({
  detail,
  draft,
  setDraft,
  onSend,
  sending,
  pending,
  onRetry,
  onDiscard,
  attachments,
}: {
  detail: NonNullable<ReturnType<typeof useConversationDetailShape>>;
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  pending: PendingMessage[];
  onRetry: (tempId: string) => void;
  onDiscard: (tempId: string) => void;
  attachments: ReturnType<typeof usePortalAttachments>;
}) {
  const fmtZoned = useZonedDateFormatter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail.messages.length, pending.length]);

  const ch = toPortalChannel(detail.conversation.channel);
  const M = CHANNEL_META[ch];

  const sendDisabled =
    sending ||
    (!draft.trim() && !attachments.anyReady) ||
    attachments.anyUploading ||
    !attachments.canSend;

  return (
    <>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className={cn("w-9 h-9 grid place-items-center shrink-0", M.color)}>
          <M.icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{detail.conversation.subject ?? M.label}</p>
            <StatusPill status={detail.conversation.status} />
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {M.label}
            {detail.conversation.agent &&
              ` · with ${detail.conversation.agent.display_name ?? "Agent"}`}
          </p>
        </div>
      </header>

      <div
        className="flex-1 overflow-y-auto min-h-0 px-4 py-6 space-y-3 bg-background/40"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer?.files?.length) void attachments.add(e.dataTransfer.files);
        }}
      >
        {detail.messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-10">No messages yet.</div>
        ) : (
          detail.messages.map((m) => {
            const isCustomer = m.direction === "inbound";
            const attachmentsForMsg = detail.attachments.filter((a) => a.message_id === m.id);
            return (
              <div key={m.id} className={cn("flex", isCustomer ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-control px-3.5 py-2 text-sm shadow-sm animate-in fade-in slide-in-from-bottom-1",
                    isCustomer
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-surface border border-border rounded-bl-sm",
                  )}
                >
                  {m.deleted_at ? (
                    <p className="italic opacity-70">This message was deleted</p>
                  ) : (
                    <>
                      <MessageMedia msg={m} attachments={attachmentsForMsg} />
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      <div
                        className={cn(
                          "flex items-center gap-1 mt-1 text-[11px]",
                          isCustomer
                            ? "text-primary-foreground/80 justify-end"
                            : "text-muted-foreground",
                        )}
                      >
                        {m.edited_at && <span className="italic">edited</span>}
                        <span>
                          {fmtZoned(new Date(m.created_at), {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {isCustomer && <StatusTick status={m.status} />}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        {pending.map((p) => (
          <div key={p.tempId} className="flex justify-end">
            <div
              className={cn(
                "max-w-[75%] rounded-control rounded-br-sm px-3.5 py-2 text-sm shadow-sm bg-primary text-primary-foreground animate-in fade-in slide-in-from-bottom-1",
                p.status === "failed" && "ring-1 ring-destructive/60",
              )}
            >
              {p.attachments.length > 0 && (
                <BubbleAttachments
                  attachments={p.attachments.map((a) => ({
                    tempId: a.storage_path,
                    url: a.preview_url,
                    mime_type: a.mime_type,
                    file_name: a.file_name,
                  }))}
                  onOwnBubble
                />
              )}
              {p.body && <p className="whitespace-pre-wrap break-words">{p.body}</p>}
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-primary-foreground/80 justify-end">
                {p.status === "sending" ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Sending</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    <span title={p.error}>Not sent</span>
                    <button
                      type="button"
                      onClick={() => onRetry(p.tempId)}
                      className="inline-flex items-center gap-0.5 underline hover:no-underline"
                    >
                      <RotateCw className="w-3 h-3" /> Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => onDiscard(p.tempId)}
                      className="underline hover:no-underline"
                    >
                      Discard
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <AttachmentPreviews
        items={attachments.items}
        onRemove={attachments.remove}
        onRetry={attachments.retry}
      />
      <div className="border-t border-border p-3 flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void attachments.add(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={attachments.items.length >= 10}
          aria-label="Attach files"
          title="Attach files"
        >
          <Paperclip className="w-4 h-4" />
        </Button>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Reply"
          rows={1}
          className="resize-none min-h-[40px] max-h-32"
        />
        <Button onClick={onSend} disabled={sendDisabled} className="h-10">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </>
  );
}

function useConversationDetailShape() {
  // Compile-time helper only — used for typing the ConversationView prop.
  return null as unknown as Awaited<ReturnType<typeof getConversationDetail>>;
}

/* ---------------- Side panel ---------------- */

function SidePanel({
  detail,
  onAddNote,
  adding,
}: {
  detail: NonNullable<ReturnType<typeof useConversationDetailShape>>;
  onAddNote: (body: string) => void;
  adding: boolean;
}) {
  const fmtZoned = useZonedDateFormatter();
  const [note, setNote] = useState("");
  const media = detail.attachments.filter(
    (a) => (a.mime_type ?? "").startsWith("image/") || (a.mime_type ?? "").startsWith("video/"),
  );
  const voice = detail.attachments.filter((a) => (a.mime_type ?? "").startsWith("audio/"));
  const docs = detail.attachments.filter((a) => {
    const m = a.mime_type ?? "";
    return !m.startsWith("image/") && !m.startsWith("video/") && !m.startsWith("audio/");
  });

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {/* Agent */}
      <Panel title="Assigned agent" icon={UserIcon}>
        {detail.conversation.agent ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted overflow-hidden grid place-items-center">
              {detail.conversation.agent.avatar_url ? (
                <img
                  src={detail.conversation.agent.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {detail.conversation.agent.display_name ?? "Agent"}
              </p>
              {detail.conversation.agent.job_title && (
                <p className="text-xs text-muted-foreground truncate">
                  {detail.conversation.agent.job_title}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Awaiting assignment</p>
        )}
      </Panel>

      {/* AI Summary */}
      {(detail.intelligence?.summary || detail.conversation.ai_summary) && (
        <Panel title="AI summary" icon={Sparkles}>
          <p className="text-sm leading-relaxed text-foreground/90">
            {detail.intelligence?.summary ?? detail.conversation.ai_summary}
          </p>
          {detail.intelligence?.key_points && detail.intelligence.key_points.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground list-disc list-inside">
              {detail.intelligence.key_points.slice(0, 5).map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          {detail.intelligence && (
            <div className="flex flex-wrap gap-1 mt-3">
              {detail.intelligence.sentiment && (
                <Badge variant="outline" className="text-[11px] capitalize">
                  {detail.intelligence.sentiment}
                </Badge>
              )}
              {detail.intelligence.intent && (
                <Badge variant="outline" className="text-[11px] capitalize">
                  {detail.intelligence.intent}
                </Badge>
              )}
              {detail.intelligence.urgency && (
                <Badge variant="outline" className="text-[11px] capitalize">
                  {detail.intelligence.urgency} urgency
                </Badge>
              )}
            </div>
          )}
        </Panel>
      )}

      {/* Media */}
      {media.length > 0 && (
        <Panel title={`Media (${media.length})`} icon={ImageIcon}>
          <div className="grid grid-cols-3 gap-1.5">
            {media.slice(0, 9).map((a) => (
              <a
                key={a.id}
                href={a.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="aspect-square rounded-control bg-muted overflow-hidden border border-border hover:opacity-90"
              >
                {(a.thumbnail_url || a.url) && (a.mime_type ?? "").startsWith("image/") ? (
                  <img
                    src={a.thumbnail_url ?? a.url ?? ""}
                    alt={a.file_name ?? ""}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-muted-foreground">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                )}
              </a>
            ))}
          </div>
        </Panel>
      )}

      {/* Voice notes */}
      {voice.length > 0 && (
        <Panel title={`Voice notes (${voice.length})`} icon={Mic}>
          <ul className="space-y-2">
            {voice.map((a) => (
              <li key={a.id}>
                <audio controls className="w-full h-9">
                  <source src={a.url ?? ""} type={a.mime_type ?? "audio/mpeg"} />
                </audio>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Attachments */}
      {docs.length > 0 && (
        <Panel title={`Attachments (${docs.length})`} icon={Paperclip}>
          <ul className="space-y-1.5">
            {docs.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm hover:text-primary group"
                >
                  <FileText className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                  <span className="truncate flex-1">{a.file_name ?? "File"}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtBytes(a.size_bytes)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Notes */}
      <Panel title="My notes" icon={StickyNote}>
        <div className="space-y-2 mb-3">
          {detail.notes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No notes yet.</p>
          ) : (
            detail.notes.map((n) => (
              <div key={n.id} className="text-xs bg-muted/50 border border-border rounded-control p-2.5">
                <p className="whitespace-pre-wrap">{n.body.replace(/^customer:\s*/i, "")}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {fmtZoned(new Date(n.created_at), { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a private note"
            rows={2}
            className="resize-none text-sm"
          />
          <Button
            size="sm"
            onClick={() => {
              if (note.trim()) {
                onAddNote(note.trim());
                setNote("");
              }
            }}
            disabled={!note.trim() || adding}
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="p-4 border-b border-border last:border-b-0">
      <h4 className="text-[11px] font-semibold uppercase   text-muted-foreground mb-3 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h4>
      {children}
    </section>
  );
}

/* ---------------- Bits ---------------- */

function MessageMedia({
  msg,
  attachments,
}: {
  msg: {
    message_type: string | null;
    media_url: string | null;
    media_type: string | null;
    media_thumbnail_url: string | null;
    media_duration_seconds: number | null;
  };
  attachments: Array<{
    id: string;
    url: string | null;
    mime_type: string | null;
    file_name: string | null;
    thumbnail_url: string | null;
  }>;
}) {
  const items: Array<{
    id: string;
    url: string | null;
    mime_type: string | null;
    thumb: string | null;
    name: string | null;
  }> = [];
  if (attachments.length) {
    for (const a of attachments)
      items.push({
        id: a.id,
        url: a.url,
        mime_type: a.mime_type,
        thumb: a.thumbnail_url,
        name: a.file_name,
      });
  } else if (msg.media_url) {
    items.push({
      id: "inline",
      url: msg.media_url,
      mime_type: msg.media_type,
      thumb: msg.media_thumbnail_url,
      name: null,
    });
  }
  if (!items.length) return null;
  return (
    <div className="mb-1.5 space-y-1.5">
      {items.map((a) => {
        const m = a.mime_type ?? "";
        if (m.startsWith("image/")) {
          return (
            <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer">
              <img
                src={a.thumb ?? a.url ?? ""}
                alt=""
                className="rounded-control max-h-64 object-cover"
              />
            </a>
          );
        }
        if (m.startsWith("video/")) {
          return (
            <video key={a.id} src={a.url ?? ""} controls className="rounded-control max-h-64 w-full" />
          );
        }
        if (m.startsWith("audio/")) {
          return <audio key={a.id} src={a.url ?? ""} controls className="w-full h-9" />;
        }
        return (
          <a
            key={a.id}
            href={a.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-control bg-black/10 hover:bg-black/20"
          >
            <FileText className="w-3.5 h-3.5" />{" "}
            <span className="truncate">{a.name ?? "File"}</span>
          </a>
        );
      })}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 h-7 px-2 rounded-control text-[11px] border transition",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-transparent border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const s = (status ?? "open").toLowerCase();
  const map: Record<
    string,
    { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
  > = {
    open: {
      label: "Open",
      className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      icon: Radio,
    },
    pending: {
      label: "Pending",
      className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      icon: Clock,
    },
    resolved: {
      label: "Resolved",
      className: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
      icon: CheckCheck,
    },
    snoozed: {
      label: "Snoozed",
      className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
      icon: Clock,
    },
  };
  const c = map[s] ?? map.open;
  const I = c.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-control font-medium",
        c.className,
      )}
    >
      <I className="w-2.5 h-2.5" /> {c.label}
    </span>
  );
}

function StatusTick({ status }: { status: string | null }) {
  const s = (status ?? "").toLowerCase();
  if (s === "read") return <CheckCheck className="w-3 h-3" />;
  if (s === "delivered") return <CheckCheck className="w-3 h-3 opacity-70" />;
  if (s === "sent") return <Check className="w-3 h-3 opacity-70" />;
  if (s === "failed") return <AlertCircle className="w-3 h-3 text-destructive" />;
  return <Clock className="w-3 h-3 opacity-60" />;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const s = Math.round(diff / 1000);
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function fmtBytes(b: number | null | undefined): string {
  if (!b) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
