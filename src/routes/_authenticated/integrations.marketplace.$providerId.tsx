import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout for a single provider. Detail lives in the `.index` route and the
 *  guided install flow renders as a child, each owning its own page header. */
export const Route = createFileRoute("/_authenticated/integrations/marketplace/$providerId")({
  staticData: { breadcrumb: "Provider" },
  component: () => <Outlet />,
});
