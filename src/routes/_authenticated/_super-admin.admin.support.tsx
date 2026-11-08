import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { SupportTicketsManager } from "@/components/admin/comms/support-tickets-manager";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/support")({
  head: () => ({ meta: [{ title: "Super Admin — Support Center" }, { name: "robots", content: "noindex" }] }),
  component: SupportCenterPage,
});

function SupportCenterPage() {
  return (
    <AdminPageShell
      title="Support Center"
      description="Every open ticket, SLA timer, and escalation across the platform. Internal notes stay staff-only."
    >
      <SupportTicketsManager />
    </AdminPageShell>
  );
}
