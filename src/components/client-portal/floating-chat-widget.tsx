import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, X, Send, Loader2, Minus, AlertCircle, RotateCw, Paperclip, Volume2, VolumeX, Maximize2, Minimize2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  getOrCreatePortalChat,
  getConversationDetail,
  markConversationRead,
  getMyConversationReadState,
} from "@/lib/client-portal/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { usePendingMessages } from "@/hooks/use-pending-messages";
import { usePortalAttachments } from "@/hooks/use-portal-attachments";
import { AttachmentPreviews, BubbleAttachments } from "@/components/client-portal/attachment-previews";
import { useBrandName } from "@/hooks/use-brand-name";

const STORAGE_KEY = "wacrm.portal.chat.open";
const SEEN_KEY_PREFIX = "wacrm.portal.chat.lastSeen.";
const BOOTSTRAPPED_KEY = "wacrm.portal.chat.bootstrapped";
const SOUND_KEY = "wacrm.portal.chat.sound";

export function FloatingChatWidget() {
  const brandName = useBrandName();
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [draft, setDraft] = useState("");
  const [lastSeenAt, setLastSeenAt] = useState<number>(0);
  const qc = useQueryClient();

  const initFn = useServerFn(getOrCreatePortalChat);
  const detailFn = useServerFn(getConversationDetail);
  const readFn = useServerFn(markConversationRead);
  const readStateFn = useServerFn(getMyConversationReadState);

  // Persist open state per browser
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setOpen(true);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, open ? "1" : "0"); } catch { /* ignore */ }
  }, [open]);

  // Once the visitor opens the widget for the first time, keep it "bootstrapped"
  // in this browser so we can silently poll for unread agent replies even while
  // the panel is closed on later visits.
  const [bootstrapped, setBootstrapped] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem(BOOTSTRAPPED_KEY) === "1") setBootstrapped(true); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (open && !bootstrapped) {
      setBootstrapped(true);
      try { localStorage.setItem(BOOTSTRAPPED_KEY, "1"); } catch { /* ignore */ }
    }
  }, [open, bootstrapped]);

  const initQ = useQuery({
    queryKey: ["portal-widget-chat"],
    queryFn: () => initFn({ data: undefined as unknown as never }),
    enabled: open || bootstrapped,
    staleTime: Infinity,
  });
  const conversationId = initQ.data?.id ?? null;

  const detailQ = useQuery({
    queryKey: ["portal-widget-conversation", conversationId],
    queryFn: () => detailFn({ data: { conversation_id: conversationId! } }),
    enabled: !!conversationId,
    refetchOnWindowFocus: true,
  });

  // Load last-seen watermark from the backend so the badge is accurate across
  // devices and sessions. Fall back to the cached localStorage value while the
  // request is in flight or offline, and refresh the cache on success.
  const readStateQ = useQuery({
    queryKey: ["portal-widget-read-state", conversationId],
    queryFn: () => readStateFn({ data: { conversation_ids: [conversationId!] } }),
    enabled: !!conversationId,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!conversationId) return;
    // Seed from local cache immediately.
    try {
      const raw = localStorage.getItem(SEEN_KEY_PREFIX + conversationId);
      if (raw) setLastSeenAt(Number(raw) || 0);
    } catch { /* ignore */ }
  }, [conversationId]);
  useEffect(() => {
    if (!conversationId) return;
    const iso = readStateQ.data?.[conversationId];
    if (!iso) return;
    const ts = new Date(iso).getTime();
    setLastSeenAt((prev) => (ts > prev ? ts : prev));
    try { localStorage.setItem(SEEN_KEY_PREFIX + conversationId, String(ts)); } catch { /* ignore */ }
  }, [conversationId, readStateQ.data]);

  // Realtime updates for this conversation — refresh detail (and thus unread
  // badge) instantly on any new/updated message or conversation row change.
  // Also listen to conversation_read_state so a read on another device clears
  // the badge here immediately.
  useEffect(() => {
    if (!conversationId) return;
    const invalidateDetail = () => {
      qc.invalidateQueries({ queryKey: ["portal-widget-conversation", conversationId] });
    };
    const invalidateReadState = () => {
      qc.invalidateQueries({ queryKey: ["portal-widget-read-state", conversationId] });
    };
    const ch = supabase.channel(`portal-widget-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, invalidateDetail)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` }, invalidateDetail)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_read_state", filter: `conversation_id=eq.${conversationId}` }, invalidateReadState)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);

  // Mark read + advance watermark (locally, in cache, and on the server) when opened
  useEffect(() => {
    if (open && conversationId) {
      const nowIso = new Date().toISOString();
      const now = Date.now();
      setLastSeenAt(now);
      try { localStorage.setItem(SEEN_KEY_PREFIX + conversationId, String(now)); } catch { /* ignore */ }
      readFn({ data: { conversation_id: conversationId, last_read_at: nowIso } })
        .then(() => qc.invalidateQueries({ queryKey: ["portal-widget-read-state", conversationId] }))
        .catch(() => 0);
    }
  }, [open, conversationId, readFn, qc]);


  const { pending, send, retry, discard, isSending } = usePendingMessages(
    conversationId,
    [["portal-widget-conversation", conversationId]],
  );
  const attachments = usePortalAttachments(conversationId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const body = draft.trim();
    if (!conversationId) return;
    const ready = attachments.consumeReady();
    if (!body && ready.length === 0) return;
    if (!attachments.canSend) return;
    send(body, ready);
    setDraft("");
  };

  const messages = detailQ.data?.messages ?? [];
  const agent = detailQ.data?.conversation.agent;

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, open]);

  // Unread = outbound (agent) messages newer than the local last-seen watermark,
  // ignored while the panel is open.
  const unread = open ? 0 : messages.reduce((n, m) => {
    if (m.direction !== "outbound" || m.deleted_at) return n;
    const t = new Date(m.created_at).getTime();
    return t > lastSeenAt ? n + 1 : n;
  }, 0);

  // Reflect unread in the document title so it's visible on background tabs.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const original = document.title.replace(/^\(\d+\+?\)\s+/, "");
    document.title = unread > 0 ? `(${unread > 9 ? "9+" : unread}) ${original}` : original;
    return () => { document.title = original; };
  }, [unread]);

  // Sound preference (per-browser). Defaults to ON so first-time visitors hear
  // new agent replies; toggle from the widget header persists to localStorage.
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem(SOUND_KEY);
      if (v === "0") setSoundOn(false);
    } catch { /* ignore */ }
  }, []);
  const toggleSound = () => {
    setSoundOn((prev) => {
      const next = !prev;
      try { localStorage.setItem(SOUND_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  // Play a subtle two-tone beep whenever a new outbound (agent) message arrives.
  // Uses WebAudio so there are no asset dependencies. Skipped on the initial
  // mount and while the visitor has muted the widget.
  const lastAgentIdRef = useRef<string | null>(null);
  const primedRef = useRef(false);
  useEffect(() => {
    const latestAgent = [...messages].reverse().find(
      (m) => m.direction === "outbound" && !m.deleted_at,
    );
    if (!latestAgent) return;
    if (!primedRef.current) {
      primedRef.current = true;
      lastAgentIdRef.current = latestAgent.id;
      return;
    }
    if (latestAgent.id === lastAgentIdRef.current) return;
    lastAgentIdRef.current = latestAgent.id;
    if (!soundOn) return;
    try {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const now = ctx.currentTime;
      const play = (freq: number, start: number, dur = 0.18) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      };
      play(660, 0);
      play(880, 0.12);
      setTimeout(() => ctx.close().catch(() => 0), 500);
    } catch { /* browser blocked or unsupported — silent */ }
  }, [messages, soundOn]);




  return (
    <>
      {/* Bubble */}
      {!open && (
        <button
          type="button"
          aria-label={unread > 0 ? `Open live chat, ${unread} unread message${unread === 1 ? "" : "s"}` : "Open live chat"}
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg grid place-items-center hover:scale-105 transition-transform"
        >
          <MessageCircle className="w-6 h-6" />
          {unread > 0 && (
            <>
              <span aria-hidden className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 animate-ping rounded-full bg-destructive/60" />
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold grid place-items-center ring-2 ring-background">
                {unread > 9 ? "9+" : unread}
              </span>
            </>
          )}
        </button>
      )}


      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Live chat"
          className={cn(
            "fixed z-40 bg-surface border border-border shadow-2xl flex flex-col overflow-hidden transition-all duration-200",
            "bottom-0 right-0 left-0 h-[85dvh] rounded-t-2xl",
            maximized
              ? "sm:inset-4 sm:bottom-4 sm:right-4 sm:top-4 sm:left-4 sm:h-auto sm:w-auto sm:rounded-control"
              : "sm:bottom-5 sm:right-5 sm:left-auto sm:top-auto sm:h-[600px] sm:w-[420px] sm:rounded-control",
          )}
        >

          {/* Header */}
          <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-primary text-primary-foreground">
            <div className="w-9 h-9 rounded-full bg-primary-foreground/15 grid place-items-center shrink-0">
              {agent?.avatar_url ? (
                <img src={agent.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">
                {agent?.display_name ?? "Support team"}
              </p>
              <p className="text-[11px] opacity-80 truncate">
                {agent ? "Typically replies within a few minutes" : "We'll reply as soon as possible"}
              </p>
            </div>
            <button
              type="button"
              aria-label={soundOn ? "Mute notification sound" : "Unmute notification sound"}
              aria-pressed={soundOn}
              title={soundOn ? "Mute notification sound" : "Unmute notification sound"}
              onClick={toggleSound}
              className="p-1.5 rounded-control hover:bg-primary-foreground/15"
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              aria-label={maximized ? "Restore chat size" : "Live Chat"}
              aria-pressed={maximized}
              title={maximized ? "Restore" : "Maximize"}
              onClick={() => setMaximized((v) => !v)}
              className="p-1.5 rounded-control hover:bg-primary-foreground/15 hidden sm:inline-flex"
            >
              {maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              aria-label="Minimize chat"
              onClick={() => { setOpen(false); setMaximized(false); }}
              className="p-1.5 rounded-control hover:bg-primary-foreground/15"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-control hover:bg-primary-foreground/15 sm:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0 px-3 py-4 space-y-2 bg-background/40">
            {initQ.isLoading || detailQ.isLoading ? (
              <div className="h-full grid place-items-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : initQ.error || detailQ.error ? (
              <p className="text-sm text-destructive p-3">
                Chat is unavailable right now. Please try again shortly.
              </p>
            ) : messages.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8 px-4">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium text-foreground mb-1">Say hello 👋</p>
                <p>Start the conversation — we usually reply within a few minutes.</p>
              </div>
            ) : (
              messages.map((m) => {
                const isCustomer = m.direction === "inbound";
                const atts = (detailQ.data?.attachments ?? []).filter((a) => a.message_id === m.id);
                return (
                  <div key={m.id} className={cn("flex", isCustomer ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-control px-3 py-2 text-sm shadow-sm animate-in fade-in slide-in-from-bottom-1",
                      isCustomer
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-surface border border-border rounded-bl-sm",
                    )}>
                      {m.deleted_at ? (
                        <p className="italic opacity-70">This message was deleted</p>
                      ) : (
                        <>
                          {atts.length > 0 && (
                            <BubbleAttachments
                              attachments={atts.map((a) => ({
                                id: a.id, url: a.url, mime_type: a.mime_type,
                                file_name: a.file_name, thumb: a.thumbnail_url,
                              }))}
                              onOwnBubble={isCustomer}
                            />
                          )}
                          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                          <p className={cn(
                            "text-[11px] mt-1",
                            isCustomer ? "text-primary-foreground/70 text-right" : "text-muted-foreground",
                          )}>
                            {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {pending.map((p) => (
              <div key={p.tempId} className="flex justify-end">
                <div className={cn(
                  "max-w-[80%] rounded-control rounded-br-sm px-3 py-2 text-sm shadow-sm bg-primary text-primary-foreground animate-in fade-in slide-in-from-bottom-1",
                  p.status === "failed" && "opacity-90 ring-1 ring-destructive/60",
                )}>
                  {p.attachments.length > 0 && (
                    <BubbleAttachments
                      attachments={p.attachments.map((a) => ({
                        tempId: a.storage_path, url: a.preview_url, mime_type: a.mime_type, file_name: a.file_name,
                      }))}
                      onOwnBubble
                    />
                  )}
                  {p.body && <p className="whitespace-pre-wrap break-words">{p.body}</p>}
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-primary-foreground/80 justify-end">
                    {p.status === "sending" ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /><span>Sending</span></>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3" />
                        <span>Not sent</span>
                        <button
                          type="button"
                          onClick={() => retry(p.tempId)}
                          className="inline-flex items-center gap-0.5 underline hover:no-underline"
                        >
                          <RotateCw className="w-3 h-3" /> Retry
                        </button>
                        <button
                          type="button"
                          onClick={() => discard(p.tempId)}
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

          {/* Composer */}
          <AttachmentPreviews
            items={attachments.items}
            onRemove={attachments.remove}
            onRetry={attachments.retry}
            compact
          />
          <div className="border-t border-border p-2.5 flex items-end gap-2">
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
              size="icon"
              variant="ghost"
              className="h-10 w-10 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={!conversationId || attachments.items.length >= 10}
              aria-label="Attach files"
              title="Attach files"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && conversationId) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Write a message"
              rows={1}
              className="resize-none min-h-[40px] max-h-32 text-sm"
              disabled={!conversationId}
            />
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={submit}
              disabled={!conversationId || (!draft.trim() && !attachments.anyReady) || attachments.anyUploading || !attachments.canSend}
              aria-label="Send message"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>


          <div className="px-3 pb-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <Link to="/client/conversations" className="hover:text-foreground underline-offset-2 hover:underline">
              Open full inbox
            </Link>
            <span>Powered by {brandName}</span>
          </div>
        </div>
      )}
    </>
  );
}
