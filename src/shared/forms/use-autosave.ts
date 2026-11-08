"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export type UseAutosaveOptions<T> = {
  /** The value to persist. Save fires when this changes (deep-equality via JSON). */
  value: T;
  /** Async saver. Receives the current value and should throw on failure. */
  onSave: (value: T) => Promise<void> | void;
  /** Debounce in ms. Default 1200ms — feels immediate without hammering the API. */
  debounceMs?: number;
  /** Skip the first render (typical when loading data from server). */
  skipInitial?: boolean;
  /** Called when status changes — useful for logging or side-effects. */
  onStatusChange?: (status: AutosaveStatus) => void;
};

/**
 * Debounced autosave. Coalesces rapid edits into a single save call, tracks
 * status, and exposes `savedAt` for "Saved 3s ago" indicators. Never call
 * within a submit handler — for explicit submits, use `flush()`.
 */
export function useAutosave<T>({
  value,
  onSave,
  debounceMs = 1200,
  skipInitial = true,
  onStatusChange,
}: UseAutosaveOptions<T>) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const lastSerialized = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef(skipInitial);

  const setStatusSafe = useCallback(
    (s: AutosaveStatus) => {
      setStatus(s);
      onStatusChange?.(s);
    },
    [onStatusChange],
  );

  const doSave = useCallback(
    async (v: T) => {
      setStatusSafe("saving");
      try {
        await onSave(v);
        lastSerialized.current = JSON.stringify(v);
        setSavedAt(new Date());
        setError(null);
        setStatusSafe("saved");
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatusSafe("error");
      }
    },
    [onSave, setStatusSafe],
  );

  useEffect(() => {
    const serialized = JSON.stringify(value);
    if (initial.current) {
      initial.current = false;
      lastSerialized.current = serialized;
      return;
    }
    if (serialized === lastSerialized.current) return;

    setStatusSafe("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void doSave(value);
    }, debounceMs);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, debounceMs, doSave, setStatusSafe]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const serialized = JSON.stringify(value);
    if (serialized === lastSerialized.current) return;
    await doSave(value);
  }, [value, doSave]);

  return { status, savedAt, error, flush };
}
