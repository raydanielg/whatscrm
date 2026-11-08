/**
 * Inbox sync preferences (per workspace, stored locally).
 *
 * Controls how often the conversation list refetches in the background and
 * when the manual "Sync" button is offered in the toolbar.
 */
import { useCallback, useEffect, useState } from "react";

export type SyncButtonMode = "always" | "auto-off" | "never";

export type InboxSyncSettings = {
  /** Background refetch interval in ms. 0 disables auto refetch. */
  refetchIntervalMs: number;
  /** When the manual sync button is visible. */
  syncButtonMode: SyncButtonMode;
  /** Whether realtime (websocket) conversation updates are subscribed to. */
  realtimeEnabled: boolean;
};

export const SYNC_INTERVAL_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Off (realtime only)" },
  { value: 10_000, label: "Every 10 seconds" },
  { value: 30_000, label: "Every 30 seconds" },
  { value: 60_000, label: "Every minute" },
  { value: 300_000, label: "Every 5 minutes" },
];

export const SYNC_BUTTON_OPTIONS: Array<{ value: SyncButtonMode; label: string }> = [
  { value: "always", label: "Always show" },
  { value: "auto-off", label: "Only when auto-refresh is off" },
  { value: "never", label: "Never show" },
];

export const DEFAULT_SYNC_SETTINGS: InboxSyncSettings = {
  refetchIntervalMs: 30_000,
  syncButtonMode: "always",
  realtimeEnabled: true,
};

const EVENT = "wacrm:inbox-sync-settings";
const keyFor = (workspaceId?: string | null) =>
  `wacrm.inbox.sync.v1:${workspaceId ?? "none"}`;

function parse(raw: string | null): InboxSyncSettings {
  if (!raw) return DEFAULT_SYNC_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<InboxSyncSettings>;
    const interval = Number(v?.refetchIntervalMs);
    const mode = v?.syncButtonMode;
    return {
      refetchIntervalMs: SYNC_INTERVAL_OPTIONS.some((o) => o.value === interval)
        ? interval
        : DEFAULT_SYNC_SETTINGS.refetchIntervalMs,
      syncButtonMode: SYNC_BUTTON_OPTIONS.some((o) => o.value === mode)
        ? (mode as SyncButtonMode)
        : DEFAULT_SYNC_SETTINGS.syncButtonMode,
      realtimeEnabled:
        typeof v?.realtimeEnabled === "boolean"
          ? v.realtimeEnabled
          : DEFAULT_SYNC_SETTINGS.realtimeEnabled,
    };
  } catch {
    return DEFAULT_SYNC_SETTINGS;
  }
}

export function readSyncSettings(workspaceId?: string | null): InboxSyncSettings {
  if (typeof window === "undefined") return DEFAULT_SYNC_SETTINGS;
  try {
    return parse(window.localStorage.getItem(keyFor(workspaceId)));
  } catch {
    return DEFAULT_SYNC_SETTINGS;
  }
}

/** Should the manual sync control render for these settings? */
export function shouldShowSyncButton(s: InboxSyncSettings): boolean {
  if (s.syncButtonMode === "never") return false;
  if (s.syncButtonMode === "auto-off") return s.refetchIntervalMs === 0;
  return true;
}

/**
 * Reads/writes the per-workspace sync settings and keeps every mounted
 * consumer (list, toolbar, hooks) in sync through a window event.
 */
export function useInboxSyncSettings(workspaceId?: string | null) {
  const [settings, setSettings] = useState<InboxSyncSettings>(DEFAULT_SYNC_SETTINGS);

  // localStorage is read after mount so SSR and hydration agree.
  useEffect(() => {
    setSettings(readSyncSettings(workspaceId));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ workspaceId?: string | null }>).detail;
      if (detail && detail.workspaceId !== (workspaceId ?? null)) return;
      setSettings(readSyncSettings(workspaceId));
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [workspaceId]);

  const update = useCallback(
    (patch: Partial<InboxSyncSettings>) => {
      const next = { ...readSyncSettings(workspaceId), ...patch };
      try {
        window.localStorage.setItem(keyFor(workspaceId), JSON.stringify(next));
      } catch {
        /* storage unavailable — keep in-memory only */
      }
      setSettings(next);
      window.dispatchEvent(
        new CustomEvent(EVENT, { detail: { workspaceId: workspaceId ?? null } }),
      );
    },
    [workspaceId],
  );

  return { settings, update, showSyncButton: shouldShowSyncButton(settings) };
}

/** Compact "x ago" label for the last completed sync. */
export function formatSyncAgo(at: number | null, now: number = Date.now()): string {
  if (!at) return "never";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Human duration for how long a sync took. */
export function formatSyncDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
