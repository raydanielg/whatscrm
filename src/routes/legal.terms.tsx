import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/app/legal-page-shell";

const DESCRIPTION =
  `The terms that govern your use of ${BRAND_NAME}, including acceptable use, billing, availability, and account termination.`;
const TITLE = "Terms of Service";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/legal/terms" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "/legal/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" subtitle="Last updated: July 20, 2026">
      <h2>1. Acceptance</h2>
      <p>By creating an account or using <Brand />, you agree to these terms.</p>
      <h2>2. Acceptable use</h2>
      <p>
        You will not use <Brand /> to send spam, phishing, malware, or content that violates
        WhatsApp's Business Messaging Policy or applicable law.
      </p>
      <h2>3. Subscription & billing</h2>
      <p>
        Paid plans renew monthly or annually. You can cancel at any time from Settings → Billing.
        Refunds are pro-rated for annual plans.
      </p>
      <h2>4. Availability</h2>
      <p>We target 99.9% uptime for hosted plans. Enterprise SLAs are contractual.</p>
      <h2>5. Liability</h2>
      <p>
        To the maximum extent permitted by law, <Brand /> is not liable for indirect or consequential
        damages.
      </p>
    </LegalPageShell>
  );
}
