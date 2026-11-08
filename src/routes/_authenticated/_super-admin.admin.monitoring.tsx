import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { MonitoringDashboard } from "@/components/admin/monitoring/monitoring-dashboard";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/monitoring")({
  head: () => ({ meta: [{ title: "Super Admin — Monitoring" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminPageShell
      title="System Monitoring"
      description="Realtime health of compute, database, queues, providers, and API surfaces."
    >
      <MonitoringDashboard />
    </AdminPageShell>
  ),
});
