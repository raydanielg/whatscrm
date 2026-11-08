import { useEffect, useState, useCallback } from "react";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { listGoogleWorkspaceConnections, disconnectGoogleWorkspace, setGoogleWorkspaceStatus } from "./google-workspace.functions";

/**
 * Client-side installed-integrations store. Persists per-workspace demo state
 * for the marketplace lifecycle flows (install/disable/reconnect/disconnect)
 * for providers without server persistence. Google Workspace is restored from
 * verified server metadata, and every local entry is scoped by user/workspace.
 *
 * Credential values are stored as opaque, non-secret metadata only (last-4,
 * label, redirect account name). Real secrets never touch the browser store.
 */
export type InstalledStatus = "active" | "disabled" | "needs_reconnect" | "error";

export type ConnectionMeta = {
  /** Human label shown in the UI (e.g. Google account email, API key name). */
  accountLabel?: string;
  /** Redacted trailing 4 chars for API-key style creds. */
  keyLast4?: string;
  /** Non-secret config values (dropdown selections, URLs, booleans). */
  config?: Record<string, string | boolean | undefined>;
  /** Inbound webhook URL WACRM exposes to the provider, if any. */
  callbackUrl?: string;
};

export type ConnectionEvent = {
  at: string;
  kind:
    | "installed"
    | "reconnected"
    | "disabled"
    | "enabled"
    | "disconnected"
    | "synced"
    | "error"
    | "webhook_updated"
    | "webhook_tested"
    | "webhook_rotated";
  note?: string;
};

export type WebhookDelivery = {
  at: string;
  event: string;
  status: number;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export type WebhookConfig = {
  url: string;
  secret: string;
  secretLast4: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
  rotatedAt?: string;
  deliveries?: WebhookDelivery[];
};

export type InstalledIntegration = {
  providerId: string;
  status: InstalledStatus;
  installedAt: string;
  lastSyncAt?: string;
  scopes?: readonly string[];
  meta?: ConnectionMeta;
  events?: ConnectionEvent[];
  webhook?: WebhookConfig;
};

const STORAGE_KEY = "wacrm.integrations.installed.v2";

function generateSecret(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return (
    "whsec_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

function read(scope: string | null): InstalledIntegration[] {
  if (typeof window === "undefined" || !scope) return [];
  try {
    const raw =
      window.localStorage.getItem(`${STORAGE_KEY}.${scope}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InstalledIntegration[]) : [];
  } catch {
    return [];
  }
}

function write(scope: string | null, list: InstalledIntegration[]) {
  if (!scope) throw new Error("Select a workspace and sign in before changing integrations");
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${STORAGE_KEY}.${scope}`, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("integrations:installed-changed"));
}

function appendEvent(item: InstalledIntegration, ev: ConnectionEvent): InstalledIntegration {
  const events = [...(item.events ?? []), ev].slice(-20);
  return { ...item, events };
}

export function useInstalledIntegrations() {
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const scope = active?.id && user?.id ? `${user.id}.${active.id}` : null;
  const [items, setItems] = useState<InstalledIntegration[]>([]);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(read(scope));
    setLoadedScope(scope);
    setHydrated(true);
    const refresh = () => setItems(read(scope));
    window.addEventListener("integrations:installed-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("integrations:installed-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [scope]);

  useEffect(() => {
    if (!scope || !active?.id) return;
    let cancelled = false;
    void listGoogleWorkspaceConnections({ data: { workspaceId: active.id } }).then((rows) => {
      if (cancelled) return;
      const local = read(scope).filter((item) => item.providerId !== "google-workspace");
      for (const row of rows) local.push({ providerId: row.provider_id, status: row.status,
        installedAt: row.connected_at, meta: { accountLabel: row.account_email } });
      write(scope, local);
    }).catch(() => {
      // Failed server verification must not render a local Google connection as active.
      if (cancelled) return;
      setItems(read(scope).map((item) => item.providerId === "google-workspace"
        ? { ...item, status: "error" } : item));
    });
    return () => { cancelled = true; };
  }, [scope, active?.id]);

  const install = useCallback(
    (
      providerId: string,
      opts?: { scopes?: readonly string[]; meta?: ConnectionMeta; note?: string },
    ) => {
      const now = new Date().toISOString();
      const list = read(scope).filter((i) => i.providerId !== providerId);
      const item: InstalledIntegration = {
        providerId,
        status: "active",
        installedAt: now,
        lastSyncAt: now,
        scopes: opts?.scopes,
        meta: opts?.meta,
        events: [{ at: now, kind: "installed", note: opts?.note }],
      };
      list.push(item);
      write(scope, list);
    },
    [scope],
  );

  const reconnect = useCallback(
    (providerId: string, opts?: { meta?: ConnectionMeta; note?: string }) => {
      const now = new Date().toISOString();
      const list = read(scope).map((i) => {
        if (i.providerId !== providerId) return i;
        return appendEvent(
          {
            ...i,
            status: "active",
            lastSyncAt: now,
            meta: { ...(i.meta ?? {}), ...(opts?.meta ?? {}) },
          },
          { at: now, kind: "reconnected", note: opts?.note },
        );
      });
      write(scope, list);
    },
    [scope],
  );

  const update = useCallback((providerId: string, patch: Partial<InstalledIntegration>) => {
    const list = read(scope).map((i) => (i.providerId === providerId ? { ...i, ...patch } : i));
    write(scope, list);
  }, [scope]);

  const setStatus = useCallback(async (providerId: string, status: InstalledStatus, note?: string) => {
    if (!scope || !active?.id) throw new Error("Select a workspace before changing integrations");
    if (providerId === "google-workspace") {
      if (status !== "active" && status !== "disabled") throw new Error("Reconnect Google Workspace to restore authorization");
      await setGoogleWorkspaceStatus({ data: { workspaceId: active.id, status } });
    }
    const kind: ConnectionEvent["kind"] =
      status === "active" ? "enabled" : status === "disabled" ? "disabled" : "error";
    const now = new Date().toISOString();
    const list = read(scope).map((i) =>
      i.providerId === providerId ? appendEvent({ ...i, status }, { at: now, kind, note }) : i,
    );
    write(scope, list);
  }, [scope, active?.id]);

  const markSynced = useCallback((providerId: string) => {
    const now = new Date().toISOString();
    const list = read(scope).map((i) =>
      i.providerId === providerId
        ? appendEvent({ ...i, lastSyncAt: now }, { at: now, kind: "synced" })
        : i,
    );
    write(scope, list);
  }, [scope]);

  const remove = useCallback(async (providerId: string, note?: string) => {
    if (!scope || !active?.id) throw new Error("Select a workspace before disconnecting");
    if (providerId === "google-workspace") await disconnectGoogleWorkspace({ data: { workspaceId: active.id } });
    // Keep the event log-less remove for now; caller shows a toast with reason.
    void note;
    write(scope, read(scope).filter((i) => i.providerId !== providerId));
  }, [scope, active?.id]);

  const configureWebhook = useCallback(
    (
      providerId: string,
      patch: { url?: string; events?: string[]; enabled?: boolean },
    ) => {
      const now = new Date().toISOString();
      const list = read(scope).map((i) => {
        if (i.providerId !== providerId) return i;
        const existing = i.webhook;
        const secret = existing?.secret ?? generateSecret();
        const webhook: WebhookConfig = {
          url: patch.url ?? existing?.url ?? "",
          events: patch.events ?? existing?.events ?? [],
          enabled: patch.enabled ?? existing?.enabled ?? true,
          secret,
          secretLast4: secret.slice(-4),
          createdAt: existing?.createdAt ?? now,
          rotatedAt: existing?.rotatedAt,
          deliveries: existing?.deliveries ?? [],
        };
        return appendEvent(
          { ...i, webhook },
          { at: now, kind: "webhook_updated" },
        );
      });
      write(scope, list);
    },
    [scope],
  );

  const rotateWebhookSecret = useCallback((providerId: string) => {
    const now = new Date().toISOString();
    const secret = generateSecret();
    const list = read(scope).map((i) => {
      if (i.providerId !== providerId || !i.webhook) return i;
      const webhook: WebhookConfig = {
        ...i.webhook,
        secret,
        secretLast4: secret.slice(-4),
        rotatedAt: now,
      };
      return appendEvent({ ...i, webhook }, { at: now, kind: "webhook_rotated" });
    });
    write(scope, list);
    return secret;
  }, [scope]);

  const testWebhook = useCallback(
    async (providerId: string, event: string): Promise<WebhookDelivery> => {
      const started = performance.now();
      const current = read(scope).find((i) => i.providerId === providerId);
      const url = current?.webhook?.url;
      let delivery: WebhookDelivery;
      if (!url) {
        delivery = {
          at: new Date().toISOString(),
          event,
          status: 0,
          ok: false,
          latencyMs: 0,
          error: "Webhook URL not configured",
        };
      } else {
        // Simulated delivery — real dispatch happens server-side once wired.
        await new Promise((r) => setTimeout(r, 350 + Math.random() * 400));
        const ok = Math.random() > 0.15;
        delivery = {
          at: new Date().toISOString(),
          event,
          status: ok ? 200 : 500,
          ok,
          latencyMs: Math.round(performance.now() - started),
          error: ok ? undefined : "Simulated non-2xx response",
        };
      }
      const list = read(scope).map((i) => {
        if (i.providerId !== providerId || !i.webhook) return i;
        const deliveries = [delivery, ...(i.webhook.deliveries ?? [])].slice(0, 10);
        return appendEvent(
          { ...i, webhook: { ...i.webhook, deliveries } },
          { at: delivery.at, kind: "webhook_tested", note: `${event} → ${delivery.status}` },
        );
      });
      write(scope, list);
      return delivery;
    },
    [scope],
  );

  return {
    items: loadedScope === scope ? items : [],
    hydrated: loadedScope === scope && hydrated,
    install,
    reconnect,
    update,
    setStatus,
    markSynced,
    remove,
    configureWebhook,
    rotateWebhookSecret,
    testWebhook,
  };
}

export function useIsInstalled(providerId: string) {
  const { items, hydrated } = useInstalledIntegrations();
  return { installed: items.find((i) => i.providerId === providerId), hydrated };
}
