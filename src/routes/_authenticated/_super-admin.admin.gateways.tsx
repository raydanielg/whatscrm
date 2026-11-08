import { createFileRoute } from "@tanstack/react-router";
import { GatewayManager } from "@/components/admin/billing/gateway-manager";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/gateways")({
  staticData: { breadcrumb: "Payment Gateways" },
  head: () => ({
    meta: [
      { title: "Super Admin — Payment Gateways" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <main className="p-6">
      <GatewayManager />
    </main>
  ),
});
