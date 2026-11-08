import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { AuditLogsExplorer } from "@/components/admin/security/audit-logs-explorer";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/audit-logs")({
  head: () => ({ meta: [{ title: "Super Admin — Audit & Logs" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminPageShell
      title="Audit & Logs"
      description="Unified, searchable trail across audit, auth, security, billing, payments, API, webhooks, AI, workflows, and providers."
    >
      <AuditLogsExplorer />
    </AdminPageShell>
  ),
});
