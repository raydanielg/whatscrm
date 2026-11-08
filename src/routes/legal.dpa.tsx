import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { LegalPageShell } from "@/components/app/legal-page-shell";

const DESCRIPTION =
  `${BRAND_NAME}'s Data Processing Agreement covering roles, security measures, sub-processors, international transfers, and data subject rights.`;
const TITLE = "Data Processing Agreement";

export const Route = createFileRoute("/legal/dpa")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/legal/dpa" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "/legal/dpa" }],
  }),
  component: DpaPage,
});

function DpaPage() {
  return (
    <LegalPageShell
      title="Data Processing Agreement"
      subtitle="Last updated: July 30, 2026"
    >
      <p>
        This Data Processing Agreement (&ldquo;DPA&rdquo;) forms part of the Terms of Service between
        you (the &ldquo;Customer&rdquo;, acting as data controller) and <Brand /> (acting as data
        processor) and applies whenever <Brand /> processes personal data on the Customer&rsquo;s
        behalf.
      </p>

      <h2>1. Definitions</h2>
      <p>
        &ldquo;Personal data&rdquo;, &ldquo;processing&rdquo;, &ldquo;controller&rdquo;,
        &ldquo;processor&rdquo;, and &ldquo;data subject&rdquo; have the meanings given in the
        applicable data protection laws, including the EU General Data Protection Regulation (GDPR)
        and the UK GDPR.
      </p>

      <h2>2. Roles and scope</h2>
      <p>
        The Customer determines the purposes and means of processing. <Brand /> processes personal
        data only on documented instructions from the Customer, including as set out in this DPA and
        as required to provide the service.
      </p>

      <h2>3. Nature and purpose of processing</h2>
      <p>
        <Brand /> processes personal data to deliver messaging, CRM, marketing, support, automation,
        and analytics features requested by the Customer.
      </p>
      <p>
        <strong>Categories of data subjects:</strong> the Customer&rsquo;s end users, contacts,
        leads, customers, and authorised team members.
      </p>
      <p>
        <strong>Categories of personal data:</strong> identifiers (name, phone number, email
        address), message and conversation content, account and usage metadata, and any other data
        the Customer chooses to submit.
      </p>

      <h2>4. Customer obligations</h2>
      <p>
        The Customer warrants that it has a valid legal basis for the processing, has provided all
        required notices, and has obtained any consents needed for the data it submits to <Brand />,
        including consents required for messaging channels such as WhatsApp.
      </p>

      <h2>5. Confidentiality</h2>
      <p>
        <Brand /> ensures that personnel authorised to process personal data are bound by
        confidentiality obligations and receive appropriate data protection training.
      </p>

      <h2>6. Security measures</h2>
      <p>
        <Brand /> implements appropriate technical and organisational measures, including encryption
        in transit and at rest, tenant isolation enforced at the database layer, role-based access
        control, least-privilege access to production systems, audit logging, and regular backups.
      </p>

      <h2>7. Sub-processors</h2>
      <p>
        The Customer grants general authorisation for <Brand /> to engage sub-processors for hosting,
        infrastructure, messaging delivery, payments, and analytics. <Brand /> imposes data protection
        obligations on each sub-processor that are no less protective than this DPA and remains
        liable for their performance. <Brand /> will give reasonable notice of new sub-processors so
        the Customer may object on legitimate grounds.
      </p>

      <h2>8. International transfers</h2>
      <p>
        Where personal data is transferred outside the EEA or the UK, <Brand /> relies on an
        appropriate transfer mechanism, such as the European Commission&rsquo;s Standard Contractual
        Clauses together with any supplementary measures required.
      </p>

      <h2>9. Data subject rights</h2>
      <p>
        Taking into account the nature of the processing, <Brand /> assists the Customer with
        responding to data subject requests for access, rectification, erasure, restriction,
        portability, and objection, using the tools available in the product and reasonable support
        where those tools are insufficient.
      </p>

      <h2>10. Personal data breaches</h2>
      <p>
        <Brand /> notifies the Customer without undue delay after becoming aware of a personal data
        breach affecting the Customer&rsquo;s data, and provides information reasonably available to
        support the Customer&rsquo;s own notification obligations.
      </p>

      <h2>11. Audits</h2>
      <p>
        <Brand /> makes available information reasonably necessary to demonstrate compliance with this
        DPA and allows for audits, including inspections, conducted by the Customer or an
        independent auditor mandated by the Customer, on reasonable notice and subject to
        confidentiality.
      </p>

      <h2>12. Deletion and return of data</h2>
      <p>
        On termination of the service, <Brand /> deletes or returns the Customer&rsquo;s personal data
        in accordance with the retention periods described in the Privacy Policy, unless applicable
        law requires further storage.
      </p>

      <h2>13. Contact</h2>
      <p>
        For questions about this DPA or to request a signed copy, contact our privacy team through
        the contact page.
      </p>
    </LegalPageShell>
  );
}
