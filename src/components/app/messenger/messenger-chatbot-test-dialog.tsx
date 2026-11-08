import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bot, Send, MessageCircle, Sparkles, Loader2, RefreshCw, User2, PlugZap, History, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { aiChat } from "@/lib/ai/complete.functions";
import { verifyMessengerAccount } from "@/lib/messenger/token.functions";

type BotShape = {
  id: string;
  name: string;
  greeting: string | null;
  welcome_message: string | null;
  fallback_message: string | null;
  description: string | null;
  handoff_enabled: boolean;
};

type Turn = {
  role: "user" | "assistant";
  content: string;
  ts: number;
  meta?: { model?: string; latencyMs?: number; tokens?: number };
};

const SAMPLES = [
  "Hi, are you open today?",
  "Do you ship internationally?",
  "What are your prices?",
  "Can I speak to a human?",
  "I'd like to book an appointment.",
];

export function MessengerChatbotTestDialog({
  open,
  onOpenChange,
  bot,
  pageName,
  messengerAccountId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bot: BotShape | null;
  pageName?: string;
  messengerAccountId?: string;
}) {
  const runAiChat = useServerFn(aiChat);
  const runVerify = useServerFn(verifyMessengerAccount);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [tab, setTab] = useState<"samples" | "history">("samples");
  const [conn, setConn] = useState<
    | { state: "idle" }
    | { state: "checking" }
    | { state: "ok"; expiresAt?: string | null }
    | { state: "error"; reason: string }
  >({ state: "idle" });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !bot) return;
    setTurns(
      bot.welcome_message || bot.greeting
        ? [{ role: "assistant", content: bot.welcome_message ?? bot.greeting ?? "", ts: Date.now() }]
        : [],
    );
    setInput("");
    setConn({ state: "idle" });
    setTab("samples");
  }, [open, bot?.id]);

  // Recent inbound Messenger messages for this bot's connected Page.
  const history = useQuery({
    queryKey: ["messenger-replay-history", messengerAccountId],
    enabled: open && !!messengerAccountId,
    queryFn: async () => {
      const { data: convs, error: convErr } = await supabase
        .from("conversations")
        .select("id, last_message_at, contact_id")
        .eq("channel", "messenger")
        .eq("channel_account_id", messengerAccountId!)
        .order("last_message_at", { ascending: false })
        .limit(20);
      if (convErr) throw convErr;
      const convIds = (convs ?? []).map((c) => c.id);
      if (convIds.length === 0) return [] as Array<{ id: string; body: string; created_at: string; conversation_id: string }>;
      const { data: msgs, error: msgErr } = await supabase
        .from("messages")
        .select("id, body, created_at, conversation_id, direction, message_type")
        .in("conversation_id", convIds)
        .eq("direction", "inbound")
        .eq("message_type", "text")
        .not("body", "is", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (msgErr) throw msgErr;
      return (msgs ?? []).map((m) => ({
        id: m.id as string,
        body: (m.body ?? "") as string,
        created_at: m.created_at as string,
        conversation_id: m.conversation_id as string,
      }));
    },
  });

  const testConnection = async () => {
    if (!messengerAccountId) {
      toast.error("No Facebook Page linked to this bot");
      return;
    }
    setConn({ state: "checking" });
    try {
      const res = await runVerify({ data: { accountId: messengerAccountId } });
      if (res.ok) {
        setConn({ state: "ok", expiresAt: res.expiresAt ?? null });
        toast.success("Page token is valid");
      } else {
        setConn({ state: "error", reason: res.reason ?? (res.expired ? "Token expired" : "Verification failed") });
        toast.error(res.reason ?? "Verification failed");
      }
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : "Verification failed";
      setConn({ state: "error", reason });
      toast.error(reason);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, pending]);

  if (!bot) return null;

  const systemPrompt = [
    `You are "${bot.name}", a Facebook Messenger auto-reply assistant for ${pageName ?? "our business Page"}.`,
    bot.description ? `Context: ${bot.description}` : null,
    bot.handoff_enabled
      ? `If the user explicitly asks for a human, wants to escalate, or asks something outside your knowledge, respond briefly and end with: "[[handoff]]".`
      : null,
    `Fallback (use when you truly cannot help): ${bot.fallback_message ?? "Sorry, I didn't catch that. A team member will follow up shortly."}`,
    `Keep replies short, friendly, and Messenger-appropriate (under 3 short sentences unless clarifying). Never invent product details, prices, or policies.`,
  ]
    .filter(Boolean)
    .join("\n");

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || pending) return;
    setPending(true);
    const nextTurns: Turn[] = [...turns, { role: "user", content: msg, ts: Date.now() }];
    setTurns(nextTurns);
    setInput("");
    const started = Date.now();
    try {
      const res = await runAiChat({
        data: {
          system: systemPrompt,
          messages: nextTurns.map((t) => ({ role: t.role, content: t.content })),
          temperature: 0.5,
          max_tokens: 400,
        },
      });
      setTurns((cur) => [
        ...cur,
        {
          role: "assistant",
          content: res.content?.trim() || bot.fallback_message || "",
          ts: Date.now(),
          meta: { model: res.model, latencyMs: Date.now() - started, tokens: res.totalTokens },
        },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "AI request failed";
      toast.error(message);
      setTurns((cur) => [...cur, { role: "assistant", content: `⚠️ ${message}`, ts: Date.now() }]);
    } finally {
      setPending(false);
    }
  };

  const reset = () => {
    setTurns(
      bot.welcome_message || bot.greeting
        ? [{ role: "assistant", content: bot.welcome_message ?? bot.greeting ?? "", ts: Date.now() }]
        : [],
    );
    setInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-control bg-[#0084ff] text-white flex items-center justify-center">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">Test — {bot.name}</div>
              <div className="text-xs text-muted-foreground font-normal truncate">
                Preview replies before enabling · {pageName ?? "Page"}
              </div>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Send sample Messenger DMs and preview chatbot replies.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px]">
          <div className="flex flex-col h-[520px] border-r border-border">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
              {turns.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-10">
                  <Sparkles className="w-5 h-5 mx-auto mb-2 opacity-50" />
                  Send a message to preview the bot's reply.
                </div>
              )}
              {turns.map((t, i) => (
                <div key={i} className={`flex items-end gap-2 ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                  {t.role === "assistant" && (
                    <div className="w-6 h-6 rounded-control bg-[#0084ff] text-white flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-control px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                      t.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border border-border"
                    }`}
                  >
                    {t.content.replace("[[handoff]]", "").trim() || t.content}
                    {t.role === "assistant" && t.content.includes("[[handoff]]") && (
                      <div className="mt-1.5 pt-1.5 border-t border-border/60 flex items-center gap-1 text-[11px] text-amber-600">
                        <User2 className="w-3 h-3" /> Would trigger human handoff
                      </div>
                    )}
                    {t.meta && (
                      <div className="mt-1 text-[11px] text-muted-foreground/80 flex flex-wrap gap-2">
                        {t.meta.model && <span>{t.meta.model}</span>}
                        {typeof t.meta.latencyMs === "number" && <span>{t.meta.latencyMs}ms</span>}
                        {typeof t.meta.tokens === "number" && t.meta.tokens > 0 && <span>{t.meta.tokens} tok</span>}
                      </div>
                    )}
                  </div>
                  {t.role === "user" && (
                    <div className="w-6 h-6 rounded-control bg-muted flex items-center justify-center shrink-0">
                      <User2 className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              ))}
              {pending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-6 h-6 rounded-control bg-[#0084ff] text-white flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="bg-background border border-border rounded-control px-3 py-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:120ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:240ms]" />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border p-3 space-y-2 bg-background">
              <Textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Type a sample message  (Enter to send · Shift+Enter for newline)"
                className="resize-none"
                disabled={pending}
              />
              <div className="flex items-center justify-between gap-2">
                <Button size="sm" variant="ghost" onClick={reset} disabled={pending}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reset
                </Button>
                <Button size="sm" onClick={() => void send(input)} disabled={pending || !input.trim()}>
                  {pending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                  Send
                </Button>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4 text-sm bg-background overflow-y-auto max-h-[520px]">
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Connection</div>
              <Button
                size="sm"
                variant="outline"
                onClick={testConnection}
                disabled={conn.state === "checking" || !messengerAccountId}
                className="w-full justify-start gap-1.5 h-8"
              >
                {conn.state === "checking" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PlugZap className="w-3.5 h-3.5" />
                )}
                Test connection
              </Button>
              {conn.state === "ok" && (
                <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-emerald-600">
                  <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    Page token valid
                    {conn.expiresAt && (
                      <> · expires {formatDistanceToNow(new Date(conn.expiresAt), { addSuffix: true })}</>
                    )}
                  </span>
                </div>
              )}
              {conn.state === "error" && (
                <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{conn.reason}</span>
                </div>
              )}
              {conn.state === "idle" && !messengerAccountId && (
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  No Page linked — connection test unavailable.
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <button
                  onClick={() => setTab("samples")}
                  className={`text-[11px] uppercase px-1.5 py-0.5 rounded-control ${
                    tab === "samples" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Samples
                </button>
                <button
                  onClick={() => setTab("history")}
                  className={`text-[11px] uppercase px-1.5 py-0.5 rounded-control inline-flex items-center gap-1 ${
                    tab === "history" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <History className="w-3 h-3" /> Replay
                </button>
              </div>

              {tab === "samples" && (
                <div className="flex flex-col gap-1.5">
                  {SAMPLES.map((s) => (
                    <button
                      key={s}
                      onClick={() => void send(s)}
                      disabled={pending}
                      className="text-left text-xs rounded-control border border-border hover:bg-muted px-2 py-1.5 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {tab === "history" && (
                <div className="flex flex-col gap-1.5">
                  {!messengerAccountId && (
                    <div className="text-[11px] text-muted-foreground">No Page linked.</div>
                  )}
                  {messengerAccountId && history.isLoading && (
                    <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading history
                    </div>
                  )}
                  {messengerAccountId && !history.isLoading && (history.data ?? []).length === 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      No inbound messages on this Page yet.
                    </div>
                  )}
                  {(history.data ?? []).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => void send(m.body)}
                      disabled={pending}
                      title={m.body}
                      className="text-left text-xs rounded-control border border-border hover:bg-muted px-2 py-1.5 disabled:opacity-50"
                    >
                      <div className="line-clamp-2">{m.body}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Status</div>
              <Badge variant="outline" className="gap-1 text-[11px]">
                <Sparkles className="w-3 h-3" /> Preview mode — replies are not sent
              </Badge>
            </div>

            <div className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
              This console runs the same prompt config the live bot uses, against the AI Gateway. No message is delivered to Messenger.
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
