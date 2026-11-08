import {
  Play, MessageSquare, HelpCircle, GitBranch, MousePointerClick, Reply,
  FormInput, Sparkles, Webhook, Timer, UserPlus, Flag,
} from "lucide-react";
import type { ComponentType } from "react";

export type ChatbotNodeType =
  | "start"
  | "message"
  | "question"
  | "condition"
  | "button"
  | "quick_reply"
  | "form"
  | "ai"
  | "webhook"
  | "delay"
  | "transfer"
  | "end";

export type ChatbotNode = {
  id: string;
  type: ChatbotNodeType;
  position: { x: number; y: number };
  label?: string;
  config: Record<string, unknown>;
};

export type ChatbotEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  label?: string;
};

export type ChatbotFlow = { nodes: ChatbotNode[]; edges: ChatbotEdge[] };

export const EMPTY_FLOW: ChatbotFlow = { nodes: [], edges: [] };

export type NodeKind = "trigger" | "message" | "logic" | "input" | "ai" | "action" | "terminal";

export type ChatbotNodeDef = {
  type: ChatbotNodeType;
  label: string;
  kind: NodeKind;
  description: string;
  icon: ComponentType<{ className?: string }>;
  color: string; // tailwind bg/text token
  accent: string; // css hex for minimap
  defaults: Record<string, unknown>;
};

export const NODE_DEFS: ChatbotNodeDef[] = [
  { type: "start", label: "Start", kind: "trigger", description: "Entry point of the flow", icon: Play, color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", accent: "#10b981", defaults: {} },
  { type: "message", label: "Message", kind: "message", description: "Send text, image, or media", icon: MessageSquare, color: "text-sky-500 bg-sky-500/10 border-sky-500/30", accent: "#0ea5e9", defaults: { text: "Hello! 👋" } },
  { type: "question", label: "Question", kind: "input", description: "Ask and capture a reply", icon: HelpCircle, color: "text-violet-500 bg-violet-500/10 border-violet-500/30", accent: "#8b5cf6", defaults: { text: "What's your name?", variable: "name" } },
  { type: "condition", label: "Condition", kind: "logic", description: "Branch on a variable", icon: GitBranch, color: "text-amber-500 bg-amber-500/10 border-amber-500/30", accent: "#f59e0b", defaults: { variable: "name", operator: "equals", value: "" } },
  { type: "button", label: "Buttons", kind: "message", description: "Interactive buttons", icon: MousePointerClick, color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/30", accent: "#6366f1", defaults: { text: "Pick one:", buttons: ["Yes", "No"] } },
  { type: "quick_reply", label: "Quick Reply", kind: "message", description: "Quick reply chips", icon: Reply, color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/30", accent: "#06b6d4", defaults: { text: "How can we help?", replies: ["Sales", "Support", "Other"] } },
  { type: "form", label: "Form", kind: "input", description: "Multi-field form", icon: FormInput, color: "text-teal-500 bg-teal-500/10 border-teal-500/30", accent: "#14b8a6", defaults: { fields: [{ label: "Email", key: "email", type: "email" }] } },
  { type: "ai", label: "AI Reply", kind: "ai", description: "Generate a reply with AI", icon: Sparkles, color: "text-fuchsia-500 bg-fuchsia-500/10 border-fuchsia-500/30", accent: "#d946ef", defaults: { prompt: "Answer helpfully.", useRag: true } },
  { type: "webhook", label: "Webhook", kind: "action", description: "Call an external URL", icon: Webhook, color: "text-orange-500 bg-orange-500/10 border-orange-500/30", accent: "#f97316", defaults: { url: "https://", method: "POST" } },
  { type: "delay", label: "Delay", kind: "action", description: "Wait before continuing", icon: Timer, color: "text-slate-500 bg-slate-500/10 border-slate-500/30", accent: "#64748b", defaults: { seconds: 3 } },
  { type: "transfer", label: "Human Handoff", kind: "action", description: "Transfer to an agent", icon: UserPlus, color: "text-pink-500 bg-pink-500/10 border-pink-500/30", accent: "#ec4899", defaults: { team: "" } },
  { type: "end", label: "End", kind: "terminal", description: "End the conversation", icon: Flag, color: "text-rose-500 bg-rose-500/10 border-rose-500/30", accent: "#f43f5e", defaults: {} },
];

export const NODE_DEF_BY_TYPE: Record<ChatbotNodeType, ChatbotNodeDef> = NODE_DEFS.reduce(
  (acc, d) => { acc[d.type] = d; return acc; },
  {} as Record<ChatbotNodeType, ChatbotNodeDef>,
);

// ---------- Templates ----------
export type ChatbotFlowTemplate = { id: string; name: string; description: string; flow: ChatbotFlow };

const t = (type: ChatbotNodeType, id: string, x: number, y: number, config: Record<string, unknown> = {}) =>
  ({ id, type, position: { x, y }, config: { ...NODE_DEF_BY_TYPE[type].defaults, ...config } } satisfies ChatbotNode);
const e = (id: string, source: string, target: string, label?: string) =>
  ({ id, source, target, label } satisfies ChatbotEdge);

export const TEMPLATES: ChatbotFlowTemplate[] = [
  {
    id: "welcome",
    name: "Welcome & Menu",
    description: "Greet the user and show a quick-reply menu.",
    flow: {
      nodes: [
        t("start", "n1", 80, 140),
        t("message", "n2", 320, 140, { text: "Hi 👋 Welcome!" }),
        t("quick_reply", "n3", 580, 140, { text: "How can I help?", replies: ["Sales", "Support", "Pricing"] }),
        t("end", "n4", 860, 140),
      ],
      edges: [e("e1", "n1", "n2"), e("e2", "n2", "n3"), e("e3", "n3", "n4")],
    },
  },
  {
    id: "lead-qualify",
    name: "Lead Qualification",
    description: "Capture name + email, then route to AI.",
    flow: {
      nodes: [
        t("start", "n1", 60, 160),
        t("question", "n2", 280, 160, { text: "What's your name?", variable: "name" }),
        t("question", "n3", 520, 160, { text: "And your email?", variable: "email" }),
        t("ai", "n4", 780, 160, { prompt: "Qualify this lead based on their message.", useRag: true }),
        t("transfer", "n5", 1040, 160),
      ],
      edges: [e("e1", "n1", "n2"), e("e2", "n2", "n3"), e("e3", "n3", "n4"), e("e4", "n4", "n5")],
    },
  },
  {
    id: "faq-rag",
    name: "FAQ with AI + RAG",
    description: "Answer FAQs using knowledge base retrieval.",
    flow: {
      nodes: [
        t("start", "n1", 60, 160),
        t("message", "n2", 280, 160, { text: "Ask me anything about our product." }),
        t("question", "n3", 520, 160, { text: "Your question?", variable: "q" }),
        t("ai", "n4", 780, 160, { prompt: "Answer using the knowledge base.", useRag: true }),
        t("end", "n5", 1040, 160),
      ],
      edges: [e("e1", "n1", "n2"), e("e2", "n2", "n3"), e("e3", "n3", "n4"), e("e4", "n4", "n5")],
    },
  },
];

// ---------- Validation ----------
export type FlowIssue = { level: "error" | "warning"; message: string; nodeId?: string };

export function validateFlow(flow: ChatbotFlow): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const starts = flow.nodes.filter((n) => n.type === "start");
  if (starts.length === 0) issues.push({ level: "error", message: "Flow must have a Start node" });
  if (starts.length > 1) issues.push({ level: "warning", message: "Multiple Start nodes detected" });
  if (flow.nodes.length === 0) return issues;

  const hasOut = new Set(flow.edges.map((e) => e.source));
  const hasIn = new Set(flow.edges.map((e) => e.target));
  for (const n of flow.nodes) {
    const def = NODE_DEF_BY_TYPE[n.type];
    if (!def) { issues.push({ level: "error", message: `Unknown node type ${n.type}`, nodeId: n.id }); continue; }
    if (def.kind !== "terminal" && !hasOut.has(n.id)) {
      issues.push({ level: "warning", message: `${def.label} has no outgoing connection`, nodeId: n.id });
    }
    if (def.kind !== "trigger" && !hasIn.has(n.id)) {
      issues.push({ level: "warning", message: `${def.label} is unreachable`, nodeId: n.id });
    }
    if (n.type === "message" && !(n.config.text as string | undefined)?.trim()) {
      issues.push({ level: "error", message: "Message node needs text", nodeId: n.id });
    }
    if (n.type === "webhook" && !(n.config.url as string | undefined)?.startsWith("http")) {
      issues.push({ level: "error", message: "Webhook needs a valid URL", nodeId: n.id });
    }
  }
  return issues;
}

export const genFlowId = (): string => `n_${Math.random().toString(36).slice(2, 10)}`;
