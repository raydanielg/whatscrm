/**
 * Centralised helper for tearing down and re-establishing Supabase Realtime
 * channels around an organization switch.
 *
 * Contract:
 *  - `resetRealtimeForOrgSwitch()` removes every channel currently open on
 *    the browser Supabase client and broadcasts a `wacrm:realtime-reset`
 *    event that hooks listen to via `useRealtimeGeneration()`.
 *  - Hooks that own a `supabase.channel(...)` subscription include the
 *    generation counter in their `useEffect` dependencies so the effect
 *    tears down the previous channel and re-subscribes with the new
 *    org-scoped filter as soon as the switch pipeline finalises.
 *
 * The pipeline calls this twice — once during the "clearing" phase to
 * silence org-A traffic before the cache is purged, and once during
 * "finalizing" so that any late channels that spun up during teardown are
 * cleaned before subscribers rebuild against org-B.
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { resetAllSubscriptions } from "@/lib/realtime/subscription-manager";

const REALTIME_RESET_EVENT = "wacrm:realtime-reset";

export type OrgRealtimeResetReason = "pre-switch" | "post-switch" | "manual";

/** Fire-and-forget teardown; safe to call in any phase of a switch. */
export function resetRealtimeForOrgSwitch(
  reason: OrgRealtimeResetReason = "manual",
): { ok: boolean; error?: unknown } {
  try {
    // Tear down the centralized manager's registry first so ref-counted
    // subscribers don't attempt to reuse channels bound to the previous org.
    resetAllSubscriptions();
    // Then drop any legacy channels created directly on the browser client.
    void supabase.removeAllChannels?.();
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(REALTIME_RESET_EVENT, { detail: { reason } }),
      );
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}


/**
 * Returns a monotonically increasing counter that bumps every time an org
 * switch resets realtime. Include the value in a `useEffect` dependency
 * list to force the effect to tear down its old channel and resubscribe
 * against the newly active organization.
 */
export function useRealtimeGeneration(): number {
  const [generation, setGeneration] = React.useState(0);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setGeneration((n) => n + 1);
    window.addEventListener(REALTIME_RESET_EVENT, bump);
    // Older call sites still emit `wacrm:org-changed`; treat both as a
    // resubscribe signal so hooks don't need to know which event fired.
    window.addEventListener("wacrm:org-changed", bump);
    return () => {
      window.removeEventListener(REALTIME_RESET_EVENT, bump);
      window.removeEventListener("wacrm:org-changed", bump);
    };
  }, []);
  return generation;
}
