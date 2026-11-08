/**
 * OrgUrlSync — keeps the active organization id mirrored in the URL as
 * `?org=<uuid>` so that:
 *
 *   1. Deep links / bookmarks / support-shared URLs always resolve to the
 *      intended tenant, even if the recipient's localStorage points at a
 *      different org (or has none yet).
 *   2. A page refresh / hard reload never falls back to "first org" and
 *      redirects the user to Dashboard when they were on a tenant-scoped
 *      Settings page.
 *   3. Cross-tab / cross-window switches surface as visible URL changes
 *      so the browser history reflects the current tenant.
 *
 * The URL is the source of truth on load; the localStorage slot is the
 * source of truth on switch. Both are kept in lockstep by this component.
 */

import { useEffect, useRef } from "react";
import {
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  isUuid,
  ORG_CHANGED_EVENT,
  readHostedTenant,
  readActiveOrgId,
  subscribeActiveTenant,
  writeActiveOrgId,
} from "@/lib/tenant/active-tenant";
import { supabase } from "@/integrations/supabase/client";


function getUrlOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = new URL(window.location.href).searchParams.get("org");
    return v && isUuid(v) ? v : null;
  } catch {
    return null;
  }
}

export function OrgUrlSync() {
  const router = useRouter();
  const locationHref = useRouterState({ select: (s) => s.location.href });
  const lastAppliedRef = useRef<string | null>(null);
  const initialActiveRef = useRef(readActiveOrgId());
  const initialUrlCheckRef = useRef(
    Boolean(getUrlOrgId() && getUrlOrgId() !== initialActiveRef.current),
  );

  // URL → storage: whenever a URL carries `?org=<uuid>`, adopt it as the
  // active tenant BEFORE downstream guards / hooks read the slot on the
  // next render tick — but only when the user is actually a member of that
  // organization. Adopting a stale/foreign id from a shared link is what
  // produced the "previously selected organization is no longer available"
  // bounce plus tenant-scoped pages loading nothing.
  useEffect(() => {
    if (readHostedTenant()) return;
    const fromUrl = getUrlOrgId();
    if (!fromUrl) {
      initialUrlCheckRef.current = false;
      return;
    }
    if (fromUrl === lastAppliedRef.current) return;
    if (fromUrl === readActiveOrgId()) {
      initialUrlCheckRef.current = false;
      lastAppliedRef.current = fromUrl;
      return;
    }
    const activeAtStart = readActiveOrgId();
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (cancelled) return;
      if (!userId) {
        initialUrlCheckRef.current = false;
        window.dispatchEvent(new CustomEvent(ORG_CHANGED_EVENT));
        return;
      }
      const { data: member } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", fromUrl)
        .eq("user_id", userId)
        .maybeSingle();
      // A live switch may finish while the membership request is pending.
      if (cancelled || getUrlOrgId() !== fromUrl || readActiveOrgId() !== activeAtStart) return;
      initialUrlCheckRef.current = false;
      if (!member) {
        window.dispatchEvent(new CustomEvent(ORG_CHANGED_EVENT));
        return;
      }
      writeActiveOrgId(fromUrl);
      lastAppliedRef.current = fromUrl;
    })();
    return () => {
      cancelled = true;
    };
  }, [locationHref]);


  // Storage → URL: when the active org changes (switcher, cross-tab, or
  // programmatic), reflect it in the URL without touching the pathname or
  // other search params. Uses `replace` so we don't pollute history with
  // one entry per switch.
  useEffect(() => {
    const sync = () => {
      const active = readActiveOrgId();
      if (initialUrlCheckRef.current && active === initialActiveRef.current) return;
      const inUrl = getUrlOrgId();
      const hosted = readHostedTenant();
      if ((!active && !hosted) || active === inUrl) return;
      // Skip mirroring on public / auth surfaces where the tenant param
      // would leak into unauthenticated URLs.
      const path = router.state.location.pathname;
      if (
        path === "/" ||
        path.startsWith("/auth") ||
        path.startsWith("/install") ||
        path.startsWith("/setup") ||
        path.startsWith("/oauth")
      ) {
        return;
      }
      // Build the target href with the URL API rather than a search reducer:
      // route-level search schemas (marketplace filters, table state, ) then
      // round-trip byte-for-byte instead of being re-serialized.
      const url = new URL(window.location.href);
      if (active) url.searchParams.set("org", active);
      else url.searchParams.delete("org");
      const targetHref = `${url.pathname}${url.search}${url.hash}`;
      // Replacing history is immediate. Waiting for route loaders before
      // changing the address bar left the old `?org=` visible and able to
      // restore the previous tenant during a concurrent navigation.
      router.history.replace(targetHref, router.history.location.state, {
        ignoreBlocker: true,
      });

      lastAppliedRef.current = active;
    };
    // Run once to seed the URL after login / hard reload.
    sync();
    return subscribeActiveTenant(sync);
  }, [router]);

  return null;
}
