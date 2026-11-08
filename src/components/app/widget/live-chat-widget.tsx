/**
 * Live Chat Widget — the visitor-facing conversational UI.
 *
 * Supports text, emoji, images, documents, voice notes, quick replies,
 * drag & drop, offline queueing with automatic flush, connection status,
 * queue position on handoff, typing indicator, delivered/read receipts,
 * and a post-conversation rating.
 *
 * Runs unauthenticated against `/api/public/widget/*`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  X,
  Loader2,
  RotateCcw,
  Paperclip,
  Smile,
  Mic,
  History,
  Image as ImageIcon,
  FileText,
  StopCircle,
  WifiOff,
  Star,
  Minus,
  Maximize2,
  Minimize2,
  Check,
  CheckCheck,
  XCircle,
} from "lucide-react";
import { useWidgetRealtime } from "@/lib/widget/use-widget-realtime";
import { useMediaLightbox } from "@/components/ui/media-lightbox";
import { useBrandName } from "@/hooks/use-brand-name";

interface WidgetAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "document" | "audio";
}

interface WidgetMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  status?: "queued" | "sending" | "sent" | "delivered" | "read" | "failed";
  attachments?: WidgetAttachment[] | null;
  read_at?: string | null;
}

interface WidgetBotMeta {
  id: string;
  name: string;
  avatarUrl: string | null;
  welcomeMessage: string;
  greeting: string | null;
  quickReplies?: string[];
}

interface WidgetStatus {
  sessionId: string;
  status: string;
  handoff: boolean;
  handoffState: "ai" | "human" | "queued" | null;
  assignedTo: { id: string; name: string; avatar_url: string | null } | null;
  queuePosition: number | null;
  queueStatus: "waiting" | "assigned" | null;
  agentTyping?: boolean;
}

interface Props {
  chatbotId: string;
  accent?: string;
  compact?: boolean;
  isMaximized?: boolean;
  isMinimized?: boolean;
  onToggleMaximize?: () => void;
  onClose?: () => void;
}

const STORAGE_PREFIX = "wacrm.widget.";
const OUTBOX_PREFIX = "wacrm.widget.outbox.";
const EMOJIS = [
  "😀",
  "😁",
  "😂",
  "🤣",
  "😊",
  "😍",
  "🥰",
  "😘",
  "😎",
  "🤩",
  "🤔",
  "😴",
  "🙄",
  "😅",
  "😉",
  "🙂",
  "😢",
  "😭",
  "😡",
  "👍",
  "👎",
  "🙏",
  "👏",
  "💪",
  "🎉",
  "🔥",
  "❤️",
  "💯",
  "✅",
  "❌",
  "⭐",
  "☕",
];

function keyFor(chatbotId: string) {
  return `${STORAGE_PREFIX}${chatbotId}`;
}
function outboxKey(chatbotId: string) {
  return `${OUTBOX_PREFIX}${chatbotId}`;
}

interface OutboxItem {
  id: string;
  text: string;
  attachments?: WidgetAttachment[];
}

function readSession(chatbotId: string): { sessionId: string; visitorToken: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(chatbotId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSession(chatbotId: string, data: { sessionId: string; visitorToken: string } | null) {
  if (typeof window === "undefined") return;
  try {
    if (data) window.localStorage.setItem(keyFor(chatbotId), JSON.stringify(data));
    else window.localStorage.removeItem(keyFor(chatbotId));
  } catch {}
}
function readOutbox(chatbotId: string): OutboxItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(outboxKey(chatbotId)) ?? "[]");
  } catch {
    return [];
  }
}
function writeOutbox(chatbotId: string, items: OutboxItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(outboxKey(chatbotId), JSON.stringify(items));
  } catch {}
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export interface VisitorIdentity {
  name: string;
  email: string;
  phone: string;
}

const VISITOR_PREFIX = "wacrm.widget.visitor.";
function visitorKey(chatbotId: string) {
  return `${VISITOR_PREFIX}${chatbotId}`;
}

function readVisitor(chatbotId: string): VisitorIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(visitorKey(chatbotId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<VisitorIdentity>;
    return { name: v.name ?? "", email: v.email ?? "", phone: v.phone ?? "" };
  } catch {
    return null;
  }
}
function writeVisitor(chatbotId: string, v: VisitorIdentity | null) {
  if (typeof window === "undefined") return;
  try {
    if (v) window.localStorage.setItem(visitorKey(chatbotId), JSON.stringify(v));
    else window.localStorage.removeItem(visitorKey(chatbotId));
  } catch {}
}

/** Stable per-browser key so repeat visits map to a single visitor row. */
const BROWSER_KEY = "wacrm.widget.browserKey";
function readBrowserKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    let key = window.localStorage.getItem(BROWSER_KEY);
    if (!key) {
      key = `vk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(BROWSER_KEY, key);
    }
    return key;
  } catch {
    return undefined;
  }
}

function validateVisitor(v: VisitorIdentity): Partial<Record<keyof VisitorIdentity, string>> {
  const errors: Partial<Record<keyof VisitorIdentity, string>> = {};
  if (v.name.trim().length < 2) errors.name = "Please enter your full name";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim()))
    errors.email = "Please enter a valid email";
  const phone = v.phone.trim();
  if (!/^[+0-9()\s-]{6,32}$/.test(phone) || phone.replace(/\D/g, "").length < 6)
    errors.phone = "Please enter a valid phone number";
  return errors;
}
function isValidVisitor(v: VisitorIdentity | null): boolean {
  return Boolean(v) && Object.keys(validateVisitor(v as VisitorIdentity)).length === 0;
}

export function LiveChatWidget({
  chatbotId,
  accent = "#075E54",
  compact = false,
  isMaximized = false,
  isMinimized = false,
  onToggleMaximize,
  onClose,
}: Props) {
  const brandName = useBrandName();
  const [bot, setBot] = useState<WidgetBotMeta | null>(null);
  const [session, setSession] = useState<{ sessionId: string; visitorToken: string } | null>(() =>
    readSession(chatbotId),
  );
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sending" | "typing" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [handoffState, setHandoffState] = useState<WidgetStatus["handoffState"]>("ai");
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [assignedAgent, setAssignedAgent] = useState<WidgetStatus["assignedTo"] | null>(null);
  const [agentTyping, setAgentTyping] = useState(false);

  const [pendingAttachments, setPendingAttachments] = useState<WidgetAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [rating, setRating] = useState<number | null>(null);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingOpen, setRatingOpen] = useState(false);
  // Pre-chat identity (required before a session can start)
  const [visitor, setVisitor] = useState<VisitorIdentity>(
    () => readVisitor(chatbotId) ?? { name: "", email: "", phone: "" },
  );
  const [identified, setIdentified] = useState<boolean>(
    () => Boolean(readSession(chatbotId)) || isValidVisitor(readVisitor(chatbotId)),
  );
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof VisitorIdentity, string>>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Set by "New conversation"; the next session request asks the server for a fresh session.
  const startFreshRef = useRef(false);
  // The session the visitor is leaving, kept so the server can verify ownership.
  const freshFromRef = useRef<{ sessionId: string; visitorToken: string } | null>(null);
  // Past conversations of this visitor, shown in the "My conversations" panel.
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [conversations, setConversations] = useState<
    Array<{
      sessionId: string;
      visitorToken: string;
      status: string;
      createdAt: string;
      lastMessage: string | null;
      lastMessageAt: string | null;
    }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<number | null>(null);
  const dragCounter = useRef(0);
  const lastAnnouncedAgentIdRef = useRef<string | null>(null);
  const statusIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    if (compact && isMinimized) return;
    inputRef.current?.focus();
  }, [compact, isMinimized]);

  // Online/offline detection
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Merge server-side history into local state without dropping optimistic
  // messages that have not been persisted yet.
  const applyHistory = useCallback((rows: WidgetMessage[]) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    setMessages((prev) => {
      const server: WidgetMessage[] = rows.map((m) => ({
        ...m,
        status: (m.role === "user"
          ? m.read_at
            ? "read"
            : "delivered"
          : "sent") as WidgetMessage["status"],
      }));
      const serverUserText = new Set(
        server.filter((m) => m.role === "user").map((m) => m.content.trim()),
      );
      const pending = prev.filter(
        (m) =>
          (m.id.startsWith("tmp_") &&
            (m.status === "queued" || m.status === "sending" || m.status === "failed") &&
            !serverUserText.has(m.content.trim())) ||
          m.id.startsWith("agent_joined_"),
      );
      return [...server, ...pending];
    });
  }, []);

  // Poll status + transcript so the widget sees agent replies and handoff changes.
  const syncStatus = useCallback(
    async (sess: { sessionId: string; visitorToken: string }) => {
      const qs = `sessionId=${encodeURIComponent(sess.sessionId)}&visitorToken=${encodeURIComponent(sess.visitorToken)}`;
      try {
        const [statusRes, histRes] = await Promise.all([
          fetch(`/api/public/widget/status?${qs}`),
          fetch(`/api/public/widget/history?${qs}`),
        ]);

        if (histRes.ok) {
          const { messages: rows } = (await histRes.json()) as { messages: WidgetMessage[] };
          applyHistory(rows);
        }

        if (!statusRes.ok) return;
        const data = (await statusRes.json()) as WidgetStatus;
        setHandoff(data.handoff);
        setHandoffState(data.handoffState ?? (data.handoff ? "queued" : "ai"));
        setQueuePosition(data.queuePosition ?? null);
        setAssignedAgent(data.assignedTo ?? null);
        setAgentTyping(Boolean(data.agentTyping));

        if (data.assignedTo?.id && data.assignedTo.id !== lastAnnouncedAgentIdRef.current) {
          lastAnnouncedAgentIdRef.current = data.assignedTo.id;
          setMessages((m) =>
            m.some((x) => x.id === `agent_joined_${data.assignedTo!.id}`)
              ? m
              : [
                  ...m,
                  {
                    id: `agent_joined_${data.assignedTo!.id}`,
                    role: "assistant",
                    content: `${data.assignedTo!.name} joined the chat.`,
                    status: "sent",
                  },
                ],
          );
        }
      } catch {
        // Silently ignore — polling is best-effort.
      }
    },
    [applyHistory],
  );

  // Instant updates over Supabase Realtime; polling stays only as a fallback.
  const { connected: realtimeOn } = useWidgetRealtime(
    session?.sessionId ?? null,
    session?.visitorToken ?? null,
    () => {
      if (session) void syncStatus(session);
    },
  );

  useEffect(() => {
    if (!session || !online) return;
    void syncStatus(session);
    // With realtime connected we only need a slow safety-net refresh.
    const period = realtimeOn ? 60_000 : 5_000;
    statusIntervalRef.current = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void syncStatus(session);
    }, period);
    const refreshStatus = () => {
      if (document.visibilityState === "hidden") return;
      void syncStatus(session);
    };
    window.addEventListener("focus", refreshStatus);
    document.addEventListener("visibilitychange", refreshStatus);
    return () => {
      if (statusIntervalRef.current) window.clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
      window.removeEventListener("focus", refreshStatus);
      document.removeEventListener("visibilitychange", refreshStatus);
    };
  }, [session, online, syncStatus, realtimeOn]);

  // ---- Typing indicators -------------------------------------------------
  // Outgoing: throttled "visitor is typing" pings, auto-cleared after a pause.
  const typingSentAtRef = useRef(0);
  const typingStopTimerRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);

  const postTyping = useCallback(
    (typing: boolean) => {
      if (!session) return;
      void fetch("/api/public/widget/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          visitorToken: session.visitorToken,
          typing,
        }),
      }).catch(() => {
        /* best effort */
      });
    },
    [session],
  );

  const signalTyping = useCallback(() => {
    if (!session) return;
    const now = Date.now();
    if (!typingActiveRef.current || now - typingSentAtRef.current > 2500) {
      typingSentAtRef.current = now;
      typingActiveRef.current = true;
      postTyping(true);
    }
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      postTyping(false);
    }, 3000);
  }, [session, postTyping]);

  const stopTyping = useCallback(() => {
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      postTyping(false);
    }
  }, [postTyping]);

  useEffect(() => () => stopTyping(), [stopTyping]);

  // Incoming: expire the agent indicator if no refresh arrives.
  useEffect(() => {
    if (!agentTyping) return;
    const t = window.setTimeout(() => setAgentTyping(false), 8000);
    return () => window.clearTimeout(t);
  }, [agentTyping]);

  // Boot
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setStatus("loading");
      setErrorMsg(null);
      try {
        if (session) {
          const [metaRes, histRes] = await Promise.all([
            fetch(`/api/public/widget/session?chatbotId=${encodeURIComponent(chatbotId)}`),
            fetch(
              `/api/public/widget/history?sessionId=${encodeURIComponent(session.sessionId)}&visitorToken=${encodeURIComponent(session.visitorToken)}`,
            ),
          ]);
          if (!metaRes.ok) {
            const detail = await metaRes.json().catch(() => null as { error?: string } | null);
            throw new Error(detail?.error || "Chatbot unavailable");
          }
          const meta = await metaRes.json();
          if (cancelled) return;
          setBot(meta.bot);
          if (histRes.ok) {
            const { messages: rows } = await histRes.json();
            const list = (rows as WidgetMessage[]).map((m) => ({
              ...m,
              status: (m.role === "user"
                ? m.read_at
                  ? "read"
                  : "delivered"
                : "sent") as WidgetMessage["status"],
            }));
            if (list.length === 0 && meta.bot?.welcomeMessage) {
              list.push({
                id: "welcome",
                role: "assistant",
                content: meta.bot.welcomeMessage,
                status: "sent",
              });
            }
            setMessages(list);
            if (!cancelled) syncStatus(session);
          } else {
            writeSession(chatbotId, null);
            setSession(null);
          }
        } else {
          const res = await fetch(
            `/api/public/widget/session?chatbotId=${encodeURIComponent(chatbotId)}`,
          );
          if (!res.ok) {
            const detail = await res.json().catch(() => null as { error?: string } | null);
            throw new Error(detail?.error || "Chatbot unavailable");
          }
          const { bot: meta } = await res.json();
          if (cancelled) return;
          setBot(meta);
          if (meta?.welcomeMessage) {
            setMessages([
              { id: "welcome", role: "assistant", content: meta.welcomeMessage, status: "sent" },
            ]);
          }
        }
        setStatus("idle");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg((err as Error).message || "Failed to load");
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbotId]);

  const ensureSession = useCallback(async () => {
    if (session) return session;
    const stored = readVisitor(chatbotId);
    const who = isValidVisitor(visitor) ? visitor : stored;
    if (!isValidVisitor(who)) {
      setIdentified(false);
      throw new Error("Please provide your name, email and phone number to start the chat");
    }
    const previous = startFreshRef.current ? freshFromRef.current : readSession(chatbotId);
    const res = await fetch("/api/public/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatbotId,
        page: typeof window !== "undefined" ? window.location.href : undefined,
        referrer: typeof document !== "undefined" ? document.referrer : undefined,
        visitorKey: readBrowserKey(),
        language: typeof navigator !== "undefined" ? navigator.language : undefined,
        timezone: (() => {
          try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
          } catch {
            return undefined;
          }
        })(),
        visitorName: who!.name.trim(),
        visitorEmail: who!.email.trim(),
        visitorPhone: who!.phone.trim(),
        newConversation: startFreshRef.current,
        // Proves ownership of the previous session for reuse / new conversation.
        ...(previous
          ? { previousSessionId: previous.sessionId, previousVisitorToken: previous.visitorToken }
          : {}),
      }),
    });
    startFreshRef.current = false;
    if (!res.ok) {
      const detail = await res.json().catch(() => null as { error?: string } | null);
      throw new Error(detail?.error || "Could not start a session");
    }
    const data = await res.json();
    const next = { sessionId: data.sessionId, visitorToken: data.visitorToken };
    writeSession(chatbotId, next);
    setSession(next);
    if (data.bot) setBot(data.bot);
    return next;
  }, [chatbotId, session, visitor]);

  const sendMessage = useCallback(
    async (text: string, attachments: WidgetAttachment[] = []) => {
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) return;

      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const optimistic: WidgetMessage = {
        id: tempId,
        role: "user",
        content: trimmed,
        status: online ? "sending" : "queued",
        attachments: attachments.length ? attachments : null,
      };
      setMessages((m) => [...m, optimistic]);
      setDraft("");
      setPendingAttachments([]);
      setErrorMsg(null);

      if (!online) {
        const outbox = readOutbox(chatbotId);
        outbox.push({ id: tempId, text: trimmed, attachments });
        writeOutbox(chatbotId, outbox);
        return;
      }

      setStatus("sending");
      try {
        const sess = await ensureSession();
        // Only show the "replying" dots while an AI assistant is actually
        // composing. Once a human agent owns the thread there is no bot reply
        // coming back, so the dots would hang there misleadingly.
        setStatus(handoff ? "sending" : "typing");
        const res = await fetch("/api/public/widget/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatbotId,
            sessionId: sess.sessionId,
            visitorToken: sess.visitorToken,
            message: trimmed,
            attachments,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `Request failed (${res.status})`);
        }
        const data = (await res.json()) as { reply: string; handoff: boolean };
        const prevHandoff = handoff;
        setHandoff(data.handoff);
        if (data.handoff && !prevHandoff) setHandoffState("queued");
        setMessages((m) => {
          const withDelivered = m.map((msg) =>
            msg.id === tempId ? { ...msg, status: "delivered" as const } : msg,
          );
          // Avoid echoing the generic handoff acknowledgement on every message after
          // the visitor is already handed off. The first handoff reply (and normal
          // bot replies) are still rendered.
          if (data.reply.trim() && (!data.handoff || !prevHandoff)) {
            return withDelivered.concat({
              id: `bot_${Date.now()}`,
              role: "assistant",
              content: data.reply,
              status: "sent",
            });
          }
          return withDelivered;
        });
        // Read receipts and queue position come from the server on the next poll —
        // never fake them locally.

        void syncStatus(sess);
        setStatus("idle");
        inputRef.current?.focus();
      } catch (err) {
        setMessages((m) =>
          m.map((msg) => (msg.id === tempId ? { ...msg, status: "failed" as const } : msg)),
        );
        setStatus("error");
        setErrorMsg((err as Error).message || "Failed to send");
      }
    },
    [chatbotId, ensureSession, handoff, online, syncStatus],
  );

  // Auto-flush outbox when back online
  useEffect(() => {
    if (!online) return;
    const outbox = readOutbox(chatbotId);
    if (outbox.length === 0) return;
    writeOutbox(chatbotId, []);
    (async () => {
      for (const item of outbox) {
        setMessages((m) => m.filter((msg) => msg.id !== item.id));
        await sendMessage(item.text, item.attachments ?? []);
      }
    })();
  }, [online, chatbotId, sendMessage]);

  const retryFailed = useCallback(() => {
    const failed = [...messages].reverse().find((m) => m.status === "failed" && m.role === "user");
    if (!failed) return;
    setMessages((m) => m.filter((msg) => msg.id !== failed.id));
    void sendMessage(failed.content, failed.attachments ?? []);
  }, [messages, sendMessage]);

  const resetConversation = useCallback(() => {
    startFreshRef.current = true;
    freshFromRef.current = session;
    writeSession(chatbotId, null);
    writeOutbox(chatbotId, []);
    setSession(null);
    setMessages(
      bot?.welcomeMessage
        ? [{ id: "welcome", role: "assistant", content: bot.welcomeMessage, status: "sent" }]
        : [],
    );
    setHandoff(false);
    setHandoffState("ai");
    setQueuePosition(null);
    setAssignedAgent(null);
    lastAnnouncedAgentIdRef.current = null;
    setErrorMsg(null);
    setPendingAttachments([]);
    setRating(null);
    setRatingSubmitted(false);
    setRatingComment("");
    setRatingOpen(false);
    setStatus("idle");
    setIdentified(isValidVisitor(readVisitor(chatbotId)));
    inputRef.current?.focus();
  }, [bot?.welcomeMessage, chatbotId, session]);

  const submitPreChat = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const errors = validateVisitor(visitor);
      setFormErrors(errors);
      if (Object.keys(errors).length > 0) return;
      const cleaned: VisitorIdentity = {
        name: visitor.name.trim(),
        email: visitor.email.trim(),
        phone: visitor.phone.trim(),
      };
      setVisitor(cleaned);
      writeVisitor(chatbotId, cleaned);
      setIdentified(true);
      setErrorMsg(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [chatbotId, visitor],
  );

  const closeSelf = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    window.parent?.postMessage({ wacrm: "close" }, "*");
  }, [onClose]);

  const initials = useMemo(() => {
    if (!bot?.name) return "•";
    return bot.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("");
  }, [bot?.name]);

  // ---------- Upload ----------
  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setErrorMsg(null);
      try {
        const sess = await ensureSession();
        const fd = new FormData();
        fd.append("file", file);
        fd.append("sessionId", sess.sessionId);
        fd.append("visitorToken", sess.visitorToken);
        const res = await fetch("/api/public/widget/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || "Upload failed");
        }
        const { attachment } = (await res.json()) as { attachment: WidgetAttachment };
        setPendingAttachments((prev) => [...prev, attachment]);
        return attachment;
      } catch (err) {
        setErrorMsg((err as Error).message);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [ensureSession],
  );

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).slice(0, 6);
      for (const f of files) await uploadFile(f);
    },
    [uploadFile],
  );

  // Drag & drop
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };
  const onDragLeave = () => {
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      setIsDragging(false);
      dragCounter.current = 0;
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };

  // Paste image support
  const onPaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.files ?? []);
    if (items.length) {
      e.preventDefault();
      void handleFiles(items);
    }
  };

  // ---------- Voice recording ----------
  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size) chunks.push(ev.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimerRef.current) window.clearInterval(recTimerRef.current);
        setIsRecording(false);
        setRecordingSecs(0);
        const blob = new Blob(chunks, { type: mime });
        const file = new File(
          [blob],
          `voice-${Date.now()}.${mime.includes("webm") ? "webm" : "m4a"}`,
          { type: mime },
        );
        await uploadFile(file);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
      recTimerRef.current = window.setInterval(
        () => setRecordingSecs((s) => s + 1),
        1000,
      ) as unknown as number;
    } catch {
      setErrorMsg("Microphone permission denied");
    }
  }, [uploadFile]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);
  const cancelRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr) {
      mr.ondataavailable = null;
      mr.onstop = null;
      mr.stop();
      mr.stream.getTracks().forEach((t) => t.stop());
    }
    if (recTimerRef.current) window.clearInterval(recTimerRef.current);
    setIsRecording(false);
    setRecordingSecs(0);
  }, []);

  // Release the microphone and timers if the widget unmounts mid-recording.
  useEffect(
    () => () => {
      const mr = mediaRecorderRef.current;
      if (mr) {
        mr.ondataavailable = null;
        mr.onstop = null;
        try {
          if (mr.state !== "inactive") mr.stop();
        } catch {}
        mr.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
      }
      if (recTimerRef.current) window.clearInterval(recTimerRef.current);
    },
    [],
  );

  // ---------- Rating ----------
  const submitRating = useCallback(
    async (score: number, comment?: string) => {
      if (!session) {
        setRatingSubmitted(true);
        return;
      }
      try {
        await fetch("/api/public/widget/rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            visitorToken: session.visitorToken,
            rating: score,
            comment,
          }),
        });
      } catch {
        /* ignore */
      }
      setRatingSubmitted(true);
    },
    [session],
  );

  const busy = status === "sending" || status === "typing";
  const canSend =
    (draft.trim().length > 0 || pendingAttachments.length > 0) &&
    status !== "sending" &&
    !uploading;
  const quickReplies = bot?.quickReplies?.length
    ? bot.quickReplies
    : messages.length <= 1
      ? ["Hi 👋", "I need help", "Pricing", "Talk to a human"]
      : [];

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col bg-background text-foreground"
      style={{ ["--wacrm-accent" as string]: accent }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between gap-3 px-4 py-3 text-white"
        style={{ backgroundColor: accent }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/20 text-sm font-semibold">
            {bot?.avatarUrl ? (
              <img src={bot.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">{bot?.name ?? "Chat"}</div>
            <div className="flex items-center gap-1.5 text-[11px] opacity-90">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-300" : "bg-amber-300"}`}
              />
              {!online
                ? "Offline — messages will send when back online"
                : assignedAgent
                  ? `${assignedAgent.name} is helping you`
                  : handoffState === "queued"
                    ? "Connecting to a human"
                    : "Online now"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.some((m) => m.role === "user") && !ratingSubmitted && (
            <button
              type="button"
              onClick={() => setRatingOpen(true)}
              aria-label="Rate this chat"
              className="grid h-8 w-8 place-items-center rounded-full text-white/90 transition hover:bg-white/10"
              title="Rate this chat"
            >
              <Star className="h-4 w-4" />
            </button>
          )}
          {session && (
            <button
              type="button"
              aria-label="My conversations"
              title="My conversations"
              onClick={async () => {
                const next = !conversationsOpen;
                setConversationsOpen(next);
                if (!next || !session) return;
                try {
                  const qs = `chatbotId=${encodeURIComponent(chatbotId)}&sessionId=${encodeURIComponent(session.sessionId)}&visitorToken=${encodeURIComponent(session.visitorToken)}`;
                  const res = await fetch(`/api/public/widget/conversations?${qs}`);
                  if (res.ok) {
                    const data = (await res.json()) as { conversations: typeof conversations };
                    setConversations(data.conversations);
                  }
                } catch {
                  /* best-effort: the list just stays empty */
                }
              }}
              className="grid h-8 w-8 place-items-center rounded-full text-white/90 transition hover:bg-white/10"
            >
              <History className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={resetConversation}
            aria-label="Start new conversation"
            className="grid h-8 w-8 place-items-center rounded-full text-white/90 transition hover:bg-white/10"
            title="New conversation"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {compact && (
            <>
              <button
                type="button"
                onClick={onToggleMaximize}
                aria-label={isMaximized ? "Restore chat size" : "Live Chat"}
                title={isMaximized ? "Restore chat size" : "Live Chat"}
                aria-pressed={isMaximized}
                className="grid h-8 w-8 place-items-center rounded-full text-white/90 transition hover:bg-white/10"
              >
                {isMaximized ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            </>
          )}
          {compact && (
            <button
              type="button"
              onClick={closeSelf}
              aria-label="Minimize chat and keep open"
              title="Minimize chat and keep open"
              className="grid h-8 w-8 place-items-center rounded-full text-white/90 transition hover:bg-white/10"
            >
              <Minus className="h-4 w-4 sm:hidden" />
              <Minus className="hidden h-4 w-4 sm:block" />
            </button>
          )}
        </div>
      </header>

      <div className="h-full flex flex-col border-x border-border">
        {/* My conversations: past chats of this visitor. Picking one reopens it. */}
        {conversationsOpen && (
          <div className="max-h-64 overflow-y-auto border-b border-border bg-surface">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
              My conversations
            </div>
            {conversations.length === 0 && (
              <div className="px-3 pb-3 text-xs text-muted-foreground">No conversations yet.</div>
            )}
            {conversations.map((c) => {
              const current = session?.sessionId === c.sessionId;
              return (
                <button
                  key={c.sessionId}
                  type="button"
                  onClick={() => {
                    // Only the current session has a token; other chats cannot be opened from here.
                    if (!c.visitorToken) return;
                    const next = { sessionId: c.sessionId, visitorToken: c.visitorToken };
                    writeSession(chatbotId, next);
                    setSession(next);
                    setMessages([]);
                    setConversationsOpen(false);
                    void syncStatus(next);
                  }}
                  className={`flex w-full flex-col items-start gap-0.5 border-t border-border px-3 py-2 text-left text-sm transition hover:bg-muted ${current ? "bg-muted/60" : ""}`}
                >
                  <span className="font-medium">
                    {new Date(c.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {current ? " · current" : ""}
                  </span>
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {c.lastMessage ?? "No messages yet"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Offline banner */}
        {!online && (
          <div className="flex items-center gap-2 border-b border-border bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            <WifiOff className="h-3.5 w-3.5" /> You're offline. Messages will send automatically
            when you're back.
          </div>
        )}

        {/* Pre-chat identity form — required before starting a conversation */}
        {!identified && status !== "loading" && (
          <div className="absolute inset-x-0 bottom-0 top-[60px] z-30 overflow-y-auto bg-background px-4 py-5 border-x border-border ">
            <h2 className="text-sm font-semibold">Before we start</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Please share your details so we can assist you and follow up if we get disconnected.
            </p>
            <form className="mt-4 space-y-3" onSubmit={submitPreChat} noValidate>
              {[
                {
                  key: "name" as const,
                  label: "Full name",
                  type: "text",
                  placeholder: "Jane Doe",
                  autoComplete: "name",
                },
                {
                  key: "email" as const,
                  label: "Email",
                  type: "email",
                  placeholder: "jane@company.com",
                  autoComplete: "email",
                },
                {
                  key: "phone" as const,
                  label: "Phone",
                  type: "tel",
                  placeholder: "+1 555 000 1234",
                  autoComplete: "tel",
                },
              ].map((f) => (
                <div key={f.key}>
                  <label htmlFor={`wacrm-${f.key}`} className="mb-1 block text-xs font-medium">
                    {f.label} <span className="text-destructive">*</span>
                  </label>
                  <input
                    id={`wacrm-${f.key}`}
                    type={f.type}
                    required
                    autoComplete={f.autoComplete}
                    placeholder={f.placeholder}
                    value={visitor[f.key]}
                    onChange={(e) => {
                      const val = e.target.value;
                      setVisitor((v) => ({ ...v, [f.key]: val }));
                      setFormErrors((prev) => ({ ...prev, [f.key]: undefined }));
                    }}
                    aria-invalid={Boolean(formErrors[f.key])}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ ["--tw-ring-color" as string]: accent }}
                  />
                  {formErrors[f.key] && (
                    <p className="mt-1 text-[11px] text-destructive">{formErrors[f.key]}</p>
                  )}
                </div>
              ))}
              <button
                type="submit"
                className="w-full rounded px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: accent }}
              >
                Start chat
              </button>
              <p className="text-[11px] text-muted-foreground">
                By starting the chat you agree that we may contact you about your enquiry.
              </p>
            </form>
          </div>
        )}

        {/* Queue — single, non-repeating status line */}
        {handoffState === "queued" && !assignedAgent && (
          <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">
                {queuePosition ? (
                  <>
                    Waiting for an agent — position <b>#{queuePosition}</b>
                  </>
                ) : (
                  "An agent has been notified and will join shortly."
                )}
              </span>
              {queuePosition ? (
                <span className="shrink-0 text-muted-foreground">
                  Est. ~{queuePosition * 2} min
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* Transcript */}
        <div
          ref={scrollRef}
          className={`relative flex-1 space-y-3 overflow-y-auto px-4 py-4 ${
            compact
              ? "bg-[radial-gradient(circle_at_1px_1px,hsl(var(--muted-foreground)/0.12)_1px,transparent_0)] [background-size:20px_20px]"
              : ""
          }`}
          role="log"
          aria-live="polite"
          aria-label="Conversation"
        >
          {status === "loading" && messages.length === 0 && (
            <div className="flex justify-center py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} accent={accent} />
          ))}

          {((status === "typing" && !handoff) || agentTyping) && (
            <div
              className="flex items-center gap-2"
              role="status"
              aria-label={
                agentTyping ? `${assignedAgent?.name ?? "Agent"} is typing` : "Assistant is typing"
              }
            >
              <div className="rounded-control rounded-bl-sm bg-muted px-3 py-2.5">
                <span className="inline-flex gap-1">
                  <Dot delay="0ms" />
                  <Dot delay="140ms" />
                  <Dot delay="280ms" />
                </span>
              </div>
              {agentTyping && (
                <span className="text-[11px] text-muted-foreground">
                  {assignedAgent?.name ?? "Agent"} is typing
                </span>
              )}
            </div>
          )}

          {/* Drag overlay */}
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/90 backdrop-blur-sm">
              <div className="rounded-control border-2 border-dashed border-foreground/30 px-8 py-6 text-center">
                <Paperclip className="mx-auto h-6 w-6 text-muted-foreground" />
                <div className="mt-2 text-sm font-medium">Drop files to attach</div>
                <div className="text-xs text-muted-foreground">
                  Images, documents, audio — up to 25 MB
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick replies */}
        {quickReplies.length > 0 && !handoff && (
          <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
            {quickReplies.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void sendMessage(q)}
                className="rounded-control border border-border bg-background px-3 py-1.5 text-xs transition hover:bg-muted"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
            {pendingAttachments.map((a, i) => (
              <div
                key={a.url}
                className="group relative flex items-center gap-2 rounded-control border border-border bg-muted/50 px-2 py-1 text-xs"
              >
                {a.kind === "image" ? (
                  <ImageIcon className="h-3.5 w-3.5" />
                ) : a.kind === "audio" ? (
                  <Mic className="h-3.5 w-3.5" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                <span className="max-w-[140px] truncate">{a.name}</span>
                <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                <button
                  type="button"
                  onClick={() => setPendingAttachments((p) => p.filter((_, idx) => idx !== i))}
                  className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"
                  aria-label="Remove"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Error banner */}
        {errorMsg && (
          <div className="flex items-center justify-between gap-2 border-t border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
            <span className="truncate">{errorMsg}</span>
            {messages.some((m) => m.status === "failed") && (
              <button
                type="button"
                onClick={retryFailed}
                className="rounded-control border border-destructive/30 px-2 py-0.5 font-medium hover:bg-destructive/10"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Emoji picker */}
        {showEmoji && (
          <div className="grid grid-cols-8 gap-1 border-t border-border bg-background px-3 py-2 text-xl">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setDraft((d) => d + e);
                  inputRef.current?.focus();
                }}
                className="rounded-control p-1 transition hover:bg-muted"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {/* Recording bar */}
        {isRecording ? (
          <div className="flex items-center justify-between gap-2 border-t border-border bg-background px-3 py-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="font-mono">
                {Math.floor(recordingSecs / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(recordingSecs % 60).toString().padStart(2, "0")}
              </span>
              <span className="text-muted-foreground">Recording</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={cancelRecording}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="grid h-9 w-9 place-items-center rounded-full text-white"
                style={{ backgroundColor: accent }}
                aria-label="Stop and send"
              >
                <StopCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(draft, pendingAttachments);
            }}
            className="flex items-end gap-1 border-t border-border bg-background px-2 py-2 sm:px-3 sm:py-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,audio/*"
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={imageInputRef}
              type="file"
              className="hidden"
              multiple
              accept="image/*"
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              aria-label="Attach image"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach file"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              aria-label="Emoji"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition hover:bg-muted ${showEmoji ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Smile className="h-4 w-4" />
            </button>

            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (e.target.value.trim()) signalTyping();
                else stopTyping();
              }}
              onBlur={stopTyping}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  stopTyping();
                  void sendMessage(draft, pendingAttachments);
                }
              }}

              rows={1}
              maxLength={4000}
              placeholder={online ? "Write a message" : "You're offline — type to queue"}
              aria-label="Message"
              className="max-h-32 flex-1 resize-none rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-foreground/30"
            />

            {canSend ? (
              <button
                type="submit"
                aria-label="Send message"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition disabled:opacity-50"
                style={{ backgroundColor: accent }}
                disabled={!canSend}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                aria-label="Record voice message"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition"
                style={{ backgroundColor: accent }}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
            )}
          </form>
        )}

        <div className="flex items-center justify-between gap-2 border-y border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={resetConversation}
            className="rounded px-1 hover:text-foreground hover:underline"
          >
            New conversation
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate">Powered by {brandName}</span>
            {compact && (
              <button
                type="button"
                onClick={onToggleMaximize}
                aria-label={isMaximized ? "Restore chat size" : "Live Chat"}
                title={isMaximized ? "Restore chat size" : "Live Chat"}
                aria-pressed={isMaximized}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition hover:bg-muted hover:text-foreground"
              >
                {isMaximized ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Rating modal */}
        {ratingOpen && !ratingSubmitted && (
          <div
            className="absolute inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
            onClick={() => setRatingOpen(false)}
          >
            <div
              className="w-full rounded-t-2xl bg-background p-5 sm:max-w-sm sm:rounded-control"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">How was this chat?</h3>
                <button
                  type="button"
                  onClick={() => setRatingOpen(false)}
                  className="rounded-full p-1 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`${n} star`}
                    className="rounded-full p-1 transition"
                  >
                    <Star
                      className={`h-8 w-8 ${rating && n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                    />
                  </button>
                ))}
              </div>
              <label htmlFor="wacrm-rating-comment" className="sr-only">
                Additional feedback
              </label>
              <textarea
                id="wacrm-rating-comment"
                placeholder="Tell us more (optional)"
                rows={3}
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                className="mt-4 w-full resize-none rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-foreground/30"
              />
              <button
                type="button"
                disabled={!rating}
                onClick={() => {
                  if (!rating) return;
                  void submitRating(rating, ratingComment.trim() || undefined);
                  setRatingOpen(false);
                }}
                className="mt-4 w-full rounded-control py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                Submit rating
              </button>
            </div>
          </div>
        )}

        {ratingSubmitted && (
          <div className="border-t border-border bg-emerald-50 px-4 py-2 text-center text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            Thanks for your feedback! ⭐
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message, accent }: { message: WidgetMessage; accent: string }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1 duration-200`}
    >
      <div
        className={[
          "w-full max-w-[320px] whitespace-pre-wrap break-words rounded-control px-3.5 py-2.5 text-sm leading-relaxed",
          isUser ? "rounded-br-sm text-white" : "rounded-bl-sm bg-muted text-foreground",
          message.status === "failed" ? "opacity-60" : "",
        ].join(" ")}
        style={isUser ? { backgroundColor: accent } : undefined}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className={`mb-1.5 space-y-1.5 ${message.content ? "" : "mb-0"}`}>
            {message.attachments.map((a) => (
              <AttachmentRender key={a.url} a={a} isUser={isUser} />
            ))}
          </div>
        )}
        {message.content && <div>{message.content}</div>}
        {isUser && message.status && (
          <div className="mt-1 flex items-center justify-end gap-0.5 text-[11px] opacity-80">
            {message.status === "queued" && (
              <>
                <WifiOff className="h-3 w-3" /> Queued
              </>
            )}
            {message.status === "sending" && <>Sending</>}
            {message.status === "delivered" && (
              <>
                <Check className="h-3 w-3" /> Delivered
              </>
            )}
            {message.status === "read" && (
              <>
                <CheckCheck className="h-3 w-3" /> Read
              </>
            )}
            {message.status === "sent" && (
              <>
                <Check className="h-3 w-3" /> Sent
              </>
            )}
            {message.status === "failed" && <>Failed</>}
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentRender({ a, isUser }: { a: WidgetAttachment; isUser: boolean }) {
  const lightbox = useMediaLightbox();
  if (a.kind === "image") {
    return (
      <button
        type="button"
        className="block cursor-zoom-in overflow-hidden rounded-control"
        aria-label={`Open ${a.name}`}
        onClick={() => lightbox.open({ url: a.url, type: "image", name: a.name })}
      >
        <img
          src={a.url}
          alt={a.name}
          className="max-h-64 w-full max-w-xs object-cover"
          loading="lazy"
        />
      </button>
    );
  }
  if (a.kind === "audio") {
    return <audio controls src={a.url} className="w-full max-w-xs" preload="metadata" />;
  }
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 rounded-control border px-2.5 py-2 text-xs transition ${isUser ? "border-white/30 text-white hover:bg-white/10" : "border-border bg-background text-foreground hover:bg-muted"}`}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <div className="truncate font-medium">{a.name}</div>
        <div className={isUser ? "opacity-80" : "text-muted-foreground"}>{formatBytes(a.size)}</div>
      </div>
    </a>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70"
      style={{ animationDelay: delay }}
    />
  );
}
