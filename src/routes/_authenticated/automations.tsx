import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /automations.
 *
 * This route has children (`/automations/$workflowId`), so it must only
 * render an <Outlet />. The tabbed overview lives in `automations.index.tsx`;
 * keeping the page body here swallowed every child route and made the flow
 * builder impossible to open.
 */
export const Route = createFileRoute("/_authenticated/automations")({
  component: () => <Outlet />,
});
