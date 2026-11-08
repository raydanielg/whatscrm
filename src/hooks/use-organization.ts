import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { broadcastOrgChange } from "@/lib/realtime/org-cross-tab";
// Side-effect import: migrates legacy / older-shape localStorage keys before
// any hook below reads the active org, so cross-schema stale data can't leak.
import "@/lib/storage/org-storage-migration";
import { getCurrentUserId } from "@/lib/storage/active-user";
import {
  ACTIVE_ORG_KEY as ORG_KEY,
  ORG_CHANGED_EVENT,
  isUuid as isValidOrgIdInternal,
  orgKeyForCurrentUser,
  readActiveOrgId,
  clearActiveOrgId,
  clearActiveWorkspaceId,
  writeActiveOrgId,
  writeActiveTenantSelection,
} from "@/lib/tenant/active-tenant";
import { sbAny } from "@/lib/supabase/untyped";

// Re-export for legacy call sites that imported this from here.
const ORG_KEY_LEGACY = ORG_KEY;

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  logo_url: string | null;
  billing_email: string | null;
  industry: string | null;
  contact_email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  language: string;
  business_hours: Record<string, { open: string; close: string; closed?: boolean }>;
  working_days: number[];
  brand_settings: {
    primary_color?: string;
    accent_color?: string;
    logo_dark_url?: string;
  };
  created_at: string;
  updated_at: string;
};

export type OrgMemberRow = {
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type WorkspaceCacheRow = {
  organization_id?: string | null;
};

export function isValidOrgId(value: unknown): value is string {
  return isValidOrgIdInternal(value);
}

const getActiveOrgId = readActiveOrgId;

/**
 * Given the user's org list and the current stored id, return the id that
 * should actually be active. Falls back to the first membership when the
 * stored id is missing, malformed, or points at an org the user is no
 * longer a member of. Returns `null` when the user has no organizations.
 */
export function resolveActiveOrgId(
  storedId: string | null,
  memberships: ReadonlyArray<{ id: string }>,
): string | null {
  if (memberships.length === 0) return null;
  if (storedId && isValidOrgId(storedId)) {
    const match = memberships.find((o) => o.id === storedId);
    if (match) return match.id;
  }
  return memberships[0]?.id ?? null;
}

/**
 * Read the active organization id from the browser. Server-fn call sites
 * must pass this into their `organizationId` input; the server verifies it
 * via `getCallerOrgId` before touching the DB.
 */
export function getActiveOrgIdOrThrow(): string {
  const id = getActiveOrgId();
  if (!id) throw new Error("No active organization selected");
  return id;
}

/**
 * Fire-and-forget: mirror the active org selection to the user's profile
 * so the choice survives a full localStorage wipe, private-window session
 * restore, or signing in from a different device. Never blocks the UI and
 * never throws — the browser slot is the fast path; the DB is the backup.
 */
function persistActiveOrgToProfile(id: string) {
  const uid = getCurrentUserId();
  if (!uid) return;
  void supabase
    .from("profiles")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ last_active_organization_id: id } as any)
    .eq("id", uid)
    .then(
      () => undefined,
      () => undefined,
    );
}

export function setActiveOrgId(id: string) {
  // Delegates key resolution to the shared helper and fires the local
  // `wacrm:org-changed` event. We then layer on cross-tab broadcast and
  // profile mirroring, which are org-specific concerns.
  writeActiveOrgId(id);
  broadcastOrgChange(id);
  persistActiveOrgToProfile(id);
}

export function setActiveTenantSelection(orgId: string, workspaceId: string | null) {
  writeActiveTenantSelection(orgId, workspaceId);
  broadcastOrgChange(orgId);
  persistActiveOrgToProfile(orgId);
}

/**
 * Purge every piece of tenant-scoped state persisted in the browser.
 *
 * Called on sign-out to guarantee the next user (or the same user on the
 * next login) doesn't inherit a stale active org, workspace, or any
 * derived cache. Safe to call multiple times and safe during SSR.
 *
 * We intentionally do NOT delete the per-user active-org slot here — that
 * is what allows the same user to sign back in and land on the same org.
 * Only the legacy shared slot and workspace scratch state are cleared.
 *
 * Also fires `wacrm:org-changed` locally and broadcasts a `null` org id
 * to sibling tabs so their switchers, realtime channels, and query caches
 * reset in lockstep — no stale org-A data can render after logout.
 */
export function clearActiveOrgState() {
  if (typeof window === "undefined") return;
  try {
    // Drop only the legacy shared slot; per-user slots persist so the
    // next login for that user can restore their last active org.
    window.localStorage.removeItem(ORG_KEY_LEGACY);
    // Workspace selection is scoped inside an org; drop it too.
    window.localStorage.removeItem("wacrm.workspace.active.v1");
  } catch {
    /* private-mode / disabled storage — nothing to clean */
  }
  try {
    window.dispatchEvent(new CustomEvent("wacrm:org-changed"));
  } catch {
    /* jsdom / very old runtimes */
  }
  broadcastOrgChange(null);
}

/**
 * Hydrate the per-user active-org slot from the user's profile on sign-in
 * / session restore, when the browser has no local record yet. The local
 * slot always wins when it exists — it's the freshest signal — and we
 * mirror it back to the profile if the DB copy has drifted.
 *
 * Safe to call whenever the auth state changes; no-ops on SSR, on
 * missing user id, and when both stores already agree.
 */
export async function hydrateActiveOrgFromProfile(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isValidOrgId(userId)) return;
  const perUserKey = `${ORG_KEY_LEGACY}:${userId}`;
  let localRaw: string | null = null;
  try {
    localRaw = window.localStorage.getItem(perUserKey);
  } catch {
    return;
  }
  const local = localRaw && isValidOrgId(localRaw) ? localRaw : null;

  try {
    const { data, error } = await supabase
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("last_active_organization_id" as any)
      .eq("id", userId)
      .maybeSingle();
    if (error) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const remote = (data as any)?.last_active_organization_id as string | null | undefined;

    if (!local && remote && isValidOrgId(remote)) {
      // Restore from the profile — this is the "across reloads / session
      // restore" path when localStorage was cleared or the browser is new.
      try {
        window.localStorage.setItem(perUserKey, remote);
        window.localStorage.removeItem(ORG_KEY_LEGACY);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent("wacrm:org-changed"));
      broadcastOrgChange(remote);
      return;
    }

    if (local && local !== remote) {
      // Local is authoritative — push it up so future restores land here.
      void supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ last_active_organization_id: local } as any)
        .eq("id", userId)
        .then(
          () => undefined,
          () => undefined,
        );
    }
  } catch {
    /* network / offline — the local slot is fine on its own */
  }
}

/**
 * Reactive read of the active org id. `getActiveOrgId()` alone is a plain
 * localStorage read taken during render, so a switch (or the profile-restore
 * path that writes the slot right after login) never re-rendered consumers.
 */
function subscribeActiveOrgId(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(ORG_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ORG_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useActiveOrgIdValue(): string | null {
  return useSyncExternalStore(
    subscribeActiveOrgId,
    () => getActiveOrgId(),
    () => null,
  );
}

export function useOrganizations() {
  // The session must exist before the query runs: RLS returns an EMPTY LIST
  // (not an error) for an anonymous PostgREST request, which the UI would
  // render as the permanent "no organization yet" state right after login.
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: ["organizations", "mine", userId],
    enabled: !authLoading && !!userId,
    queryFn: async (): Promise<OrganizationRow[]> => {
      const { data, error } = await supabase
        .from("organizations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("*" as any)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OrganizationRow[];
    },
  });

  return {
    ...query,
    // Keep consumers in a loading state while the session resolves instead
    // of briefly flashing an empty/error state.
    isLoading: authLoading || (!!userId && query.isPending),
    isAuthenticated: !!userId,
    authLoading,
  };
}

export function useActiveOrganization() {
  const orgs = useOrganizations();
  const activeId = useActiveOrgIdValue();
  const active = orgs.data?.find((o) => o.id === activeId) ?? orgs.data?.[0] ?? null;
  // Signed in, list resolved, but nothing to select: the org context is
  // missing and the page must say so rather than render empty forms.
  const isMissingContext = orgs.isAuthenticated && !orgs.isLoading && !orgs.isError && !active;

  // Self-heal the browser slot: a fresh login (or a wiped localStorage)
  // leaves no stored id, which made every `getActiveOrgIdOrThrow()` call
  // site throw "No active organization selected" even though the user
  // clearly has an org. Persist the resolved org the first time we see it.
  const resolvedId = active?.id ?? null;
  useEffect(() => {
    if (resolvedId && resolvedId !== activeId) setActiveOrgId(resolvedId);
  }, [resolvedId, activeId]);

  return { ...orgs, active, activeId, isMissingContext };
}

/**
 * Org id for pages that need one to query. Returns `null` while the org
 * list is still loading or when the user genuinely has no organization —
 * callers render a loading/empty state instead of crashing the route.
 */
export function useResolvedOrgId(): {
  organizationId: string | null;
  isLoading: boolean;
  isMissingContext: boolean;
} {
  const { active, isLoading, isMissingContext } = useActiveOrganization();
  return { organizationId: active?.id ?? null, isLoading, isMissingContext };
}

export function useOrgRole(orgId: string | undefined) {
  return useQuery({
    queryKey: ["organizations", orgId, "my-role"],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid || !orgId) return null;
      const { data, error } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw error;
      return (data?.role ?? null) as "owner" | "admin" | "member" | null;
    },
  });
}

export function useOrgMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: ["organizations", orgId, "members"],
    enabled: !!orgId,
    queryFn: async (): Promise<OrgMemberRow[]> => {
      // `profiles` is self-readable only (RLS), so other members' names must
      // come through a SECURITY DEFINER directory RPC, not a direct select.
      const { data, error } = await sbAny(supabase).rpc("get_organization_member_directory", {
        _organization_id: orgId!,
      });
      if (error) throw error;
      type DirectoryRow = {
        user_id: string;
        role: OrgMemberRow["role"];
        joined_at: string;
        display_name: string | null;
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
      };
      return ((data ?? []) as DirectoryRow[]).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        display_name: m.display_name ?? null,
        full_name: m.full_name ?? null,
        email: m.email ?? null,
        avatar_url: m.avatar_url ?? null,
      }));
    },
  });
}

export function useUpdateOrganization(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<OrganizationRow>) => {
      if (!orgId) throw new Error("No organization selected");
      const { error } = await supabase
        .from("organizations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useTransferOwnership(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (newOwnerId: string) => {
      if (!orgId) throw new Error("No organization selected");
      const { error } = await sbAny(supabase).rpc("transfer_organization_ownership", {
        _org_id: orgId,
        _new_owner_id: newOwnerId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useDeleteOrganization(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization selected");
      const { error } = await sbAny(supabase).from("organizations").delete().eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Deleting an organization cascades to its workspaces in Postgres.
      // Clear both persisted tenant slots and evict the cascaded workspaces
      // immediately so the switcher cannot keep showing a deleted workspace
      // until the query cache eventually refetches.
      clearActiveOrgId();
      clearActiveWorkspaceId();
      qc.setQueriesData<WorkspaceCacheRow[]>({ queryKey: ["workspaces"] }, (rows) =>
        Array.isArray(rows)
          ? rows.filter((workspace) => workspace.organization_id !== orgId)
          : rows,
      );
      qc.invalidateQueries({ queryKey: ["organizations"] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

export function useOrgAuditLog(orgId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["organizations", orgId, "audit", limit],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, actor_id, action, resource_type, resource_id, changes, created_at")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}
