import * as React from "react";

/**
 * Global registry of "unsaved edits" flags, keyed by an owner id (usually a
 * form / page). Any component can register a flag; readers (like the
 * organization switcher) can synchronously check whether the current view has
 * pending edits before performing a destructive navigation.
 *
 * We intentionally keep this outside React state so a switcher living far up
 * the tree can read the latest value without prop-drilling or re-render loops.
 */
type Listener = () => void;

const flags = new Map<string, { dirty: boolean; label?: string }>();
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function setUnsavedFlag(id: string, dirty: boolean, label?: string) {
  const prev = flags.get(id);
  if (!dirty) {
    if (!prev) return;
    flags.delete(id);
  } else {
    if (prev && prev.dirty === dirty && prev.label === label) return;
    flags.set(id, { dirty, label });
  }
  emit();
}

export function clearUnsavedFlag(id: string) {
  if (flags.delete(id)) emit();
}

export function hasUnsavedChanges(): boolean {
  for (const v of flags.values()) if (v.dirty) return true;
  return false;
}

export function listUnsavedLabels(): string[] {
  return Array.from(flags.values())
    .filter((v) => v.dirty)
    .map((v) => v.label || "Unsaved changes")
    .filter((v, i, a) => a.indexOf(v) === i);
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Register that this component/page has unsaved edits. Automatically clears
 * on unmount so navigating away doesn't leave a stale flag behind.
 */
export function useUnsavedChanges(dirty: boolean, label?: string) {
  const idRef = React.useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `uc-${Math.random().toString(36).slice(2)}`,
  );
  React.useEffect(() => {
    setUnsavedFlag(idRef.current, dirty, label);
  }, [dirty, label]);
  React.useEffect(() => {
    const id = idRef.current;
    return () => clearUnsavedFlag(id);
  }, []);

  // Native browser guard for tab close / hard reload while dirty.
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/** Reactive read for components that want to render based on dirty state. */
export function useHasUnsavedChanges(): boolean {
  const [snapshot, setSnapshot] = React.useState(hasUnsavedChanges);
  React.useEffect(() => {
    const unsub = subscribe(() => setSnapshot(hasUnsavedChanges()));
    return () => {
      unsub();
    };
  }, []);
  return snapshot;
}
