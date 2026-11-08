/**
 * Shared workflow graph types. Used by the visual builder, the execution
 * engine, and versioning snapshots.
 */

export type WorkflowNode = {
  id: string;
  type: string; // registry key, e.g. "action.whatsapp.send_message"
  position: { x: number; y: number };
  config: Record<string, unknown>;
  label?: string;
};

export type WorkflowEdge = {
  id: string;
  source: string; // node id
  target: string; // node id
  /** Optional branch label for logic nodes ("true", "false", "case-a", ) */
  branch?: string;
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type WorkflowRunStatus = "pending" | "running" | "success" | "failed" | "cancelled";
export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export type RunContext = {
  runId: string;
  workspaceId: string;
  automationId: string;
  version: number;
  triggerSource: string;
  /** Variables produced by upstream nodes, keyed by node id. */
  variables: Record<string, unknown>;
};

export const EMPTY_GRAPH: WorkflowGraph = { nodes: [], edges: [] };
