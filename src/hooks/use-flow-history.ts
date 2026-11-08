import * as React from "react";

const LIMIT = 50;

export function useFlowHistory<T>(initial: T) {
  const [state, setState] = React.useState<T>(initial);
  const past = React.useRef<T[]>([]);
  const future = React.useRef<T[]>([]);
  const [, force] = React.useReducer((x: number) => x + 1, 0);

  const commit = React.useCallback((next: T | ((prev: T) => T)) => {
    setState((prev) => {
      const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      past.current.push(prev);
      if (past.current.length > LIMIT) past.current.shift();
      future.current = [];
      force();
      return value;
    });
  }, []);

  const undo = React.useCallback(() => {
    setState((prev) => {
      const p = past.current.pop();
      if (!p) return prev;
      future.current.push(prev);
      force();
      return p;
    });
  }, []);

  const redo = React.useCallback(() => {
    setState((prev) => {
      const n = future.current.pop();
      if (!n) return prev;
      past.current.push(prev);
      force();
      return n;
    });
  }, []);

  const reset = React.useCallback((v: T) => {
    past.current = [];
    future.current = [];
    setState(v);
    force();
  }, []);

  return {
    state,
    commit,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
