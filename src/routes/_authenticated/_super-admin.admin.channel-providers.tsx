import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { UnsupportedProvidersPanel } from "@/components/admin/unsupported-providers-panel";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/channel-providers")({
  head: () => ({
    meta: [
      { title: "Channel Providers — Unsupported Provider Triage" },
      {
        name: "description",
        content:
          "Review every connected account whose provider the inbox cannot route, with counts per provider, and map or disable them in one place.",
      },
      { property: "og:title", content: "Channel Providers — Unsupported Provider Triage" },
      {
        property: "og:description",
        content: "Counts per unsupported provider with one-click mapping or disabling.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminPageShell
      title="Channel Providers"
      description="Connected accounts using a provider the inbox cannot route. Map them onto a supported provider or disable them."
    >
      <UnsupportedProvidersPanel />
    </AdminPageShell>
  ),
});
