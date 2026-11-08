import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/app/legal-page-shell";

const DESCRIPTION =
  `How ${BRAND_NAME} collects, uses, stores, and protects your data, including retention and your privacy rights.`;
const TITLE = "Privacy Policy";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/legal/privacy" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "/legal/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" subtitle="Last updated: July 20, 2026">
      <h2>1. Data we collect</h2>
      <p>
        Account data (email, name, avatar), workspace data (contacts, conversations, messages you
        send/receive), and usage telemetry required to operate the service.
      </p>
      <h2>2. How we use it</h2>
      <p>
        To provide the service, secure your account, and improve product performance. We do not sell
        data. We do not train third-party models on your conversation content.
      </p>
      <h2>3. Data location</h2>
      <p>
        Primary storage in the region you select at workspace creation. Self-hosted deployments
        store all data on infrastructure you control.
      </p>
      <h2>4. Retention</h2>
      <p>
        Messages: retained until you delete them or close your workspace. Backups: 30 days. Audit
        logs: 1 year.
      </p>
      <h2>5. Your rights</h2>
      <p>
        Access, export, correction, and deletion — available from Settings → Data, or by emailing{" "}
        <a href="mailto:privacy@wacrm.app">privacy@wacrm.app</a>.
      </p>
    </LegalPageShell>
  );
}
