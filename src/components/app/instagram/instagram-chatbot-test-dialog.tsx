import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Send, Instagram as InstagramIcon, Sparkles, Loader2, RefreshCw, User2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { aiChat } from "@/lib/ai/complete.functions";

type Bot = {
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

export function InstagramChatbotTestDialog({
  open,
  onOpenChange,
  bot,
  accountHandle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bot: Bot | null;
  accountHandle?: string;
}) {
  const runAiChat = useServerFn(aiChat);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset when opening for a different bot
  useEffect(() => {
    if (!open || !bot) return;
    setTurns(
      bot.welcome_message || bot.greeting
        ? [{ role: "assistant", content: bot.welcome_message ?? bot.greeting ?? "", ts: Date.now() }]
        : [],
    );
    setInput("");
  }, [open, bot?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, pending]);

  if (!bot) return null;

  const systemPrompt = [
    `You are "${bot.name}", an Instagram DM auto-reply assistant for @${accountHandle ?? "our_business"}.`,
    bot.description ? `Context: ${bot.description}` : null,
    bot.handoff_enabled
      ? `If the user explicitly asks for a human, wants to escalate, or asks something outside your knowledge, respond briefly and end with: "[[handoff]]".`
      : null,
    `Fallback (use when you truly cannot help): ${bot.fallback_message ?? "Sorry, I didn't catch that. A team member will follow up shortly."}`,
    `Keep replies short, friendly, and Instagram-DM appropriate (under 3 short sentences unless clarifying). Never invent product details, prices, or policies.`,
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
          meta: {
            model: res.model,
            latencyMs: Date.now() - started,
            tokens: res.totalTokens,
          },
        },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "AI request failed";
      toast.error(message);
      setTurns((cur) => [
        ...cur,
        { role: "assistant", content: `⚠️ ${message}`, ts: Date.now() },
      ]);
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
            <div className="w-8 h-8 rounded-control bg-gradient-to-br from-pink-500 to-orange-400 text-white flex items-center justify-center">
              <InstagramIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">Test — {bot.name}</div>
              <div className="text-xs text-muted-foreground font-normal truncate">
                Preview replies before enabling · @{accountHandle ?? "account"}
              </div>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Send sample Instagram DMs and preview chatbot replies.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px]">
          {/* Chat pane */}
          <div className="flex flex-col h-[520px] border-r border-border">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
              {turns.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-10">
                  <Sparkles className="w-5 h-5 mx-auto mb-2 opacity-50" />
                  Send a message to preview the bot's reply.
                </div>
              )}
              {turns.map((t, i) => (
                <div
                  key={i}
                  className={`flex items-end gap-2 ${t.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {t.role === "assistant" && (
                    <div className="w-6 h-6 rounded-control bg-gradient-to-br from-pink-500 to-orange-400 text-white flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-control px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                      t.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border border-border"
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
                        {typeof t.meta.tokens === "number" && t.meta.tokens > 0 && (
                          <span>{t.meta.tokens} tok</span>
                        )}
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
                  <div className="w-6 h-6 rounded-control bg-gradient-to-br from-pink-500 to-orange-400 text-white flex items-center justify-center">
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
                placeholder="Type a sample DM  (Enter to send · Shift+Enter for newline)"
                className="resize-none"
                disabled={pending}
              />
              <div className="flex items-center justify-between gap-2">
                <Button size="sm" variant="ghost" onClick={reset} disabled={pending}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reset
                </Button>
                <Button size="sm" onClick={() => void send(input)} disabled={pending || !input.trim()}>
                  {pending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="p-4 space-y-4 text-sm bg-background">
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">
                Status
              </div>
              <Badge variant="outline" className="gap-1 text-[11px]">
                <Sparkles className="w-3 h-3" /> Preview mode — replies are not sent
              </Badge>
            </div>

            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">
                Try a sample
              </div>
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
            </div>

            <div className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
              This console runs the same prompt config the live bot uses, against the AI Gateway.
              No message is delivered to Instagram.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
