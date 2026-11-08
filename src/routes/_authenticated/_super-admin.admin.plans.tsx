import { createFileRoute } from "@tanstack/react-router";
import { PlanManager } from "@/components/admin/plans/plan-manager";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/plans")({
  staticData: { breadcrumb: "Subscription Plans" },
  head: () => ({ meta: [{ title: "Super Admin — Subscription Plans" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <main className="p-6">
      <PlanManager />
    </main>
  ),
});
