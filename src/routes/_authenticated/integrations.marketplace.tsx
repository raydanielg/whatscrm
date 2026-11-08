import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout for the marketplace section. The list lives in
 *  `integrations.marketplace.index.tsx`; provider detail/install routes
 *  render as children so they can own their page header. */
export const Route = createFileRoute("/_authenticated/integrations/marketplace")({
  staticData: { breadcrumb: "Marketplace" },
  component: () => <Outlet />,
});
