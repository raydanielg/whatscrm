/**
 * FlowEngine — deterministic node graph for guided conversations.
 *
 * The visual builder writes to `chatbots.flow` (nodes + edges). The engine
 * walks the graph one node at a time. If no matching flow node handles the
 * incoming message, it defers to the AI engine.
 *
 * Node types intentionally overlap with the workflow builder so the same
 * mental model applies.
 */
import type { JsonValue } from "../chatbots.functions";

export type FlowNode =
  | { id: string; type: "start"; next?: string }
  | { id: string; type: "message"; text: string; next?: string }
  | { id: string; type: "ask"; prompt: string; save_as: string; next?: string }
  | { id: string; type: "condition"; expression: string; if_true?: string; if_false?: string }
  | { id: string; type: "intent"; branches: Array<{ intent: string; next: string }>; default?: string }
  | { id: string; type: "quick_replies"; text: string; options: Array<{ label: string; next: string }> }
  | { id: string; type: "handoff"; team_id?: string; reason?: string }
  | { id: string; type: "end" };

export interface FlowGraph {
  nodes: FlowNode[];
  edges?: Array<{ from: string; to: string }>;
}

export interface FlowState {
  currentNodeId: string | null;
  variables: Record<string, string>;
  awaitingInputFor?: string | null;
}

export interface FlowStep {
  reply?: string;
  quickReplies?: string[];
  handoff?: { reason: string; teamId?: string | null };
  state: FlowState;
  done: boolean;
  ranAiFallback?: boolean;
}

export const FlowEngine = {
  isEmpty(flow: JsonValue): boolean {
    const g = flow as unknown as FlowGraph | null;
    return !g || !Array.isArray(g.nodes) || g.nodes.length === 0;
  },

  entry(flow: FlowGraph): FlowNode | null {
    return flow.nodes.find((n) => n.type === "start") ?? flow.nodes[0] ?? null;
  },

  node(flow: FlowGraph, id: string | null | undefined): FlowNode | null {
    if (!id) return null;
    return flow.nodes.find((n) => n.id === id) ?? null;
  },

  /**
   * Advance the flow by consuming the user's message. Returns the next reply
   * (if any) and the updated state. When `done`, the orchestrator should hand
   * control back to the AI engine or close the session.
   */
  step(flow: FlowGraph, state: FlowState, userMessage: string, intentName: string): FlowStep {
    let current = FlowEngine.node(flow, state.currentNodeId) ?? FlowEngine.entry(flow);
    if (!current) return { done: true, state };

    // If we were waiting for input, capture it before advancing.
    if (state.awaitingInputFor) {
      state.variables[state.awaitingInputFor] = userMessage;
      state.awaitingInputFor = null;
      const askNode = flow.nodes.find(
        (n) => n.type === "ask" && n.save_as === state.awaitingInputFor,
      );
      if (askNode?.type === "ask" && askNode.next) {
        current = FlowEngine.node(flow, askNode.next) ?? current;
      }
    }

    const out: FlowStep = { state: { ...state, currentNodeId: current.id }, done: false };
    let safety = 0;
    while (current && safety++ < 25) {
      switch (current.type) {
        case "start": {
          const next = FlowEngine.node(flow, current.next);
          if (!next) { out.done = true; return out; }
          current = next; break;
        }
        case "message": {
          out.reply = FlowEngine.render(current.text, state.variables);
          const next = FlowEngine.node(flow, current.next);
          out.state.currentNodeId = next?.id ?? null;
          if (!next) out.done = true;
          return out;
        }
        case "ask": {
          out.reply = FlowEngine.render(current.prompt, state.variables);
          out.state.currentNodeId = current.id;
          out.state.awaitingInputFor = current.save_as;
          return out;
        }
        case "condition": {
          const truthy = FlowEngine.evaluate(current.expression, state.variables);
          const next = FlowEngine.node(flow, truthy ? current.if_true : current.if_false);
          if (!next) { out.done = true; return out; }
          current = next; break;
        }
        case "intent": {
          const branch = current.branches.find((b) => b.intent === intentName);
          const next = FlowEngine.node(flow, branch?.next ?? current.default);
          if (!next) { out.done = true; out.ranAiFallback = true; return out; }
          current = next; break;
        }
        case "quick_replies": {
          out.reply = FlowEngine.render(current.text, state.variables);
          out.quickReplies = current.options.map((o) => o.label);
          out.state.currentNodeId = current.id;
          return out;
        }
        case "handoff": {
          out.handoff = { reason: current.reason ?? "flow", teamId: current.team_id ?? null };
          out.state.currentNodeId = current.id;
          out.done = true;
          return out;
        }
        case "end": {
          out.done = true;
          out.state.currentNodeId = null;
          return out;
        }
      }
    }
    out.done = true;
    return out;
  },

  render(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
  },

  /**
   * Extremely small, safe expression evaluator: supports `var op value`
   * where op ∈ {==,!=,>,<,>=,<=,contains}. No user code executes.
   */
  evaluate(expr: string, vars: Record<string, string>): boolean {
    const m = expr.match(/^\s*([\w.]+)\s*(==|!=|>=|<=|>|<|contains)\s*(.+?)\s*$/);
    if (!m) return false;
    const left = vars[m[1]] ?? "";
    const op = m[2];
    const right = m[3].replace(/^['"]|['"]$/g, "");
    const a = left; const b = right;
    switch (op) {
      case "==": return a === b;
      case "!=": return a !== b;
      case ">": return Number(a) > Number(b);
      case "<": return Number(a) < Number(b);
      case ">=": return Number(a) >= Number(b);
      case "<=": return Number(a) <= Number(b);
      case "contains": return a.toLowerCase().includes(b.toLowerCase());
      default: return false;
    }
  },
};
