/**
 * Platform feature flags → app surfaces.
 *
 * Super Admin → Platform Settings → Feature toggles turns whole modules on
 * or off for the entire platform. This module is the single place that maps
 * a flag to the routes it governs, so navigation, the command palette and
 * route guards all agree.
 *
 * Client-safe: no server imports.
 */
import { PLATFORM_FEATURE_DEFAULTS } from "@/lib/admin/platform-runtime.functions";

/** Route prefixes governed by each feature flag. */
export const FEATURE_ROUTE_PREFIXES: Record<string, string[]> = {
  ai_assistant: ["/ai-studio", "/sales-ai", "/ai-"],
  sales_crm: ["/deals", "/sales", "/products", "/quotes", "/invoices", "/activities"],
  marketing: [
    "/marketing",
    "/campaigns",
    "/broadcasts",
    "/campaign-templates",
    "/drip",
    "/scheduling",
    "/audience",
    "/segments",
    "/contact-lists",
    "/social",
  ],
  automations: ["/automations", "/workflows"],
  bi: ["/bi", "/reports", "/analytics", "/insights"],
  kb_rag: ["/knowledge"],
  project_management: ["/projects"],
  commerce: ["/commerce"],
  booking: ["/booking"],
  helpdesk: ["/helpdesk", "/satisfaction"],
  live_chat: ["/livechat"],
  chatbots: ["/chatbots", "/wa-chatbot"],
};

/** Flags that only affect in-page behaviour (no dedicated routes). */
export const NON_ROUTE_FEATURES = ["voice_notes", "beta_features"] as const;

export type SubFeature = { k: string; label: string; prefixes: string[] };

/**
 * Finer-grained toggles nested under a parent module. Stored in the same
 * `feature_flags` settings blob under the dotted key `${parent}.${sub}`, so
 * turning the whole module off still wins — a sub-toggle only matters while
 * its parent is on.
 */
export const FEATURE_SUB_FEATURES: Record<string, SubFeature[]> = {
  ai_assistant: [
    { k: "ai_studio", label: "AI Studio", prefixes: ["/ai-studio"] },
    { k: "sales_ai", label: "Sales AI", prefixes: ["/sales-ai"] },
  ],
  sales_crm: [
    { k: "deals_pipeline", label: "Deals & pipeline", prefixes: ["/deals", "/sales"] },
    { k: "products", label: "Products", prefixes: ["/products"] },
    { k: "quotes_invoices", label: "Quotes & invoices", prefixes: ["/quotes", "/invoices"] },
    { k: "activities", label: "Activities", prefixes: ["/activities"] },
  ],
  marketing: [
    {
      k: "campaigns",
      label: "Campaigns & broadcasts",
      prefixes: ["/campaigns", "/broadcasts", "/campaign-templates"],
    },
    { k: "drip", label: "Drip sequences & scheduling", prefixes: ["/drip", "/scheduling"] },
    {
      k: "audience",
      label: "Audience & segments",
      prefixes: ["/audience", "/segments", "/contact-lists"],
    },
    { k: "social", label: "Social inbox", prefixes: ["/social"] },
  ],
  automations: [
    { k: "workflow_builder", label: "Workflow builder", prefixes: ["/automations", "/workflows"] },
    { k: "webhooks", label: "Webhook automations", prefixes: ["/webhook-automation"] },
    { k: "billing_automation", label: "Billing automation", prefixes: ["/billing-automation"] },
  ],
  bi: [
    { k: "reports", label: "Reports", prefixes: ["/reports"] },
    { k: "analytics", label: "Analytics dashboards", prefixes: ["/analytics"] },
    { k: "forecasting", label: "Forecasting", prefixes: ["/forecasting"] },
  ],
  project_management: [
    { k: "tasks", label: "Tasks", prefixes: ["/projects/tasks"] },
    { k: "board", label: "Kanban board", prefixes: ["/projects/board"] },
    { k: "team", label: "Team workload", prefixes: ["/projects/team"] },
  ],
  commerce: [
    { k: "catalog", label: "WhatsApp catalog", prefixes: ["/commerce/wa-catalog"] },
    { k: "payment_links", label: "Payment links", prefixes: ["/commerce/payment-links"] },
    { k: "inventory", label: "Inventory", prefixes: ["/commerce/inventory"] },
    { k: "shipping", label: "Shipping", prefixes: ["/commerce/shipping"] },
  ],
  helpdesk: [
    { k: "tickets", label: "Support tickets", prefixes: ["/helpdesk"] },
    { k: "satisfaction", label: "Satisfaction surveys", prefixes: ["/satisfaction"] },
  ],
  live_chat: [
    { k: "widget", label: "Chat widget", prefixes: ["/livechat"] },
    { k: "bots", label: "Live chat bots", prefixes: ["/livechat/bots"] },
  ],
  chatbots: [
    { k: "whatsapp_bot", label: "WhatsApp bot", prefixes: ["/wa-chatbot"] },
    { k: "website_bot", label: "Website chatbot", prefixes: ["/chatbots"] },
  ],
};

export function isFeatureEnabled(
  features: Record<string, boolean> | undefined,
  key: string,
): boolean {
  if (!features) return PLATFORM_FEATURE_DEFAULTS[key] ?? true;
  return features[key] ?? PLATFORM_FEATURE_DEFAULTS[key] ?? true;
}

/** Is a sub-feature on? False whenever its parent module is off. */
export function isSubFeatureEnabled(
  features: Record<string, boolean> | undefined,
  parentKey: string,
  subKey: string,
): boolean {
  if (!isFeatureEnabled(features, parentKey)) return false;
  return (features?.[`${parentKey}.${subKey}`] as boolean | undefined) ?? true;
}

function matchesRoutePrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix.endsWith("-") ? prefix : `${prefix}/`);
}

/**
 * Is a given app path allowed by the current platform feature flags?
 * Paths not governed by any flag are always allowed.
 */
export function isRouteEnabled(
  features: Record<string, boolean> | undefined,
  path: string,
): boolean {
  for (const [flag, prefixes] of Object.entries(FEATURE_ROUTE_PREFIXES)) {
    if (!isFeatureEnabled(features, flag)) {
      if (prefixes.some((p) => matchesRoutePrefix(path, p))) return false;
      continue;
    }
    for (const sub of FEATURE_SUB_FEATURES[flag] ?? []) {
      if (sub.prefixes.some((p) => matchesRoutePrefix(path, p))) {
        if (!isSubFeatureEnabled(features, flag, sub.k)) return false;
      }
    }
  }
  return true;
}

/** The flag that governs a path, if any (used for the "module disabled" screen). */
export function featureForRoute(path: string): string | null {
  for (const [flag, prefixes] of Object.entries(FEATURE_ROUTE_PREFIXES)) {
    if (prefixes.some((p) => matchesRoutePrefix(path, p))) return flag;
  }
  return null;
}
