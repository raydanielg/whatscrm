import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_super-admin/admin")({
  staticData: { breadcrumb: "Admin" },
  component: () => <Outlet />,
});
