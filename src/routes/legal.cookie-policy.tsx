import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { LegalPageShell } from "@/components/app/legal-page-shell";
import { Button } from "@/components/ui/button";
import { openCookiePreferences } from "@/lib/compliance/cookie-consent";

const DESCRIPTION =
  `How ${BRAND_NAME} uses cookies and similar technologies, the categories we set, and how to change your cookie preferences.`;
const TITLE = "Cookie Policy";

export const Route = createFileRoute("/legal/cookie-policy")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/legal/cookie-policy" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "/legal/cookie-policy" }],
  }),
  component: CookiePolicyPage,
});

function CookiePolicyPage() {
  return (
    <LegalPageShell title="Cookie Policy" subtitle="Last updated: July 30, 2026">
      <h2>1. What are cookies</h2>
      <p>
        Cookies are small text files stored on your device when you visit a website. They help us
        recognize your device, remember preferences, and improve your experience.
      </p>
      <h2>2. How we use cookies</h2>
      <p>
        <Brand /> uses cookies to keep you signed in, remember your preferences, understand how you
        use the app, and protect the service from abuse.
      </p>
      <h2>3. Types of cookies we use</h2>
      <p>
        <strong>Essential cookies</strong> are required for the app to function, including
        authentication and security.
      </p>
      <p>
        <strong>Preference cookies</strong> remember settings like language, theme, and workspace
        choices.
      </p>
      <p>
        <strong>Analytics cookies</strong> help us understand usage and improve the product. We use
        these only with your consent where required by law.
      </p>
      <h2>4. Third-party cookies</h2>
      <p>
        Some features may rely on trusted third-party services (e.g., analytics, payment providers).
        These services may set their own cookies subject to their own policies.
      </p>
      <h2>5. Managing cookies</h2>
      <p>
        You can review and change which cookie categories you allow at any time using the
        preferences center below. You can also manage or disable cookies through your browser
        settings. Please note that disabling essential cookies may prevent parts of <Brand /> from
        working correctly.
      </p>
      <p className="not-prose">
        <Button type="button" variant="outline" size="sm" onClick={() => openCookiePreferences()}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Cookie preferences
        </Button>
      </p>

      <h2>6. Contact us</h2>
      <p>
        If you have questions about this Cookie Policy, contact us at{" "}
        <a href="mailto:privacy@wacrm.app">privacy@wacrm.app</a>.
      </p>
    </LegalPageShell>
  );
}
