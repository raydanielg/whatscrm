import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { WhatsAppIntegrationStatus } from "@/components/app/whatsapp/whatsapp-integration-status";
import { WhatsAppHealthChecks } from "@/components/app/whatsapp/whatsapp-health-checks";

import { WhatsAppSecretsChecklist } from "@/components/app/whatsapp/whatsapp-secrets-checklist";
import { WhatsAppWebhookPanel } from "@/components/app/whatsapp/whatsapp-webhook-panel";
import { WhatsAppWebhookDeliveries } from "@/components/app/whatsapp/whatsapp-webhook-deliveries";
import { WhatsAppDeadLetterQueue } from "@/components/app/whatsapp/whatsapp-dead-letter-queue";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/whatsapp-status")({
  head: () => ({
    meta: [
      { title: "WhatsApp Status (Current Workspace) — Webhooks & Deliveries" },
      {
        name: "description",
        content:
          "Live WhatsApp webhook configuration, subscribed fields, verify tokens, and the most recent webhook delivery results for the workspace you're currently switched into (not cross-tenant).",
      },
      {
        property: "og:title",
        content: "WhatsApp Status (Current Workspace) — Webhooks & Deliveries",
      },
      {
        property: "og:description",
        content:
          "Callback URL, subscription fields, and recent inbound webhook envelopes for your current workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminPageShell
      title="WhatsApp Status (Current Workspace)"
      description="Webhook configuration, subscription fields, and the latest delivery results for the WhatsApp Cloud accounts in the workspace you're currently switched into. This is not a cross-tenant view — switch workspaces to inspect a different tenant's webhook health. See the platform-wide WhatsApp console for a read-only cross-tenant summary."
    >
      <div className="space-y-8">
        <WhatsAppIntegrationStatus />
        <WhatsAppHealthChecks />

        <WhatsAppSecretsChecklist />
        <WhatsAppWebhookPanel />
        <WhatsAppWebhookDeliveries limit={25} />
        <WhatsAppDeadLetterQueue limit={50} />
      </div>
    </AdminPageShell>
  ),
});
