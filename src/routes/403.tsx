import { Brand } from "@/components/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert, ArrowLeft, LayoutDashboard, Home } from "lucide-react";

type ForbiddenSearch = {
  scope?: "platform" | "workspace" | "organization";
  required?: string;
  have?: string;
  status?: string;
  from?: string;
};

export const Route = createFileRoute("/403")({
  head: () => ({
    meta: [
      { title: "Access denied" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "You don't have permission to view this page." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): ForbiddenSearch => ({
    scope:
      search.scope === "platform" || search.scope === "workspace" || search.scope === "organization"
        ? search.scope
        : undefined,
    required: typeof search.required === "string" ? search.required : undefined,
    have: typeof search.have === "string" ? search.have : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    from: typeof search.from === "string" ? search.from : undefined,
  }),
  component: ForbiddenPage,
});

function formatRoles(csv?: string): string[] {
  if (!csv) return [];
  return csv.split(",").map((r) => r.trim()).filter(Boolean);
}

function ForbiddenPage() {
  const { scope, required, have, status, from } = Route.useSearch();
  const requiredList = formatRoles(required);
  const isSuspended = status === "suspended";

  let heading = "Access denied";
  let explanation =
    "You don't have permission to view this page. Ask your workspace owner to grant you the right role.";

  if (isSuspended) {
    heading = "Membership suspended";
    explanation =
      "Your membership in this workspace has been suspended. Contact the workspace owner to restore access.";
  } else if (scope === "platform") {
    heading = "Platform admin only";
    explanation =
      "This screen is reserved for platform administrators. Reach out to the platform administrator if you believe this is a mistake.";
  } else if (scope === "workspace" && requiredList.length > 0) {
    heading = "Higher workspace role required";
    explanation =
      "This screen is limited to workspace owners and admins. Ask an owner to update your role if you need access.";
  } else if (scope === "organization") {
    heading = "Organization admin only";
    const missingRoles = requiredList.filter(role => role !== have);
    explanation =
      `To access these controls, you need to be an organization ${missingRoles.join(" or ")}. Your current role is ${have || "guest"}.`;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-control border border-border bg-card p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-7 w-7" aria-hidden="true" />
          </div>

          <p className="mt-6 text-xs uppercase text-muted-foreground">
            Error 403
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{heading}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {explanation}
          </p>

          {(requiredList.length > 0 || have || from) && (
            <dl className="mt-6 space-y-2 rounded-control border border-border bg-muted/40 p-4 text-left text-xs">
              {requiredList.length > 0 && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="font-medium text-muted-foreground">Required role</dt>
                  <dd className="flex flex-wrap justify-end gap-1">
                    {requiredList.map((r) => (
                      <span
                        key={r}
                        className="rounded-control bg-background px-2 py-0.5 font-medium capitalize"
                      >
                        {r}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {have && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="font-medium text-muted-foreground">Your role</dt>
                  <dd className="capitalize">{have}</dd>
                </div>
              )}
              {from && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="font-medium text-muted-foreground">Blocked path</dt>
                  <dd className="truncate font-mono text-[11px]" title={from}>
                    {from}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <div className="mt-6 flex flex-col flex-wrap gap-2 sm:flex-row sm:justify-center">
            {scope === "organization" && (
              <Link
                to="/settings/members"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-control border border-primary bg-primary/5 px-4 text-sm font-medium text-primary transition hover:bg-primary/10"
              >
                View team & roles
              </Link>
            )}
            <Link
              to="/dashboard"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Go to dashboard
            </Link>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  window.history.back();
                }
              }}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-control border border-input bg-background px-4 text-sm font-medium transition hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Go back
            </button>
          </div>

          <div className="mt-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
              Return home
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Need help? Contact your workspace owner or <Brand /> support.
        </p>
      </div>
    </div>
  );
}
