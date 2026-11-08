import { createFileRoute, ClientOnly, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkflowBuilder } from "@/components/app/automations/builder/workflow-builder";

import { supabase } from "@/integrations/supabase/client";
import {
  readActiveWorkspaceId,
  writeActiveWorkspaceId,
} from "@/lib/tenant/active-tenant";
import { pushTenantBreadcrumb } from "@/lib/tenant/tenant-breadcrumbs";
import { currentUrlOrgId, reportTenantOutcome } from "@/lib/tenant/tenant-guard-report";
import { useWorkflowAccessWatch } from "@/hooks/use-workflow-access-watch";

/**
 * Why the builder loaded without a confirmed answer from the backend. Null
 * means every guard probe succeeded.
 */
type DegradedReason = "workflow_lookup" | "membership_probe" | null;


export const Route = createFileRoute("/_authenticated/automations/$workflowId")({
  // The session and the active tenant both live in browser storage, so the
  // guard can only run on the client.
  ssr: false,
  loader: async ({ params }) => {
    // Route-level guard. A workflow that belongs to another tenant is either
    // invisible under RLS or owned by a workspace the user isn't a member of.
    // Either way the builder must not mount — show the "not available" panel
    // instead of an endless spinner with dead toolbar buttons.
    pushTenantBreadcrumb("workflow.open", "opening workflow", {
      workflowId: params.workflowId,
      activeWorkspaceId: readActiveWorkspaceId(),
      urlOrgId: currentUrlOrgId(),
    });

    const { data, error } = await supabase
      .from("automations")
      .select("id, workspace_id")
      .eq("id", params.workflowId)
      .maybeSingle();

    // A *failed* lookup is not proof of anything — a cold start, an expired
    // token being refreshed, or a dropped connection all land here. Blocking
    // on it is what made the builder "not open" for workflows the user owns.
    // Fail open: the builder re-queries and shows its own retry panel, and
    // RLS still refuses every read/write the user isn't entitled to.
    if (error) {
      reportTenantOutcome("lookup_failed", params.workflowId, {
        probe: "workflow_lookup",
        message: `workflow lookup failed, letting the builder retry: ${error.message}`,
      });
      return { workflowId: params.workflowId, ownerWorkspaceId: null, degraded: "workflow_lookup" as const };
    }

    if (!data) {
      reportTenantOutcome("not_found", params.workflowId, {
        probe: "workflow_lookup",
        message: "workflow not visible under RLS",
      });
      throw notFound();
    }

    // getSession() reads local storage; getUser() is a network round-trip that
    // can fail transiently and bounce a legitimate owner out of the builder.
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    // No session at all is handled by the `_authenticated` gate; don't 404 here.
    if (!userId) return { workflowId: data.id, ownerWorkspaceId: data.workspace_id, degraded: null };

    const { data: membership, error: memberError } = await supabase
      .from("workspace_members")
      .select("id, status")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    let degraded: DegradedReason = null;

    if (memberError) {
      // Same reasoning as above: an errored membership probe is not a denial.
      degraded = "membership_probe";
      reportTenantOutcome("lookup_failed", params.workflowId, {
        probe: "membership_probe",
        ownerWorkspaceId: data.workspace_id,
        message: `membership probe failed, allowing the builder to load: ${memberError.message}`,
      });
    } else if (!membership || membership.status !== "active") {
      reportTenantOutcome("no_membership", params.workflowId, {
        probe: "membership_probe",
        ownerWorkspaceId: data.workspace_id,
        message: membership
          ? `membership is "${membership.status}", not active`
          : "no membership in the owning workspace",
      });
      throw notFound();
    }


    // The link may carry a different tenant than the one currently active
    // (e.g. a shared `?org=` URL). The user is a member of the owning
    // workspace, so align the active tenant instead of blocking them —
    // otherwise every downstream query in the builder is scoped wrong.
    if (readActiveWorkspaceId() !== data.workspace_id) {
      reportTenantOutcome("tenant_realigned", params.workflowId, {
        ownerWorkspaceId: data.workspace_id,
        message: "active workspace realigned to the workflow owner",
      });
      writeActiveWorkspaceId(data.workspace_id);
    }

    return { workflowId: data.id, ownerWorkspaceId: data.workspace_id, degraded };
  },

  notFoundComponent: WorkflowUnavailable,
  component: WorkflowBuilderPage,
});


function WorkflowUnavailable() {
  const navigate = useNavigate();
  const { workflowId } = Route.useParams();

  // Bounce back to the workflows list so the user is never stranded on a
  // dead URL; a manual action is available immediately.
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      reportTenantOutcome("redirected", workflowId, {
        message: "auto-redirected to /automations after unavailable workflow",
      });
      void navigate({ to: "/automations", replace: true });
    }, 6000);
    return () => window.clearTimeout(t);
  }, [navigate, workflowId]);

  return (
    <div className="h-content grid place-items-center p-6">
      <div className="max-w-md w-full rounded-control border border-border bg-surface p-6 text-center space-y-3">
        <div className="mx-auto w-10 h-10 rounded-full bg-amber-500/10 grid place-items-center">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
        </div>
        <div className="text-sm font-semibold">Not available in this workspace</div>
        <p className="text-xs text-muted-foreground">
          This workflow belongs to a different organization, or it no longer exists.
          Switch organization from the sidebar to open it. Returning you to workflows
        </p>
        <div className="flex items-center justify-center pt-1">
          <Link
            to="/automations"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to workflows
          </Link>
        </div>
      </div>
    </div>
  );
}


const DEGRADED_COPY: Record<Exclude<DegradedReason, null>, string> = {
  workflow_lookup:
    "We couldn't confirm this workflow with the server just now, so we opened it from your last known access.",
  membership_probe:
    "We couldn't confirm your workspace access just now, so we opened the workflow anyway.",
};

/**
 * Shown when a guard probe failed and we deliberately failed open. The builder
 * still works — this explains the hiccup and offers a one-click recheck so the
 * user never has to guess whether they lost access.
 */
function DegradedAccessNotice({ reason }: { reason: Exclude<DegradedReason, null> }) {
  const router = useRouter();
  const [dismissed, setDismissed] = React.useState(false);
  const [rechecking, setRechecking] = React.useState(false);

  if (dismissed) return null;

  return (
    <div
      data-testid="workflow-degraded-notice"
      role="status"
      className="flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5"
    >
      <WifiOff className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold">Working with limited connection</div>
        <p className="text-xs text-muted-foreground">
          {DEGRADED_COPY[reason]} Anything you save is still protected by your
          workspace permissions.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={rechecking}
          onClick={async () => {
            setRechecking(true);
            try {
              await router.invalidate();
            } finally {
              setRechecking(false);
            }
          }}
        >
          {rechecking ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Recheck access
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          aria-label="Dismiss connection notice"
          onClick={() => setDismissed(true)}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function WorkflowBuilderPage() {
  const { workflowId } = Route.useParams();
  const { degraded, ownerWorkspaceId } = Route.useLoaderData();
  // A membership can be downgraded while the builder is open. The watch cancels
  // every workflow query the instant that happens; we then unmount the builder
  // so no editor state, autosave, or poll survives the revocation.
  const { revoked, status } = useWorkflowAccessWatch(ownerWorkspaceId);

  React.useEffect(() => {
    if (!revoked) return;
    reportTenantOutcome("no_membership", workflowId, {
      probe: "membership_probe",
      ownerWorkspaceId: ownerWorkspaceId ?? undefined,
      message: `access revoked while the builder was open (status: ${status ?? "removed"})`,
    });
  }, [revoked, status, workflowId, ownerWorkspaceId]);

  if (revoked) return <WorkflowUnavailable />;

  return (
    <ClientOnly
      fallback={
        <div className="h-content grid place-items-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <div className="flex flex-col h-content">
        {degraded ? <DegradedAccessNotice reason={degraded} /> : null}
        <div className="flex-1 min-h-0">
          <WorkflowBuilder workflowId={workflowId} />
        </div>
      </div>
    </ClientOnly>
  );
}

