/**
 * Bridges the Visual Builder flow shape (`ChatbotFlow` in `flow-types.ts`)
 * into the deterministic runtime shape (`FlowGraph` in `engines/flow-engine.ts`).
 *
 * The builder authors a richer node vocabulary (button, form, ai, webhook,
 * delay, transfer, ) than the runtime engine needs. This adapter:
 *
 *   • resolves each node's outgoing edge into an explicit `next` id
 *   • collapses side-effect-only nodes (delay, webhook) into pass-throughs
 *   • maps semantic equivalents (question→ask, button/quick_reply→quick_replies,
 *     transfer→handoff)
 *   • forwards conditional branches by `sourceHandle` ("true" / "false")
 *   • expands `form` nodes into a chain of `ask` nodes, one per field
 *   • replaces `ai` nodes with a marker that terminates the flow and hands
 *     the turn to the LLM path (via `ranAiFallback` on the next step)
 *
 * Any node the adapter does not understand is treated as a pass-through so
 * malformed graphs degrade gracefully instead of dead-ending.
 */
import type { ChatbotFlow, ChatbotNode, ChatbotEdge } from "./flow-types";
import type { FlowGraph, FlowNode } from "./engines/flow-engine";

const OPERATOR_MAP: Record<string, string> = {
  equals: "==",
  not_equals: "!=",
  greater_than: ">",
  less_than: "<",
  gte: ">=",
  lte: "<=",
  contains: "contains",
};

function edgeFrom(edges: ChatbotEdge[], nodeId: string, handle?: string): ChatbotEdge | undefined {
  return edges.find((e) => e.source === nodeId && (handle ? e.sourceHandle === handle : !e.sourceHandle || e.sourceHandle === "out"));
}

function anyEdgeFrom(edges: ChatbotEdge[], nodeId: string): ChatbotEdge | undefined {
  return edges.find((e) => e.source === nodeId);
}

/** Resolve `nodeId`'s effective successor, skipping over pass-through-only nodes. */
function resolveNext(
  edges: ChatbotEdge[],
  passthrough: Set<string>,
  nodeId: string | undefined,
  handle?: string,
  seen: Set<string> = new Set(),
): string | undefined {
  if (!nodeId || seen.has(nodeId)) return undefined;
  seen.add(nodeId);
  if (!passthrough.has(nodeId)) return nodeId;
  const e = handle ? edgeFrom(edges, nodeId, handle) : anyEdgeFrom(edges, nodeId);
  return resolveNext(edges, passthrough, e?.target, undefined, seen);
}

export interface AdapterResult {
  graph: FlowGraph;
  /** Node ids in the source flow that route directly to AI (used by orchestrator to fall back). */
  aiExitIds: Set<string>;
}

/**
 * Convert a builder `ChatbotFlow` into an engine `FlowGraph`. Returns an empty
 * graph when the flow is empty or has no `start` node — callers should then
 * skip the deterministic path entirely.
 */
export function adaptChatbotFlow(flow: ChatbotFlow | null | undefined): AdapterResult {
  const empty: AdapterResult = { graph: { nodes: [] }, aiExitIds: new Set() };
  if (!flow || !Array.isArray(flow.nodes) || flow.nodes.length === 0) return empty;

  const edges = flow.edges ?? [];
  const passthrough = new Set<string>();
  const aiExitIds = new Set<string>();
  for (const n of flow.nodes) {
    if (n.type === "delay" || n.type === "webhook") passthrough.add(n.id);
    if (n.type === "ai") aiExitIds.add(n.id);
  }

  const nodes: FlowNode[] = [];

  for (const n of flow.nodes) {
    if (passthrough.has(n.id)) continue;

    switch (n.type) {
      case "start":
        nodes.push({ id: n.id, type: "start", next: resolveNext(edges, passthrough, anyEdgeFrom(edges, n.id)?.target) });
        break;

      case "message":
        nodes.push({
          id: n.id,
          type: "message",
          text: String(n.config.text ?? ""),
          next: resolveNext(edges, passthrough, anyEdgeFrom(edges, n.id)?.target),
        });
        break;

      case "question": {
        const variable = String(n.config.variable ?? "answer");
        nodes.push({
          id: n.id,
          type: "ask",
          prompt: String(n.config.text ?? ""),
          save_as: variable,
          next: resolveNext(edges, passthrough, anyEdgeFrom(edges, n.id)?.target),
        });
        break;
      }

      case "condition": {
        const variable = String(n.config.variable ?? "");
        const rawOp = String(n.config.operator ?? "equals");
        const op = OPERATOR_MAP[rawOp] ?? "==";
        const value = String(n.config.value ?? "");
        nodes.push({
          id: n.id,
          type: "condition",
          expression: `${variable} ${op} "${value.replace(/"/g, '\\"')}"`,
          if_true: resolveNext(edges, passthrough, edgeFrom(edges, n.id, "true")?.target),
          if_false: resolveNext(edges, passthrough, edgeFrom(edges, n.id, "false")?.target),
        });
        break;
      }

      case "button":
      case "quick_reply": {
        const labels = (n.config.buttons ?? n.config.replies ?? []) as unknown[];
        const successor = resolveNext(edges, passthrough, anyEdgeFrom(edges, n.id)?.target);
        const options = (Array.isArray(labels) ? labels : []).map((l, i) => {
          const label = typeof l === "string" ? l : String((l as { label?: unknown } | null)?.label ?? `Option ${i + 1}`);
          const handleEdge = edgeFrom(edges, n.id, label) ?? edgeFrom(edges, n.id, `btn-${i}`);
          const target = resolveNext(edges, passthrough, handleEdge?.target) ?? successor;
          return { label, next: target ?? "" };
        }).filter((o) => o.next);
        if (options.length === 0) {
          nodes.push({
            id: n.id,
            type: "message",
            text: String(n.config.text ?? ""),
            next: successor,
          });
        } else {
          nodes.push({
            id: n.id,
            type: "quick_replies",
            text: String(n.config.text ?? ""),
            options,
          });
        }
        break;
      }

      case "form": {
        const rawFields = Array.isArray(n.config.fields) ? (n.config.fields as unknown[]) : [];
        const successor = resolveNext(edges, passthrough, anyEdgeFrom(edges, n.id)?.target);
        if (rawFields.length === 0) {
          nodes.push({ id: n.id, type: "message", text: String(n.config.intro ?? "Please share the following details."), next: successor });
          break;
        }
        // Expand into a chain of ask nodes: <formId>-f0 -> <formId>-f1 -> 
        rawFields.forEach((raw, i) => {
          const f = (raw ?? {}) as { label?: string; key?: string };
          const id = i === 0 ? n.id : `${n.id}-f${i}`;
          const nextId = i < rawFields.length - 1 ? `${n.id}-f${i + 1}` : successor;
          nodes.push({
            id,
            type: "ask",
            prompt: String(f.label ?? `Field ${i + 1}`),
            save_as: String(f.key ?? `field_${i}`),
            next: nextId,
          });
        });
        break;
      }

      case "transfer":
        nodes.push({
          id: n.id,
          type: "handoff",
          team_id: (n.config.team as string | undefined) || undefined,
          reason: (n.config.reason as string | undefined) || "flow",
        });
        break;

      case "ai": {
        // Terminate the flow here and hand off to the LLM path. We model this
        // as an `end` node in the engine, but tag it via `aiExitIds` so the
        // orchestrator knows to invoke the AI engine after this step.
        nodes.push({ id: n.id, type: "end" });
        break;
      }

      case "end":
        nodes.push({ id: n.id, type: "end" });
        break;

      case "delay":
      case "webhook":
        // Handled by passthrough — should be unreachable here.
        break;

      default: {
        // Unknown types degrade to a pass-through message.
        const successor = resolveNext(edges, passthrough, anyEdgeFrom(edges, n.id)?.target);
        nodes.push({ id: n.id, type: "message", text: "", next: successor });
      }
    }
  }

  return { graph: { nodes }, aiExitIds };
}
