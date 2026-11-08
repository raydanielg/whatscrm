import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  BookOpen, Calendar, CircleDot, FileText, Headphones, Loader2, MessageSquare,
  Package, Receipt, Search, Send, Sparkles, TrendingUp, User2,
} from "lucide-react";
import { toast } from "sonner";
import { assistantChat, assistantHandoff } from "@/lib/client-portal/assistant.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/client/assistant")({
  component: AssistantPage,
});

type Msg = { role: "user" | "assistant"; content: string; handoffReason?: string | null };

const QUICK_ACTIONS: Array<{ icon: typeof Calendar; label: string; prompt: string }> = [
  { icon: Receipt, label: "Summarize my invoices", prompt: "Give me a quick summary of my invoices — what's paid, what's due, and any overdue." },
  { icon: Package, label: "Track my orders", prompt: "What's the current status of my open orders?" },
  { icon: Calendar, label: "Upcoming appointments", prompt: "What appointments do I have coming up? Include the join links." },
  { icon: MessageSquare, label: "Summarize conversations", prompt: "Summarize my recent conversations with your team." },
  { icon: Headphones, label: "My open tickets", prompt: "What support tickets do I have open and what's their status?" },
  { icon: TrendingUp, label: "Recommend products", prompt: "Based on my history, what products or services do you recommend for me?" },
  { icon: BookOpen, label: "How-to help", prompt: "How do I reschedule an appointment through the portal?" },
];

function AssistantPage() {
  const chatFn = useServerFn(assistantChat);
  const handoffFn = useServerFn(assistantHandoff);

  const locale = useMemo(
    () => (typeof navigator !== "undefined" ? navigator.language : "en"),
    []
  );

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [providerKind, setProviderKind] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const chat = useMutation({
    mutationFn: (history: Msg[]) => chatFn({
      data: {
        locale,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      },
    }),
    onSuccess: (res) => {
      setProviderKind(res.providerKind);
      setMessages((prev) => [...prev, {
        role: "assistant", content: res.reply || "", handoffReason: res.handoffReason,
      }]);
      setTimeout(() => inputRef.current?.focus(), 30);
    },
    onError: (e) => {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Sorry, I had trouble responding. ${e instanceof Error ? e.message : ""}`,
      }]);
    },
  });

  const handoff = useMutation({
    mutationFn: ({ reason }: { reason: string }) => handoffFn({
      data: {
        reason,
        transcript: messages.map((m) => ({ role: m.role, content: m.content })),
        priority: "normal",
      },
    }),
    onSuccess: (r) => {
      toast.success("Connected — a support agent will follow up.");
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `I've opened a ticket for you and shared this conversation. You can [view it here](/client/tickets/${r.ticketId}).`,
      }]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Handoff failed"),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chat.isPending]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit(text?: string) {
    const value = (text ?? input).trim();
    if (!value || chat.isPending) return;
    const next: Msg[] = [...messages, { role: "user", content: value }];
    setMessages(next);
    setInput("");
    chat.mutate(next);
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const handoffReason = lastAssistant?.handoffReason;

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-4 h-[calc(100vh-10rem)]">
      {/* Chat column */}
      <div className="flex flex-col rounded-control border border-border bg-surface overflow-hidden">
        {/* Header */}
        <header className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent/60 text-accent-foreground flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold text-base">AI Customer Assistant</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Grounded in your account · multilingual · {providerKind ?? "ready"}
            </p>
          </div>
          <Link to="/client/tickets/new"><Button variant="outline" size="sm">
            <User2 className="w-3.5 h-3.5 mr-1.5" /> Talk to a human
          </Button></Link>
        </header>

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-10">
              <div className="w-14 h-14 mx-auto rounded-control bg-accent/10 text-accent flex items-center justify-center mb-3">
                <Sparkles className="w-7 h-7" />
              </div>
              <h2 className="font-display text-xl font-semibold">How can I help today?</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Ask me anything about your account — orders, invoices, appointments, or how to use the portal.
                I speak your language and can search our help center.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                {QUICK_ACTIONS.slice(0, 6).map((a) => (
                  <button
                    key={a.label}
                    onClick={() => submit(a.prompt)}
                    className="inline-flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-xs hover:border-border-strong hover:bg-muted transition-colors"
                  >
                    <a.icon className="w-3.5 h-3.5 text-accent" /> {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} items-start gap-2`}>
              {m.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 mt-1">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-control px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-accent text-accent-foreground rounded-br-sm"
                  : "bg-background border border-border rounded-bl-sm"
              }`}>
                {m.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-code:text-xs">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            </div>
          ))}

          {chat.isPending && (
            <div className="flex justify-start items-start gap-2">
              <div className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 mt-1">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="rounded-control bg-background border border-border px-4 py-2.5 text-sm text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking
              </div>
            </div>
          )}

          {/* Human handoff suggestion */}
          {handoffReason && !chat.isPending && (
            <div className="ml-9 max-w-[80%]">
              <div className="rounded-control border border-accent/40 bg-accent/5 p-3 flex items-start gap-3">
                <User2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">Would you like a human to take over?</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{handoffReason}</p>
                </div>
                <Button
                  size="sm" className="h-7"
                  disabled={handoff.isPending}
                  onClick={() => handoff.mutate({ reason: handoffReason })}
                >
                  {handoff.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Connect me
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="border-t border-border p-3 flex items-end gap-2 bg-background"
        >
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3 pointer-events-none" />
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder="Ask anything — orders, invoices, appointments, products"
              rows={1}
              className="pl-9 resize-none min-h-[40px] max-h-40"
              maxLength={4000}
            />
          </div>
          <Button type="submit" disabled={!input.trim() || chat.isPending}>
            {chat.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>

      {/* Sidebar — quick actions & tips */}
      <aside className="hidden lg:flex flex-col gap-4 overflow-y-auto">
        <section className="rounded-control border border-border bg-surface p-4">
          <h3 className="text-xs uppercase text-muted-foreground mb-3">Quick actions</h3>
          <div className="space-y-1">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => submit(a.prompt)}
                disabled={chat.isPending}
                className="w-full text-left flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-40"
              >
                <a.icon className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="truncate">{a.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-control border border-border bg-surface p-4">
          <h3 className="text-xs uppercase text-muted-foreground mb-3 flex items-center gap-1.5">
            <CircleDot className="w-3 h-3 text-emerald-500" /> Capabilities
          </h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• Search your help center in natural language</li>
            <li>• Summarize orders, invoices and conversations</li>
            <li>• Look up appointment details and join links</li>
            <li>• Track order status and payment history</li>
            <li>• Recommend products from our catalog</li>
            <li>• Reply in your language automatically</li>
            <li>• Hand off to a human when needed</li>
          </ul>
        </section>

        <section className="rounded-control border border-border bg-surface p-4">
          <h3 className="text-xs uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Related
          </h3>
          <div className="space-y-1 text-sm">
            <Link to="/client/knowledge" className="block px-2 py-1.5 rounded-control hover:bg-muted">Browse help center</Link>
            <Link to="/client/tickets" className="block px-2 py-1.5 rounded-control hover:bg-muted">My support tickets</Link>
            <Link to="/client/billing" className="block px-2 py-1.5 rounded-control hover:bg-muted">Billing & orders</Link>
            <Link to="/client/appointments" className="block px-2 py-1.5 rounded-control hover:bg-muted">My appointments</Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
