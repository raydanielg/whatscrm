import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/app/legal-page-shell";

const DESCRIPTION =
  `${BRAND_NAME}'s Terms of Service: the rules and conditions for using our platform and services.`;
const TITLE = "Terms of Service";

export const Route = createFileRoute("/legal/terms-of-service")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/legal/terms-of-service" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "/legal/terms-of-service" }],
  }),
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      subtitle="Last updated: July 30, 2026"
    >
      <p>
        These Terms of Service ("Terms") govern your access to and use of the <Brand /> website,
        applications, and services (collectively, the "Services"). By using the Services, you agree
        to be bound by these Terms.
      </p>

      <h2>1. Acceptance of terms</h2>
      <p>
        By creating an account, accessing, or using the Services, you confirm that you are at least
        18 years old and have the authority to enter into these Terms. If you use the Services on behalf
        of an organization, you represent that you have authority to bind that organization.
      </p>

      <h2>2. Accounts and registration</h2>
      <p>
        You must provide accurate and complete information when creating an account. You are
        responsible for maintaining the confidentiality of your account credentials and for all
        activities that occur under your account. Notify us immediately of any unauthorized use.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to use the Services to:</p>
      <ul>
        <li>Send spam, unsolicited messages, or phishing content;</li>
        <li>Transmit malware, viruses, or other harmful code;</li>
        <li>Violate any applicable laws or regulations;</li>
        <li>Infringe on the intellectual property or privacy rights of others;</li>
        <li>Abuse, harass, or discriminate against others;</li>
        <li>Interfere with the operation or security of the Services.</li>
      </ul>
      <p>
        You are responsible for complying with the terms and policies of any third-party messaging
        channels you connect, such as WhatsApp, Messenger, and Telegram.
      </p>

      <h2>4. Subscriptions and payments</h2>
      <p>
        Some features require a paid subscription. Fees are charged in advance on a monthly or annual
        basis and are non-refundable except as required by law or as described in our refund policy.
      </p>
      <p>
        You may cancel your subscription at any time. Cancellation takes effect at the end of the
        current billing period. We reserve the right to change pricing with reasonable notice.
      </p>

      <h2>5. Intellectual property</h2>
      <p>
        <Brand /> retains all rights, title, and interest in the Services, including all software,
        designs, trademarks, and content. You retain ownership of your data and grant us a limited
        license to use it solely to provide the Services.
      </p>

      <h2>6. Data and privacy</h2>
      <p>
        Your use of the Services is also governed by our Privacy Policy. By using the Services, you
        consent to the collection and use of information as described in that policy.
      </p>

      <h2>7. Service availability</h2>
      <p>
        We aim to provide reliable and secure Services but do not guarantee uninterrupted access. We
        may suspend or modify the Services for maintenance, security, or other reasons. Planned
        maintenance will be announced when possible.
      </p>

      <h2>8. Termination</h2>
      <p>
        We may suspend or terminate your access if you violate these Terms or if required by law.
        You may terminate your account at any time. Upon termination, your right to use the Services
        ceases, and we may delete your data in accordance with our Privacy Policy.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, <Brand /> and its affiliates shall not be liable for any
        indirect, incidental, special, consequential, or punitive damages arising out of your use of
        the Services. Our total liability shall not exceed the amount you paid us in the 12 months
        preceding the claim.
      </p>

      <h2>10. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless <Brand /> and its affiliates from any claims, damages,
        or expenses arising from your use of the Services, your content, or your violation of these
        Terms.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction in which <Brand /> is registered,
        without regard to conflict of law principles. Disputes shall be resolved in the competent courts
        of that jurisdiction.
      </p>

      <h2>12. Changes to these terms</h2>
      <p>
        We may update these Terms from time to time. We will notify you of material changes by posting
        the updated Terms on this page and updating the "Last updated" date. Continued use of the
        Services after changes constitutes acceptance.
      </p>

      <h2>13. Contact us</h2>
      <p>
        If you have questions about these Terms, please contact us at{" "}
        <a href="mailto:legal@wacrm.app">legal@wacrm.app</a>.
      </p>
    </LegalPageShell>
  );
}
