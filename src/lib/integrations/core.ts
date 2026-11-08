/**
 * Integration Provider Abstraction Layer.
 *
 * Every integration (Google Drive, Slack, Stripe, custom Webhook, ) plugs in as an
 * `IntegrationProvider`. The core app never imports a specific provider — it goes
 * through the registry, so adding a new integration = adding one file under
 * `src/lib/integrations/providers/` and registering it. Nothing else changes.
 *
 * Client-safe: this file MUST NOT import any *.server.ts module. Providers may
 * ship both a client-safe manifest (this file's shape) and a server-only action
 * implementation loaded lazily inside a server function.
 */

import type { LucideIcon } from "lucide-react";

export type IntegrationCategory =
  | "Productivity"
  | "Communication"
  | "Storage"
  | "Marketing"
  | "Payments"
  | "CRM"
  | "AI"
  | "Analytics"
  | "Accounting"
  | "Automation"
  | "Developer";

export type AuthType =
  | "oauth2"          // provider handles OAuth (per-user or workspace)
  | "api_key"         // static API key entered during setup
  | "webhook_url"     // outbound webhook, only needs a URL + optional secret
  | "signed_request"  // inbound webhook trigger, signature verified
  | "none";           // no auth (dev/testing helpers)

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "select" | "url" | "textarea" | "boolean";
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: readonly string[];
  defaultValue?: string | boolean;
  secret?: boolean; // true → stored server-side only, never returned to browser
}

export interface IntegrationCapability {
  /** Machine id, e.g. `"send_message"`. */
  id: string;
  /** Human label shown in workflow builder / marketplace. */
  label: string;
  /** `"action"` = we call the provider; `"trigger"` = provider calls us. */
  kind: "action" | "trigger";
  description?: string;
  /** JSON-schema-ish input contract for workflow builder wiring. */
  inputs?: Array<{ key: string; label: string; type: "string" | "number" | "boolean" | "json"; required?: boolean }>;
}

/**
 * Client-safe manifest. Registered at module load; no provider secrets in scope.
 */
export interface IntegrationProvider {
  /** Stable id used everywhere (DB, workflows, URLs). Matches marketplace slug. */
  id: string;
  name: string;
  vendor: string;
  category: IntegrationCategory;
  tagline: string;
  description?: string;
  version: string;
  authType: AuthType;
  /** OAuth scopes / permission strings shown in the consent screen. */
  scopes?: readonly string[];
  configSchema: readonly ConfigField[];
  capabilities: readonly IntegrationCapability[];
  docsUrl?: string;
  featured?: boolean;
  recommended?: boolean;
  icon?: LucideIcon;
  /**
   * If true, the actual API implementation lives in a `.server.ts` module and is
   * loaded on-demand by the runtime executor (see `runIntegrationAction`).
   */
  hasServerRuntime?: boolean;
  /**
   * oauth2 providers only. True only once a real per-user OAuth flow (an
   * actually provisioned App User Connector client, or equivalent) is wired
   * up end to end. Defaults to false/absent, which the connect dialog reads
   * as "not available yet" — it must never simulate a successful OAuth
   * handshake for a provider that doesn't set this.
   */
  oauthImplemented?: boolean;
}

/** In-memory registry. */
const REGISTRY = new Map<string, IntegrationProvider>();

export function registerProvider(p: IntegrationProvider): void {
  if (REGISTRY.has(p.id)) return; // idempotent — HMR-safe
  REGISTRY.set(p.id, p);
}

export function getProvider(id: string): IntegrationProvider | undefined {
  return REGISTRY.get(id);
}

export function listProviders(): IntegrationProvider[] {
  return Array.from(REGISTRY.values());
}

export function listByCategory(cat: IntegrationCategory): IntegrationProvider[] {
  return listProviders().filter((p) => p.category === cat);
}
