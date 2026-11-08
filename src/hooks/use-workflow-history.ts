import * as React from "react";
import type { WorkflowGraph } from "@/lib/workflows/types";

const LIMIT = 50;

/**
 * Undo/redo stack for the workflow graph.
 *
 * `canUndo` / `canRedo` are real state (not ref reads) so toolbar buttons
 * re-render and disable correctly. Commits that produce an identical graph are
 * dropped, which keeps the stack meaningful and avoids no-op autosaves.
 */
export function useWorkflowHistory(initial: WorkflowGraph) {
  const [graph, setGraphState] = React.useState<WorkflowGraph>(initial);
  const past = React.useRef<WorkflowGraph[]>([]);
  const future = React.useRef<WorkflowGraph[]>([]);
  const [depth, setDepth] = React.useState({ past: 0, future: 0 });

  const sync = React.useCallback(() => {
    setDepth({ past: past.current.length, future: future.current.length });
  }, []);

  const commit = React.useCallback(
    (next: WorkflowGraph | ((g: WorkflowGraph) => WorkflowGraph)) => {
      setGraphState((prev) => {
        const value = typeof next === "function" ? (next as (g: WorkflowGraph) => WorkflowGraph)(prev) : next;
        if (JSON.stringify(value) === JSON.stringify(prev)) return prev;
        past.current.push(prev);
        if (past.current.length > LIMIT) past.current.shift();
        future.current = [];
        return value;
      });
      sync();
    },
    [sync],
  );

  const setSilent = React.useCallback((next: WorkflowGraph) => setGraphState(next), []);

  const undo = React.useCallback(() => {
    setGraphState((prev) => {
      const p = past.current.pop();
      if (!p) return prev;
      future.current.push(prev);
      return p;
    });
    sync();
  }, [sync]);

  const redo = React.useCallback(() => {
    setGraphState((prev) => {
      const n = future.current.pop();
      if (!n) return prev;
      past.current.push(prev);
      return n;
    });
    sync();
  }, [sync]);

  const reset = React.useCallback(
    (g: WorkflowGraph) => {
      past.current = [];
      future.current = [];
      setGraphState(g);
      sync();
    },
    [sync],
  );

  return {
    graph,
    commit,
    setSilent,
    undo,
    redo,
    reset,
    canUndo: depth.past > 0,
    canRedo: depth.future > 0,
  };
}
