/**
 * Cross-tab organization synchronization.
 *
 * When the active org changes in one tab, all other open tabs must:
 *   1. Silence org-A realtime channels
 *   2. Purge cached queries scoped to org-A
 *   3. Update their local activeId state
 *   4. Resubscribe realtime with org-B filters
 *
 * We use two transports for resilience:
 *   - `BroadcastChannel` — instant, same-origin, works even without a
 *     localStorage delta (e.g. same org id written twice).
 *   - `storage` event — fallback for browsers/contexts that block
 *     BroadcastChannel (Safari private mode, some extensions).
 *
 * The originating tab does NOT receive its own `storage` event; the
 * BroadcastChannel is scoped to *other* tabs by design (we skip messages
 * whose source id matches this tab's id).
 */
import { ACTIVE_ORG_KEY as ORG_KEY } from "@/lib/tenant/active-tenant";
const CHANNEL_NAME = "wacrm.org.sync.v1";

let tabId: string | null = null;

function getTabId(): string {
  if (tabId) return tabId;
  if (typeof window === "undefined") return "ssr";
  try {
    tabId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  } catch {
    tabId = `tab-${Math.random().toString(36).slice(2)}`;
  }
  return tabId;
}

export type OrgSyncMessage = {
  type: "org-changed";
  orgId: string | null;
  sourceTabId: string;
  at: number;
};

let bc: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (typeof BroadcastChannel === "undefined") return null;
  if (!bc) {
    try {
      bc = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      bc = null;
    }
  }
  return bc;
}

/**
 * Broadcast a local org change to sibling tabs. Called by `setActiveOrgId`
 * after localStorage is updated.
 */
export function broadcastOrgChange(orgId: string | null) {
  const ch = getChannel();
  if (!ch) return;
  const msg: OrgSyncMessage = {
    type: "org-changed",
    orgId,
    sourceTabId: getTabId(),
    at: Date.now(),
  };
  try {
    ch.postMessage(msg);
  } catch {
    /* channel may be closed after page navigation; ignore */
  }
}

/**
 * Subscribe to org-change events from other tabs. Fires `handler(orgId)`
 * only for foreign events (never for the current tab's own broadcasts).
 * Returns an unsubscribe fn.
 */
export function onRemoteOrgChange(
  handler: (orgId: string | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const ch = getChannel();
  const onMsg = (ev: MessageEvent<OrgSyncMessage>) => {
    const data = ev.data;
    if (!data || data.type !== "org-changed") return;
    if (data.sourceTabId === getTabId()) return;
    handler(data.orgId);
  };
  ch?.addEventListener("message", onMsg);

  // Fallback path: `storage` fires in every OTHER tab when localStorage
  // changes. Guaranteed to be a foreign write from this tab's perspective.
  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== ORG_KEY && !ev.key?.startsWith(`${ORG_KEY}:`)) return;
    if (ev.newValue === ev.oldValue) return;
    handler(ev.newValue);
  };
  window.addEventListener("storage", onStorage);

  return () => {
    ch?.removeEventListener("message", onMsg);
    window.removeEventListener("storage", onStorage);
  };
}

export const __CROSS_TAB_ORG_KEY = ORG_KEY;
export const __TAB_ID = getTabId;
