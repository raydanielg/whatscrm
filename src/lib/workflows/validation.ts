import type { WorkflowGraph } from "./types";
import { NODE_REGISTRY_BY_TYPE } from "./node-registry";

export type ValidationIssue = {
  level: "error" | "warning";
  nodeId?: string;
  message: string;
};

export function validateGraph(graph: WorkflowGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { nodes, edges } = graph;

  if (nodes.length === 0) {
    issues.push({ level: "warning", message: "Workflow is empty." });
    return issues;
  }

  const triggers = nodes.filter((n) => NODE_REGISTRY_BY_TYPE[n.type]?.kind === "trigger");
  if (triggers.length === 0) issues.push({ level: "error", message: "Workflow needs at least one trigger." });
  if (triggers.length > 1) issues.push({ level: "warning", message: "Multiple triggers detected — only the first will fire." });

  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      issues.push({ level: "error", message: `Edge references missing node.` });
    }
  }

  // Orphan nodes (no incoming edge, not a trigger)
  const incoming = new Map<string, number>();
  edges.forEach((e) => incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1));
  for (const n of nodes) {
    const def = NODE_REGISTRY_BY_TYPE[n.type];
    if (!def) {
      issues.push({ level: "error", nodeId: n.id, message: `Unknown node type: ${n.type}` });
      continue;
    }
    if (def.kind !== "trigger" && !incoming.get(n.id)) {
      issues.push({ level: "warning", nodeId: n.id, message: `"${def.label}" has no incoming connection.` });
    }
    // Required fields
    for (const field of def.inputs ?? []) {
      if (field.required) {
        const v = (n.config ?? {})[field.key];
        if (v === undefined || v === null || v === "") {
          issues.push({ level: "error", nodeId: n.id, message: `${def.label}: "${field.label}" is required.` });
        }
      }
    }
  }

  // Cycle detection (excluding intentional loop nodes)
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  });
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  nodes.forEach((n) => color.set(n.id, WHITE));
  const dfs = (id: string): boolean => {
    color.set(id, GRAY);
    for (const nx of adj.get(id) ?? []) {
      const c = color.get(nx) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && dfs(nx)) return true;
    }
    color.set(id, BLACK);
    return false;
  };
  for (const n of nodes) {
    if (color.get(n.id) === WHITE && dfs(n.id)) {
      issues.push({ level: "error", message: "Workflow contains a cycle." });
      break;
    }
  }

  return issues;
}
