import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { SubscriptionsConsole } from "@/components/admin/platform/subscriptions-console";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/subscriptions")({
  head: () => ({
    meta: [
      { title: "Super Admin — Subscriptions" },
      { name: "description", content: "Platform-wide subscription ledger with MRR, trial state, renewals, and lifecycle actions for every tenant." },
      { property: "og:title", content: "Super Admin — Subscriptions" },
      { property: "og:description", content: "Platform-wide subscription ledger and lifecycle management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminPageShell
      title="Subscriptions"
      description="Every subscription across the platform — status, MRR, renewal, trial state, and lifecycle actions."
    >
      <SubscriptionsConsole />
    </AdminPageShell>
  ),
});
