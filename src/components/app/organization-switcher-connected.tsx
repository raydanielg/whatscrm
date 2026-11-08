import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Layers3, Loader2 } from "lucide-react";
import { OrganizationSwitcher, type SwitcherWorkspace } from "./organization-switcher";
import {
  useOrganizations,
  setActiveOrgId,
  setActiveTenantSelection,
  useActiveOrgIdValue,
  isValidOrgId,
  resolveActiveOrgId,
  type OrganizationRow,
} from "@/hooks/use-organization";

import {
  useWorkspaces,
  useCurrentWorkspace,
  setActiveWorkspaceId,
  useCreateWorkspace,
} from "@/hooks/use-workspace";
import type { Organization } from "@/shared/hooks/use-active-organization";
import { supabase } from "@/integrations/supabase/client";
import { hasUnsavedChanges, listUnsavedLabels } from "@/hooks/use-unsaved-changes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RealtimeStatusIndicator } from "./realtime-status-indicator";
import { logOrganizationSwitch } from "@/lib/org-switch-audit.functions";
import { resetRealtimeForOrgSwitch } from "@/lib/realtime/org-realtime";
import { onRemoteOrgChange } from "@/lib/realtime/org-cross-tab";
import {
  readActiveOrgId,
  readActiveWorkspaceId,
  writeActiveOrgId,
} from "@/lib/tenant/active-tenant";

function readActiveId(): string | null {
  return readActiveOrgId();
}

function toSwitcherOrg(o: OrganizationRow, plan?: string): Organization {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    plan,
    avatarUrl: o.logo_url ?? undefined,
  };
}

/**
 * Connected OrganizationSwitcher — reads the user's organizations, exposes
 * the active one from localStorage, and lets the user confirm/switch after
 * a personal org is auto-provisioned on first API call.
 */
export function OrganizationSwitcherConnected({ collapsed = false }: { collapsed?: boolean }) {
  const qc = useQueryClient();
  const { data: orgs = [], isLoading, isError, error, refetch } = useOrganizations();
  const organizationPlanQueryKey = React.useMemo(
    () => ["subscription", "organization-plan-labels", orgs.map((org) => org.id).join(",")],
    [orgs],
  );
  const { data: organizationPlans = {} } = useQuery({
    queryKey: organizationPlanQueryKey,
    enabled: orgs.length > 0,
    queryFn: async () => {
      const { data, error: planError } = await supabase
        .from("subscriptions")
        .select("organization_id, plan:plan_id(name)")
        .in(
          "organization_id",
          orgs.map((org) => org.id),
        );
      if (planError) throw planError;
      return Object.fromEntries(
        (data ?? []).map((row) => [
          row.organization_id,
          (row.plan as { name?: string } | null)?.name ?? "Free",
        ]),
      ) as Record<string, string>;
    },
  });
  React.useEffect(() => {
    if (orgs.length === 0) return;
    const channel = supabase
      .channel("organization-plan-labels")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions" },
        () => void qc.invalidateQueries({ queryKey: organizationPlanQueryKey }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationPlanQueryKey, orgs.length, qc]);
  const { data: allWorkspaces = [] } = useWorkspaces();
  const { active: activeWorkspace } = useCurrentWorkspace();
  const createWorkspace = useCreateWorkspace();
  const [createKind, setCreateKind] = React.useState<"organization" | "workspace" | null>(null);
  const [createName, setCreateName] = React.useState("");
  const [billingEmail, setBillingEmail] = React.useState("");
  const [firstWorkspaceName, setFirstWorkspaceName] = React.useState("");
  const [workspaceDescription, setWorkspaceDescription] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const activeId = useActiveOrgIdValue();
  const cacheOrgRef = React.useRef(activeId);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  // Visible phase driver — surfaces WHY the switcher is disabled at each
  // step of the quiescence pipeline so the tooltip / progress caption can
  // stay in sync with the real work happening under the hood.
  const [switchPhase, setSwitchPhase] = React.useState<
    "clearing" | "settling" | "loading" | "finalizing" | null
  >(null);
  // Synchronous re-entry lock: React state updates are async, so two rapid
  // clicks within the same tick can both pass a state-based guard. A ref
  // flips synchronously and blocks the second call before it starts.
  const switchLockRef = React.useRef(false);

  /**
   * Total time budget for a switch operation before we abort and surface a
   * retryable error. Covers channel teardown + query cancellation + cache
   * quiescence. Post-switch data loading has its own watchdog below.
   */
  const SWITCH_TIMEOUT_MS = 8000;
  /**
   * Time budget for the new org's initial data to start settling after we
   * flip the active id. If TanStack Query is still fetching after this
   * window, we assume the tenant is slow/unreachable and show a retry toast.
   */
  const POST_SWITCH_LOAD_TIMEOUT_MS = 12000;

  /**
   * Wait for TanStack Query to report no in-flight fetches or mutations.
   * We call this AFTER `cancelQueries()` + `getMutationCache().clear()` so
   * any lingering requests should settle within a few microtasks. Resolves
   * `true` on quiescence, `false` if the timeout elapses first (caller
   * treats that as a hard failure).
   */
  const waitForQuiescence = React.useCallback(
    async (timeoutMs = 1500, signal?: AbortSignal): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (signal?.aborted) return false;
        if (qc.isFetching() === 0 && qc.isMutating() === 0) return true;
        await new Promise((r) => setTimeout(r, 25));
      }
      return false;
    },
    [qc],
  );

  /**
   * After the active org flips, wait until the new tenant's queries settle.
   * Resolves `true` on quiescence, `false` on timeout so callers can raise
   * a retryable error instead of leaving the UI hanging on spinners.
   */
  const waitForPostSwitchLoad = React.useCallback(
    async (timeoutMs: number, signal: AbortSignal): Promise<boolean> => {
      const start = Date.now();
      // Give hooks a tick to subscribe & kick off their first fetches.
      await new Promise((r) => setTimeout(r, 50));
      while (Date.now() - start < timeoutMs) {
        if (signal.aborted) return false;
        if (qc.isFetching() === 0 && qc.isMutating() === 0) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      return false;
    },
    [qc],
  );

  // Reconcile the stored active id against the user's actual memberships.
  // Covers three failure modes:
  //   1. No id stored yet (first load) → pick the first org.
  //   2. Stored id is malformed / tampered → `readActiveId` already cleared
  //      it, so we fall through to the first-org fallback.
  //   3. Stored id points at an org the user was removed from (or that was
  //      deleted) → snap to the first available membership and warn.
  React.useEffect(() => {
    if (orgs.length === 0) return;
    const stored = readActiveId();
    const resolved = resolveActiveOrgId(stored, orgs);
    if (!resolved) return;
    if (resolved !== stored) {
      if (stored && isValidOrgId(stored)) {
        // Well-formed id, but not in the membership list → surface this so
        // the user understands why the sidebar just jumped orgs.
        toast.warning("Previously selected organization is no longer available", {
          description: `Switched to ${orgs.find((o) => o.id === resolved)?.name ?? "your first organization"}.`,
        });
      }
      setActiveOrgId(resolved);
    }
  }, [activeId, orgs]);

  // Keep in sync with cross-tab / programmatic changes.
  // When another tab flips the active org, we mirror the switch in this tab:
  // silence org-A realtime, purge its cached queries, adopt the new id, and
  // broadcast a resubscribe signal so hooks re-open channels scoped to org-B.
  // No page reload — TanStack Query refetches on demand for the new key.
  React.useEffect(() => {
    const applyRemote = (nextId: string | null) => {
      if (!nextId || nextId === cacheOrgRef.current) return;
      cacheOrgRef.current = nextId;
      // Mirror the local switch pipeline, minus the toast/audit overhead.
      resetRealtimeForOrgSwitch("pre-switch");
      void qc.cancelQueries().finally(() => {
        qc.removeQueries();
        qc.getMutationCache().clear();
        if (readActiveId() !== nextId) writeActiveOrgId(nextId);
        resetRealtimeForOrgSwitch("post-switch");
        toast.info("Active organization changed in another tab");
      });
    };

    const unsubRemote = onRemoteOrgChange(applyRemote);
    return () => {
      unsubRemote();
    };
  }, [qc]);

  // Pending target when the user tried to switch while there were unsaved
  // edits. When set, the AlertDialog below is open; confirming discards the
  // edits and proceeds, cancelling drops the intent.
  const [pendingSwitch, setPendingSwitch] = React.useState<{
    id: string;
    label: string;
    dirtyLabels: string[];
  } | null>(null);

  const performSwitch = React.useCallback(
    async (id: string, nextWorkspaceId?: string) => {
      // Synchronous guard: ref flips before React re-renders, so a second
      // click in the same tick is dropped instead of racing the first.
      if (switchLockRef.current) return;
      if (id === activeId || switchingId) return;
      switchLockRef.current = true;
      const picked = orgs.find((o) => o.id === id);
      const label = picked?.name ?? "organization";
      const previousId = activeId;
      const previousWorkspaceId = readActiveWorkspaceId();
      const targetWorkspaceId =
        nextWorkspaceId ??
        allWorkspaces.find((w) => w.organization_id === id && !w.archived_at)?.id ??
        null;
      const previous = orgs.find((o) => o.id === activeId);
      const startedAt = Date.now();
      setSwitchingId(id);
      setSwitchPhase("clearing");
      const progress = toast.loading(`Switching to ${label}`, {
        description: "Clearing data cache and reconnecting realtime channels.",
      });

      // AbortController driving both timeout paths. If the overall budget
      // expires we abort, roll back the optimistic selection, and surface a
      // retry action to the user.
      const controller = new AbortController();
      const timeoutHandle = window.setTimeout(
        () => controller.abort(new DOMException("switch-timeout", "TimeoutError")),
        SWITCH_TIMEOUT_MS,
      );

      let purgeError: unknown = null;
      let committed = false;
      try {
        // Phase 1 — silence org-A realtime BEFORE we drop cached data so
        // late `postgres_changes` payloads can't reseed the cache we're
        // about to purge.
        const preTeardown = resetRealtimeForOrgSwitch("pre-switch");
        if (!preTeardown.ok) purgeError = preTeardown.error;

        // Race the cache-purge steps against the switch budget so a wedged
        // fetch/mutation can't hold the switcher open indefinitely.
        await qc.cancelQueries();
        qc.removeQueries();
        qc.getMutationCache().clear();
        if (controller.signal.aborted) {
          throw new Error("Timed out while clearing cached data");
        }

        setSwitchPhase("settling");
        const settled = await waitForQuiescence(1500, controller.signal);
        if (!settled) {
          throw new Error(
            controller.signal.aborted
              ? "Timed out while clearing cached data"
              : "Background requests didn't settle in time",
          );
        }

        // Flip the active org last so subscribers re-key against an empty cache.
        setSwitchPhase("finalizing");
        setActiveTenantSelection(id, targetWorkspaceId);
        cacheOrgRef.current = id;
        committed = true;

        // Phase 2 — any channel that raced back up during settle/quiescence
        // is torn down now, and we broadcast a `realtime-reset` so hooks
        // that opt into `useRealtimeGeneration()` immediately resubscribe
        // with org-B filters.
        const postTeardown = resetRealtimeForOrgSwitch("post-switch");
        if (!postTeardown.ok && !purgeError) purgeError = postTeardown.error;

        // Watch the new tenant's initial load. If it stalls past the
        // post-switch budget, we roll the UI back and let the user retry.
        setSwitchPhase("loading");
        const loaded = await waitForPostSwitchLoad(POST_SWITCH_LOAD_TIMEOUT_MS, controller.signal);
        if (!loaded) {
          if (previousId) {
            setActiveTenantSelection(previousId, previousWorkspaceId);
            cacheOrgRef.current = previousId;
          }
          throw new Error(
            controller.signal.aborted
              ? `Loading ${label} timed out`
              : `${label} took too long to load`,
          );
        }

        if (
          readActiveId() !== id ||
          (targetWorkspaceId && readActiveWorkspaceId() !== targetWorkspaceId)
        ) {
          throw new Error("The selected organization did not remain active");
        }

        toast.dismiss(progress);
        if (!targetWorkspaceId) {
          toast.warning(`Switched to ${label}, but it has no linked workspace`, {
            description: "Create a workspace in this organization before using workspace features.",
          });
        } else if (purgeError) {
          const msg = purgeError instanceof Error ? purgeError.message : String(purgeError);
          toast.warning(`Switched to ${label}, but couldn't fully clear background data`, {
            description: msg,
          });
        } else {
          toast.success(`Switched to ${label}`, {
            description: "Data cache cleared and realtime channels resubscribed.",
          });
        }
        // Best-effort audit log — never blocks or fails the switch.
        void logOrganizationSwitch({
          data: {
            fromOrgId: previousId ?? null,
            toOrgId: id,
            fromOrgName: previous?.name ?? null,
            toOrgName: picked?.name ?? null,
            outcome: "success",
            purgeSucceeded: !purgeError,
            purgeError: purgeError
              ? purgeError instanceof Error
                ? purgeError.message
                : String(purgeError)
              : null,
            durationMs: Date.now() - startedAt,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
          },
        }).catch(() => {});
      } catch (e) {
        if (committed && previousId && readActiveId() === id) {
          setActiveTenantSelection(previousId, previousWorkspaceId);
          cacheOrgRef.current = previousId;
        }
        toast.dismiss(progress);
        const isTimeout =
          controller.signal.aborted ||
          (e instanceof Error && /timed out|too long/i.test(e.message));
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(
          isTimeout ? `Switching to ${label} timed out` : `Failed to switch to ${label}`,
          {
            description: msg,
            duration: 10000,
            action: { label: "Retry", onClick: () => void performSwitch(id) },
          },
        );
        void logOrganizationSwitch({
          data: {
            fromOrgId: previousId ?? null,
            toOrgId: id,
            fromOrgName: previous?.name ?? null,
            toOrgName: picked?.name ?? null,
            outcome: isTimeout ? "timeout" : "failure",
            purgeSucceeded: !purgeError,
            purgeError: purgeError
              ? purgeError instanceof Error
                ? purgeError.message
                : String(purgeError)
              : null,
            durationMs: Date.now() - startedAt,
            reason: msg.slice(0, 500),
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
          },
        }).catch(() => {});
      } finally {
        window.clearTimeout(timeoutHandle);
        setSwitchingId(null);
        setSwitchPhase(null);
        switchLockRef.current = false;
      }
    },
    [activeId, switchingId, orgs, allWorkspaces, qc, waitForQuiescence, waitForPostSwitchLoad],
  );

  /**
   * Public entry point invoked by the switcher UI. If the current page has
   * unsaved edits registered via `useUnsavedChanges`, we open a confirmation
   * modal instead of running the switch immediately. Confirming the modal
   * discards the pending edits (the caller's local state) and proceeds.
   */
  const handleSelect = React.useCallback(
    (id: string) => {
      if (id === activeId || switchingId) return;
      if (hasUnsavedChanges()) {
        const picked = orgs.find((o) => o.id === id);
        setPendingSwitch({
          id,
          label: picked?.name ?? "organization",
          dirtyLabels: listUnsavedLabels(),
        });
        return;
      }
      void performSwitch(id);
    },
    [activeId, switchingId, orgs, performSwitch],
  );

  const closeCreateDialog = () => {
    if (isCreating) return;
    setCreateKind(null);
    setCreateName("");
    setBillingEmail("");
    setFirstWorkspaceName("");
    setWorkspaceDescription("");
  };

  const handleCreateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreating || !createKind) return;
    const name = createName.trim();
    const description = workspaceDescription.trim();
    if (!name) {
      toast.error("Enter a name to continue");
      return;
    }
    if (createKind === "organization" && !firstWorkspaceName.trim()) {
      toast.error("Enter a name for the first workspace");
      return;
    }
    if (hasUnsavedChanges()) {
      toast.error("Save or discard your current page edits before creating and switching");
      return;
    }
    if (createKind === "workspace" && !activeId) {
      toast.error("Select an organization before creating a workspace");
      return;
    }

    setIsCreating(true);
    let createdOrgId: string | null = null;
    let createdWorkspace = false;
    try {
      if (createKind === "workspace") {
        await createWorkspace.mutateAsync({
          name,
          organization_id: activeId,
          description: description || undefined,
        });
        toast.success(`${name} created`);
      } else {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        const uid = userData.user?.id;
        if (!uid) throw new Error("You must be signed in");
        const slugBase =
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40) || "organization";
        const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;
        const { data: organization, error: orgError } = await supabase
          .from("organizations")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ name, slug, owner_id: uid, billing_email: billingEmail.trim() || null } as any)
          .select("id")
          .single();
        if (orgError || !organization) throw orgError ?? new Error("Could not create organization");
        createdOrgId = organization.id;

        const { error: memberError } = await supabase
          .from("organization_members")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ organization_id: organization.id, user_id: uid, role: "owner" } as any);
        if (memberError) throw memberError;

        const firstWorkspace = await createWorkspace.mutateAsync({
          name: firstWorkspaceName.trim(),
          organization_id: organization.id,
          description: description || undefined,
          activate: false,
        });
        createdWorkspace = true;
        await qc.invalidateQueries({ queryKey: ["organizations"] });
        void performSwitch(organization.id, firstWorkspace.id);
        toast.success(`${name} and its first workspace created`);
      }
      setCreateKind(null);
      setCreateName("");
      setBillingEmail("");
      setFirstWorkspaceName("");
      setWorkspaceDescription("");
    } catch (error) {
      if (createdOrgId && !createdWorkspace) {
        await supabase.from("organizations").delete().eq("id", createdOrgId);
      }
      toast.error(error instanceof Error ? error.message : "Could not complete setup");
    } finally {
      setIsCreating(false);
    }
  };

  const accessibleOrgIds = new Set(orgs.map((org) => org.id));
  const workspaces: SwitcherWorkspace[] = allWorkspaces
    // Never expose a cached, legacy-unlinked, or otherwise inaccessible
    // workspace in the tenant switcher. A linked organization is required
    // before a workspace can be selected safely.
    .filter(
      (workspace) => !!workspace.organization_id && accessibleOrgIds.has(workspace.organization_id),
    )
    .map((w) => ({
      id: w.id,
      name: w.name,
      organizationId: w.organization_id,
      plan: organizationPlans[w.organization_id] ?? w.plan,
      avatarUrl: w.avatar_url,
      archived: !!w.archived_at,
      organizationName: orgs.find((org) => org.id === w.organization_id)?.name ?? null,
    }));

  return (
    <>
      <OrganizationSwitcher
        organizations={orgs.map((org) => toSwitcherOrg(org, organizationPlans[org.id]))}
        activeId={activeId}
        onSelect={(id) => handleSelect(id)}
        onCreate={() => setCreateKind("organization")}
        collapsed={collapsed}
        loading={isLoading}
        switching={!!switchingId}
        switchingId={switchingId}
        switchPhase={switchPhase}
        error={isError ? (error as Error) : null}
        onRetry={() => void refetch()}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace?.id ?? null}
        onSelectWorkspace={(id) => {
          const ws = allWorkspaces.find((w) => w.id === id);
          if (!ws || ws.archived_at || !ws.organization_id) {
            toast.error("This workspace is archived or not linked to an organization");
            return;
          }
          if (ws?.organization_id && ws.organization_id !== activeId) {
            if (!orgs.some((org) => org.id === ws.organization_id)) {
              toast.error("You do not have access to this workspace's organization yet");
              return;
            }
            if (hasUnsavedChanges()) {
              toast.error("Save or discard your current page edits before switching workspaces");
              return;
            }
            void performSwitch(ws.organization_id, id);
            return;
          }
          setActiveWorkspaceId(id);
          toast.success(`Switched to ${ws?.name ?? "workspace"}`);
        }}
        onCreateWorkspace={() => setCreateKind("workspace")}
      />
      <Dialog
        open={createKind !== null}
        onOpenChange={(open) => {
          if (!open) closeCreateDialog();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-control bg-primary/10 text-primary">
              {createKind === "organization" ? (
                <Building2 className="size-5" />
              ) : (
                <Layers3 className="size-5" />
              )}
            </div>
            <DialogTitle>
              {createKind === "organization" ? "Create an organization" : "Create a workspace"}
            </DialogTitle>
            <DialogDescription>
              {createKind === "organization"
                ? "An organization brings your team and workspaces together. Set up its first workspace now so you can start working immediately."
                : "A workspace keeps conversations, contacts, and settings together within one organization."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleCreateSubmit(event)} className="space-y-5">
            {createKind === "workspace" && (
              <div className="rounded-control border border-border bg-muted/40 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Organization</span>
                <p className="font-medium text-foreground">
                  {orgs.find((org) => org.id === activeId)?.name ?? "Select an organization first"}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="create-tenant-name" className="text-sm font-medium">
                {createKind === "organization" ? "Organization name" : "Workspace name"}
              </label>
              <Input
                id="create-tenant-name"
                autoFocus
                required
                maxLength={80}
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={createKind === "organization" ? "Acme Ltd" : "Customer Support"}
              />
              <p className="text-xs text-muted-foreground">
                {createKind === "organization"
                  ? "Your team will see this name in the organization switcher."
                  : "Your team will see this name in the workspace switcher."}
              </p>
            </div>
            {createKind === "organization" && (
              <div className="space-y-2">
                <label htmlFor="create-billing-email" className="text-sm font-medium">
                  Billing email{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="create-billing-email"
                  type="email"
                  maxLength={254}
                  value={billingEmail}
                  onChange={(event) => setBillingEmail(event.target.value)}
                  placeholder="billing@acme.com"
                />
              </div>
            )}
            {createKind === "organization" && (
              <div className="space-y-2 border-t border-border pt-5">
                <label htmlFor="create-first-workspace" className="text-sm font-medium">
                  First workspace name
                </label>
                <Input
                  id="create-first-workspace"
                  required
                  maxLength={80}
                  value={firstWorkspaceName}
                  onChange={(event) => setFirstWorkspaceName(event.target.value)}
                  placeholder="Main workspace"
                />
                <p className="text-xs text-muted-foreground">
                  This workspace will belong to the new organization. You can add more later.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="create-workspace-description" className="text-sm font-medium">
                Workspace description{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="create-workspace-description"
                rows={2}
                maxLength={500}
                value={workspaceDescription}
                onChange={(event) => setWorkspaceDescription(event.target.value)}
                placeholder="What will this workspace be used for?"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateDialog}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isCreating ||
                  !createName.trim() ||
                  (createKind === "organization" && !firstWorkspaceName.trim()) ||
                  (createKind === "workspace" && !activeId)
                }
              >
                {isCreating && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isCreating
                  ? "Creating"
                  : createKind === "organization"
                    ? "Create organization & workspace"
                    : "Create workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!pendingSwitch}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSwitch
                ? `Switching to ${pendingSwitch.label} will clear all cached data on this page. You have unsaved changes that will be lost:`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingSwitch && pendingSwitch.dirtyLabels.length > 0 ? (
            <ul className="ml-4 list-disc text-sm text-muted-foreground">
              {pendingSwitch.dirtyLabels.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = pendingSwitch;
                setPendingSwitch(null);
                if (target) void performSwitch(target.id);
              }}
            >
              Discard and switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
