import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { SecurityCenter } from "@/components/admin/security/security-center";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/security")({
  head: () => ({
    meta: [{ title: "Super Admin — Security Center" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <AdminPageShell
      title="Security Center"
      description="Suspicious activity, IP & device tracking, permission changes, and retention policies across the platform."
    >
      <SecurityCenter />
    </AdminPageShell>
  ),
});
