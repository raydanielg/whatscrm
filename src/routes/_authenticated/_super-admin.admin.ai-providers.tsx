import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { AiProvidersConsole } from "@/components/admin/platform/ai-providers-console";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/ai-providers")({
  head: () => ({
    meta: [
      { title: "Super Admin — AI Providers" },
      { name: "description", content: "Cross-tenant AI provider registry: credentials status, model inventory, health probes, and 30-day usage." },
      { property: "og:title", content: "Super Admin — AI Providers" },
      { property: "og:description", content: "Cross-tenant AI provider registry with health and usage monitoring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminPageShell
      title="AI Providers"
      description="Manage global AI provider credentials, models, and routing policies across every tenant."
    >
      <AiProvidersConsole />
    </AdminPageShell>
  ),
});
