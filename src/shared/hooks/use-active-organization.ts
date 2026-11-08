import { useCallback, useEffect, useState } from "react";
import {
  readActiveOrgId,
  writeActiveOrgId,
  subscribeActiveTenant,
} from "@/lib/tenant/active-tenant";


export type Organization = {
  id: string;
  name: string;
  slug: string;
  plan?: string;
  role?: "owner" | "admin" | "member";
  avatarUrl?: string;
};

/**
 * useActiveOrganization — reads/writes the active organization id for the
 * current browser. The list of organizations is expected to come from a
 * Query hook (e.g. `useOrganizationsQuery`) and is passed in.
 */
export function useActiveOrganization(all: Organization[]) {
  const [activeId, setActiveIdState] = useState<string | null>(null);

  // Hydrate + resubscribe via the shared helper so this hook stays in
  // lockstep with the RBAC guard, Query cache scope, and cross-tab sync.
  useEffect(() => {
    setActiveIdState(readActiveOrgId());
    return subscribeActiveTenant(() => {
      setActiveIdState(readActiveOrgId());
    });
  }, []);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    writeActiveOrgId(id);
  }, []);

  const active =
    all.find((o) => o.id === activeId) ?? all[0] ?? null;

  return { active, activeId: active?.id ?? null, setActiveId, all };
}
