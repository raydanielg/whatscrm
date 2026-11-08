import { BRAND_NAME } from "@/lib/branding/brand";

/**
 * Shared landing-page content used by both the rendered sections and the
 * structured data (JSON-LD) in the route head, so the markup search engines
 * read can never drift from what visitors see.
 */

// Canonical production host, matching sitemap.xml, robots.txt and DOCS_BASE_URL.
// Not a lovable.app preview subdomain: those are assigned by the platform and
// cannot be renamed from here.
export const SITE_URL = "https://wrapcoders.bid";
export const OG_IMAGE_URL = `${SITE_URL}/api/public/og.png`;

export function getLandingContent(brandName: string) {
  const name = brandName.trim() || BRAND_NAME;
  return {
    title: `${name} — Omnichannel CRM, Shared Inbox & AI Automation`,
    description: `${name} is a self-hosted omnichannel CRM: a shared team inbox for WhatsApp, Messenger, Instagram, Telegram and email, plus sales pipeline, AI chatbots, broadcast campaigns and commerce.`,
  };
}

export const { title: LANDING_TITLE, description: LANDING_DESCRIPTION } =
  getLandingContent(BRAND_NAME);

export const LANDING_SOCIAL_DESCRIPTION =
  "Run sales, support and marketing across WhatsApp, Messenger, Instagram, Telegram and email from one multi-tenant platform. AI Studio, automations and self-hosting.";

export const FAQ_CATEGORIES = [
  { id: "product", label: "Product" },
  { id: "channels", label: "Channels" },
  { id: "ai", label: "AI & automation" },
  { id: "security", label: "Security" },
  { id: "deployment", label: "Deployment" },
  { id: "pricing", label: "Pricing & licensing" },
] as const;

export type FaqCategoryId = (typeof FAQ_CATEGORIES)[number]["id"];

export type Faq = {
  /** Stable slug used for the `#faq-<id>` deep link. */
  id: string;
  category: FaqCategoryId;
  q: string;
  a: string;
};

export const LANDING_FAQS: Faq[] = [
  {
    id: "self-host",
    category: "deployment",
    q: "Can I self-host WACRM?",
    a: "Yes — ship it with Docker, Cloudflare Workers, a VPS via systemd, or cPanel. Full instructions in the docs.",
  },
  {
    id: "cloud-api",
    category: "channels",
    q: "Do you support the official WhatsApp Cloud API?",
    a: "Yes. WACRM is built directly on Meta's Cloud API — no third-party gateways or proxies.",
  },
  {
    id: "multi-tenant",
    category: "security",
    q: "Is it truly multi-tenant?",
    a: "Every workspace is fully isolated at the row level with RLS, dedicated storage paths, and role-scoped policies.",
  },
  {
    id: "license",
    category: "pricing",
    q: "What's included with a license?",
    a: "Full source, database migrations, docs portal, PWA assets, and 6 months of support with lifetime updates.",
  },
  {
    id: "ai-providers",
    category: "ai",
    q: "Which AI providers are supported?",
    a: "Gemini, OpenAI, Anthropic and other configured providers are available through the app's AI provider settings.",
  },
  {
    id: "white-label",
    category: "product",
    q: "Can I white-label it?",
    a: "Yes. Branding, PWA icons, colors, domain and email sender are all configurable per tenant.",
  },
  {
    id: "other-channels",
    category: "channels",
    q: "Which channels beyond WhatsApp are supported?",
    a: "Telegram, Instagram, Facebook Messenger, the embeddable live chat widget, plus email and SMS accounts — all landing in the same unified inbox.",
  },
  {
    id: "shared-inbox",
    category: "product",
    q: "How does the shared team inbox work?",
    a: "Conversations from every channel merge into one threaded timeline with assignment, SLA timers, internal notes, typing indicators and unified unread badges.",
  },
  {
    id: "templates",
    category: "channels",
    q: "Can I manage WhatsApp message templates?",
    a: "Yes. Create, submit and version templates with media headers, variable editing and a picker that fills variables before sending.",
  },
  {
    id: "chatbots",
    category: "ai",
    q: "Can bots hand off to a human agent?",
    a: "The chatbot builder supports multi-language triggers, skills-based routing and operator handoff that hands the thread to the right agent mid-conversation.",
  },
  {
    id: "automation",
    category: "ai",
    q: "Is there a no-code workflow builder?",
    a: "Yes — a visual builder for triggers, conditions and actions across messaging, CRM records, campaigns and webhooks.",
  },
  {
    id: "crm",
    category: "product",
    q: "Does it include a CRM and sales pipeline?",
    a: "Contacts, companies, deals and a drag-and-drop pipeline are built in, with contact matching that links every conversation to the right record.",
  },
  {
    id: "data-security",
    category: "security",
    q: "How is my data protected?",
    a: "Row-level security on every table, encrypted channel credentials, scoped API keys, audit logs for platform changes and a built-in security scan dashboard.",
  },
  {
    id: "payments",
    category: "pricing",
    q: "Which payment gateways can I bill with?",
    a: "Stripe and Paddle are wired end to end — plan-to-price mapping, checkout, webhooks for renewals and cancellations, plus sandbox and live environments.",
  },
  {
    id: "migration",
    category: "deployment",
    q: "Can I use my own domain and email sender?",
    a: "Yes. Custom domains, per-tenant white-label branding and your own transactional email sending domain are all supported.",
  },
  {
    id: "mobile",
    category: "product",
    q: "Is there a mobile experience?",
    a: "The app is an installable PWA with push notifications, and the inbox is fully optimised for phones and tablets.",
  },
];

export function getLandingFaqs(brandName: string): Faq[] {
  const name = brandName.trim() || BRAND_NAME;
  return LANDING_FAQS.map((faq) => ({
    ...faq,
    q: faq.q.replaceAll("WACRM", name),
    a: faq.a.replaceAll("WACRM", name),
  }));
}

/** JSON-LD graph for the landing page: product, site search, and the FAQ. */
export function landingJsonLd(brandName = BRAND_NAME) {
  const name = brandName.trim() || BRAND_NAME;
  const content = getLandingContent(name);
  const faqs = getLandingFaqs(name);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name,
        url: SITE_URL,
        logo: `${SITE_URL}/icon-512.png`,
        description: LANDING_SOCIAL_DESCRIPTION,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name,
        description: content.description,
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "CRM",
        operatingSystem: "Web, iOS, Android",
        url: SITE_URL,
        image: OG_IMAGE_URL,
        description: content.description,
        publisher: { "@id": `${SITE_URL}/#organization` },
        featureList: [
          "Shared WhatsApp team inbox",
          "Sales pipeline and CRM",
          "AI chatbots and AI Studio",
          "Broadcast and drip campaigns",
          "No-code workflow automation",
          "WhatsApp commerce and catalogues",
          "Multi-tenant workspaces with RLS",
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}
