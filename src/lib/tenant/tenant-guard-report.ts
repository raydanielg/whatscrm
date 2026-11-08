/**
 * Diagnostics for tenant (org/workspace) guard decisions on shared links.
 * Kept out of the route module so route code-splitting can't drop it.
 */
import { readActiveWorkspaceId } from "@/lib/tenant/active-tenant";
import {
  pushTenantBreadcrumb,
  readTenantBreadcrumbs,
  type TenantBreadcrumbKind,
} from "@/lib/tenant/tenant-breadcrumbs";
import {
  logTenantAccessEvent,
  type TenantAccessOutcome,
} from "@/lib/tenant/tenant-audit.functions";

export function currentUrlOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("org");
}

const BREADCRUMB_KIND: Record<TenantAccessOutcome, TenantBreadcrumbKind> = {
  not_found: "workflow.not_found",
  lookup_failed: "workflow.lookup_failed",

  no_membership: "workflow.no_membership",
  tenant_realigned: "workflow.tenant_realigned",
  redirected: "workflow.redirect",
};

/**
 * Which guard probe produced the outcome. Carried into the audit row as
 * `probe_type` so a `lookup_failed` incident says *what* flaked — the
 * workflow read or the membership probe — without re-reading the code.
 */
export type TenantProbe = "workflow_lookup" | "membership_probe" | "none";

/** Correlates the client breadcrumb with the server audit row for one decision. */
function newRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the timestamp form below
  }
  return `tg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Breadcrumb + server audit for one guard decision. Never throws. */
export function reportTenantOutcome(
  outcome: TenantAccessOutcome,
  workflowId: string,
  detail: {
    ownerWorkspaceId?: string | null;
    message: string;
    /** Probe that produced this outcome; defaults to "none". */
    probe?: TenantProbe;
  },
): string {
  const activeWorkspaceId = readActiveWorkspaceId();
  const urlOrgId = currentUrlOrgId();
  const requestId = newRequestId();
  const probe = detail.probe ?? "none";

  pushTenantBreadcrumb(BREADCRUMB_KIND[outcome], detail.message, {
    workflowId,
    ownerWorkspaceId: detail.ownerWorkspaceId ?? null,
    activeWorkspaceId,
    urlOrgId,
    probe,
    requestId,
  });

  void logTenantAccessEvent({
    data: {
      outcome,
      resourceType: "automation",
      resourceId: workflowId,
      ownerWorkspaceId: detail.ownerWorkspaceId ?? null,
      activeWorkspaceId,
      urlOrgId,
      probe,
      requestId,
      path:
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : null,
      breadcrumbs: readTenantBreadcrumbs()
        .slice(-15)
        .map((c) => ({ at: c.at, kind: c.kind, message: c.message })),
    },
  }).catch(() => {
    // Diagnostics must never break navigation.
  });

  return requestId;
}

