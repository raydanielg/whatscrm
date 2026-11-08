import * as React from "react";
import { Bot, User, X, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatbotFlow, ChatbotNode } from "@/lib/chatbots/flow-types";
import { NODE_DEF_BY_TYPE } from "@/lib/chatbots/flow-types";
import { ScrollArea } from "@/components/ui/scroll-area";

type Msg = { role: "bot" | "user" | "system"; text: string; buttons?: string[]; nodeId?: string };

export function ChatbotTestDrawer({
  open, onClose, flow,
}: { open: boolean; onClose: () => void; flow: ChatbotFlow }) {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [awaitingNode, setAwaitingNode] = React.useState<ChatbotNode | null>(null);
  const [input, setInput] = React.useState("");
  const variables = React.useRef<Record<string, string>>({});

  const run = React.useCallback((fromId: string) => {
    let cursor: ChatbotNode | undefined = flow.nodes.find((n) => n.id === fromId);
    const seen = new Set<string>();
    const out: Msg[] = [];
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      const def = NODE_DEF_BY_TYPE[cursor.type];
      if (cursor.type === "message") {
        out.push({ role: "bot", text: (cursor.config.text as string) ?? "", nodeId: cursor.id });
      } else if (cursor.type === "button" || cursor.type === "quick_reply") {
        const key = cursor.type === "button" ? "buttons" : "replies";
        out.push({ role: "bot", text: (cursor.config.text as string) ?? "", buttons: (cursor.config[key] as string[]) ?? [], nodeId: cursor.id });
        setMessages((m) => [...m, ...out]);
        setAwaitingNode(cursor!);
        return;
      } else if (cursor.type === "question" || cursor.type === "form") {
        out.push({ role: "bot", text: (cursor.config.text as string) ?? (cursor.type === "form" ? "Please fill the form" : ""), nodeId: cursor.id });
        setMessages((m) => [...m, ...out]);
        setAwaitingNode(cursor!);
        return;
      } else if (cursor.type === "ai") {
        out.push({ role: "bot", text: `🤖 AI reply (prompt: ${(cursor.config.prompt as string) ?? ""})`, nodeId: cursor.id });
      } else if (cursor.type === "webhook") {
        out.push({ role: "system", text: `→ Webhook ${cursor.config.method ?? "POST"} ${cursor.config.url ?? ""}` });
      } else if (cursor.type === "delay") {
        out.push({ role: "system", text: `⏱ delay ${cursor.config.seconds ?? 0}s` });
      } else if (cursor.type === "transfer") {
        out.push({ role: "system", text: `👤 Handoff to ${(cursor.config.team as string) || "next available agent"}` });
      } else if (cursor.type === "end") {
        out.push({ role: "system", text: "— End of flow —" });
        break;
      } else if (cursor.type === "condition") {
        const v = variables.current[(cursor.config.variable as string) ?? ""] ?? "";
        const target = (cursor.config.value as string) ?? "";
        const op = (cursor.config.operator as string) ?? "equals";
        const truthy =
          op === "equals" ? v === target :
          op === "not_equals" ? v !== target :
          op === "contains" ? v.includes(target) :
          op === "starts_with" ? v.startsWith(target) :
          op === "exists" ? Boolean(v) : false;
        const branch = truthy ? "true" : "false";
        const edge = flow.edges.find((e) => e.source === cursor!.id && (e.sourceHandle === branch || e.label === branch));
        cursor = edge ? flow.nodes.find((n) => n.id === edge.target) : undefined;
        continue;
      }
      if (!def || def.kind === "terminal") break;
      const edge = flow.edges.find((e) => e.source === cursor!.id);
      cursor = edge ? flow.nodes.find((n) => n.id === edge.target) : undefined;
    }
    setMessages((m) => [...m, ...out]);
    setAwaitingNode(null);
  }, [flow]);

  const start = React.useCallback(() => {
    variables.current = {};
    setMessages([]);
    setAwaitingNode(null);
    const startNode = flow.nodes.find((n) => n.type === "start");
    if (!startNode) {
      setMessages([{ role: "system", text: "No start node in flow." }]);
      return;
    }
    const first = flow.edges.find((e) => e.source === startNode.id);
    if (first) run(first.target);
    else setMessages([{ role: "system", text: "Start node has no outgoing connection." }]);
  }, [flow, run]);

  React.useEffect(() => { if (open) start(); }, [open, start]);

  const submitUser = (text: string) => {
    if (!awaitingNode) return;
    setMessages((m) => [...m, { role: "user", text }]);
    if (awaitingNode.type === "question") {
      const v = (awaitingNode.config.variable as string) ?? "reply";
      variables.current[v] = text;
    }
    const node = awaitingNode;
    setAwaitingNode(null);
    setInput("");
    const edge = flow.edges.find((e) => e.source === node.id);
    if (edge) run(edge.target);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-surface border-l border-border z-50 flex flex-col shadow-xl animate-in slide-in-from-right">
      <div className="h-12 border-b border-border flex items-center gap-2 px-3">
        <Play className="w-4 h-4 text-primary" />
        <div className="text-sm font-semibold flex-1">Test Mode</div>
        <button onClick={start} className="p-1.5 rounded hover:bg-muted" aria-label="Restart"><RotateCcw className="w-4 h-4" /></button>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-muted" aria-label="Close"><X className="w-4 h-4" /></button>
      </div>
      <ScrollArea type="hover" className="flex-1 min-h-0" viewportClassName="[&>div]:!block">
        <div className="p-4 space-y-3">
          {messages.map((m, i) => (
            m.role === "system" ? (
              <div key={i} className="text-[11px] text-muted-foreground text-center italic">{m.text}</div>
            ) : (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${m.role === "user" ? "bg-primary/10 text-primary" : "bg-muted"}`}>
                  {m.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div className={`rounded-control px-3 py-2 max-w-[75%] text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.buttons && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.buttons.map((b, j) => (
                        <button key={j} onClick={() => submitUser(b)} className="text-xs px-2 py-1 rounded-control bg-background border border-border hover:bg-muted">
                          {b}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          ))}
        </div>
      </ScrollArea>
      <div className="p-3 border-t border-border flex gap-2">
        <Input
          value={input}
          disabled={!awaitingNode || awaitingNode.type === "button" || awaitingNode.type === "quick_reply"}
          placeholder={awaitingNode ? "Type a reply" : "Waiting for bot"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) submitUser(input.trim()); }}
        />
        <Button size="sm" disabled={!awaitingNode || !input.trim()} onClick={() => submitUser(input.trim())}>Send</Button>
      </div>
    </div>
  );
}
