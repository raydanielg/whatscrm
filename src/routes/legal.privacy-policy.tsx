import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/app/legal-page-shell";

const DESCRIPTION =
  `${BRAND_NAME}'s Privacy Policy: how we collect, use, share, and protect your personal data.`;
const TITLE = "Privacy Policy";

export const Route = createFileRoute("/legal/privacy-policy")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/legal/privacy-policy" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "/legal/privacy-policy" }],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle="Last updated: July 30, 2026"
    >
      <p>
        This Privacy Policy explains how <Brand /> ("we", "us", or "our") collects, uses, shares,
        and protects your personal information when you use our website, mobile applications, and
        services (collectively, the "Services"). By using the Services, you agree to this Privacy
        Policy.
      </p>

      <h2>1. Information we collect</h2>
      <p>
        We collect information that you provide directly to us, such as your name, email address,
        phone number, payment information, and any other information you choose to provide.
      </p>
      <p>
        We also collect information automatically, including your IP address, device type, browser
        type, operating system, pages visited, and usage patterns. We use cookies and similar
        technologies for this purpose.
      </p>
      <p>
        When you use messaging or CRM features, we process the content you send and receive on your
        behalf, as well as contact details and conversation metadata.
      </p>

      <h2>2. How we use your information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Provide, operate, and improve the Services;</li>
        <li>Process payments and manage subscriptions;</li>
        <li>Communicate with you, including support and updates;</li>
        <li>Ensure security and prevent fraud;</li>
        <li>Comply with legal obligations.</li>
      </ul>

      <h2>3. Sharing of information</h2>
      <p>
        We do not sell your personal information. We may share information with service providers
        who perform services on our behalf, such as hosting, payment processing, analytics, and
        customer support. We may also disclose information if required by law or to protect our
        rights.
      </p>

      <h2>4. Data retention</h2>
      <p>
        We retain your personal information for as long as necessary to provide the Services and
        fulfill the purposes described in this policy, unless a longer retention period is required
        by law. You may request deletion of your data by contacting us.
      </p>

      <h2>5. Your rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct, delete, or restrict the
        use of your personal information. You may also have the right to object to processing or to
        data portability. To exercise these rights, contact us at{" "}
        <a href="mailto:privacy@wacrm.app">privacy@wacrm.app</a>.
      </p>

      <h2>6. International transfers</h2>
      <p>
        Your information may be transferred to and processed in countries other than your country of
        residence. We take appropriate safeguards to protect your information in accordance with
        applicable data protection laws.
      </p>

      <h2>7. Security</h2>
      <p>
        We implement technical and organizational measures to protect your information, including
        encryption, access controls, and regular security assessments. However, no system is
        completely secure, and we cannot guarantee absolute security.
      </p>

      <h2>8. Children's privacy</h2>
      <p>
        The Services are not intended for children under 16 years of age. We do not knowingly collect
        personal information from children. If you believe we have collected information from a
        child, please contact us.
      </p>

      <h2>9. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of significant
        changes by posting the new policy on this page and updating the "Last updated" date.
      </p>

      <h2>10. Contact us</h2>
      <p>
        If you have questions or concerns about this Privacy Policy, please contact us at{" "}
        <a href="mailto:privacy@wacrm.app">privacy@wacrm.app</a>.
      </p>
    </LegalPageShell>
  );
}
