import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { WhatsAppPlatformConsole } from "@/components/admin/platform/whatsapp-platform-console";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/whatsapp")({
  head: () => ({
    meta: [
      { title: "Super Admin — WhatsApp Platform" },
      { name: "description", content: "Global WABA registry, credential health, template approvals, QR device sessions, and 24h delivery health." },
      { property: "og:title", content: "Super Admin — WhatsApp Platform" },
      { property: "og:description", content: "Cross-tenant WhatsApp control plane with delivery and template monitoring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminPageShell
      title="WhatsApp Platform"
      description="Global WABA registry, provider adapters, template sync, and delivery health governance."
    >
      <WhatsAppPlatformConsole />
    </AdminPageShell>
  ),
});
