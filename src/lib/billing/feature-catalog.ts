/**
 * Feature Management catalog.
 *
 * The single source of truth for every configurable per-plan limit and feature
 * flag surfaced across the app. The Feature Management admin UI renders this
 * catalog as a matrix (plans × capabilities); the runtime `usePlanFeatures`
 * hook resolves each key against the active plan's `features` / `limits`
 * jsonb, so shipping a new capability = one entry here.
 *
 * Limit values: number = hard cap, null = unlimited, undefined = 0/blocked.
 * Feature values: boolean.
 */

import type { LucideIcon } from "lucide-react";
import {
  Users, Building2, Layers, User, Briefcase, HandCoins, Kanban, Megaphone,
  Send, LayoutTemplate, Workflow, Sparkles, HardDrive, Zap, Phone,
  MessageCircle, Tag, FileBarChart2, Download,
} from "lucide-react";

export type CapabilityGroup =
  | "workspace" | "crm" | "sales" | "marketing"
  | "automation" | "ai" | "infrastructure" | "customization";

export interface LimitDefinition {
  kind: "limit";
  key: string;                 // matches meter_code
  label: string;
  description: string;
  unit: string;                // "seats" / "records" / "MB" / "requests/mo"
  icon: LucideIcon;
  group: CapabilityGroup;
  /** Suggested defaults used when a plan hasn't set the key yet. */
  defaults: { free: number | null; starter: number | null; pro: number | null; business: number | null; enterprise: number | null };
}

export interface FeatureDefinition {
  kind: "feature";
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: CapabilityGroup;
  defaults: { free: boolean; starter: boolean; pro: boolean; business: boolean; enterprise: boolean };
}

export type CapabilityDefinition = LimitDefinition | FeatureDefinition;

/* ------------------------------------------------------------------ */
/*  Configurable Limits — the 20 keys from Feature Management spec     */
/* ------------------------------------------------------------------ */

export const LIMITS: LimitDefinition[] = [
  { kind: "limit", key: "seats", label: "Users", description: "Total seats (agents + admins) across the organization.", unit: "seats", icon: Users, group: "workspace",
    defaults: { free: 3, starter: 5, pro: 10, business: 50, enterprise: null } },
  { kind: "limit", key: "organizations", label: "Organizations", description: "Tenant organizations the account can own.", unit: "orgs", icon: Building2, group: "workspace",
    defaults: { free: 1, starter: 1, pro: 2, business: 5, enterprise: null } },
  { kind: "limit", key: "workspaces", label: "Workspaces", description: "Isolated workspaces per organization.", unit: "workspaces", icon: Layers, group: "workspace",
    defaults: { free: 1, starter: 2, pro: 5, business: 25, enterprise: null } },
  { kind: "limit", key: "contacts", label: "Contacts", description: "Total contact records stored across all workspaces.", unit: "contacts", icon: User, group: "crm",
    defaults: { free: 500, starter: 5000, pro: 25000, business: 100000, enterprise: null } },
  { kind: "limit", key: "companies", label: "Companies", description: "Company / account records.", unit: "companies", icon: Briefcase, group: "crm",
    defaults: { free: 100, starter: 1000, pro: 10000, business: 50000, enterprise: null } },
  { kind: "limit", key: "deals", label: "Deals", description: "Open + won deal records tracked in pipelines.", unit: "deals", icon: HandCoins, group: "sales",
    defaults: { free: 50, starter: 500, pro: 5000, business: 25000, enterprise: null } },
  { kind: "limit", key: "pipelines", label: "Pipelines", description: "Custom sales pipelines with distinct stages.", unit: "pipelines", icon: Kanban, group: "sales",
    defaults: { free: 1, starter: 2, pro: 5, business: 20, enterprise: null } },
  { kind: "limit", key: "campaigns_per_month", label: "Campaigns / month", description: "Marketing campaigns launched per month.", unit: "campaigns/mo", icon: Megaphone, group: "marketing",
    defaults: { free: 1, starter: 5, pro: 25, business: 100, enterprise: null } },
  { kind: "limit", key: "broadcasts_per_month", label: "Broadcasts / month", description: "Broadcast message batches per month.", unit: "broadcasts/mo", icon: Send, group: "marketing",
    defaults: { free: 100, starter: 2500, pro: 25000, business: 100000, enterprise: null } },
  { kind: "limit", key: "templates", label: "Templates", description: "Approved WhatsApp + message templates.", unit: "templates", icon: LayoutTemplate, group: "marketing",
    defaults: { free: 3, starter: 10, pro: 50, business: 200, enterprise: null } },
  { kind: "limit", key: "workflows", label: "Workflows", description: "Published automations that can trigger.", unit: "workflows", icon: Workflow, group: "automation",
    defaults: { free: 2, starter: 10, pro: 50, business: 200, enterprise: null } },
  { kind: "limit", key: "ai_requests_per_month", label: "AI Usage", description: "AI Provider Engine requests per month (all providers).", unit: "requests/mo", icon: Sparkles, group: "ai",
    defaults: { free: 100, starter: 2500, pro: 25000, business: 100000, enterprise: null } },
  { kind: "limit", key: "storage_mb", label: "Storage", description: "Media & attachment storage.", unit: "MB", icon: HardDrive, group: "infrastructure",
    defaults: { free: 100, starter: 1024, pro: 10240, business: 102400, enterprise: null } },
  { kind: "limit", key: "api_requests_per_month", label: "API Requests", description: "Outbound + inbound API calls per month.", unit: "requests/mo", icon: Zap, group: "infrastructure",
    defaults: { free: 1000, starter: 25000, pro: 250000, business: 1000000, enterprise: null } },
  { kind: "limit", key: "phone_numbers", label: "Phone Numbers", description: "Provisioned messaging phone numbers.", unit: "numbers", icon: Phone, group: "infrastructure",
    defaults: { free: 1, starter: 1, pro: 3, business: 10, enterprise: null } },
  { kind: "limit", key: "whatsapp_accounts", label: "WhatsApp Accounts", description: "Connected WABAs (WhatsApp Business Accounts).", unit: "accounts", icon: MessageCircle, group: "infrastructure",
    defaults: { free: 1, starter: 1, pro: 2, business: 5, enterprise: null } },
  { kind: "limit", key: "custom_fields", label: "Custom Fields", description: "Custom fields across contacts, deals, companies.", unit: "fields", icon: Tag, group: "customization",
    defaults: { free: 5, starter: 20, pro: 100, business: 500, enterprise: null } },
  { kind: "limit", key: "reports", label: "Reports", description: "Saved BI reports & dashboards.", unit: "reports", icon: FileBarChart2, group: "customization",
    defaults: { free: 3, starter: 10, pro: 50, business: 200, enterprise: null } },
  { kind: "limit", key: "exports_per_month", label: "Export Limits", description: "Data exports per month (CSV / PDF / Excel).", unit: "exports/mo", icon: Download, group: "customization",
    defaults: { free: 5, starter: 50, pro: 500, business: 5000, enterprise: null } },
];

/* ------------------------------------------------------------------ */
/*  Feature flags — gated capabilities per plan                        */
/* ------------------------------------------------------------------ */

export const FEATURES: FeatureDefinition[] = [
  { kind: "feature", key: "ai.reply_assistant", label: "AI Reply Assistant", description: "Suggest replies in conversations.", icon: Sparkles, group: "ai",
    defaults: { free: false, starter: false, pro: true, business: true, enterprise: true } },
  { kind: "feature", key: "ai.knowledge_base", label: "AI Knowledge Base (RAG)", description: "Semantic search across articles.", icon: Sparkles, group: "ai",
    defaults: { free: false, starter: false, pro: true, business: true, enterprise: true } },
  { kind: "feature", key: "automations.enabled", label: "Automations", description: "Workflow builder & execution engine.", icon: Workflow, group: "automation",
    defaults: { free: false, starter: true, pro: true, business: true, enterprise: true } },
  { kind: "feature", key: "marketing.ab_testing", label: "A/B Testing", description: "Multi-variant campaign testing.", icon: Megaphone, group: "marketing",
    defaults: { free: false, starter: false, pro: true, business: true, enterprise: true } },
  { kind: "feature", key: "marketing.drip_sequences", label: "Drip Sequences", description: "Automated multi-step nurture flows.", icon: Send, group: "marketing",
    defaults: { free: false, starter: false, pro: true, business: true, enterprise: true } },
  { kind: "feature", key: "bi.custom_dashboards", label: "Custom Dashboards", description: "Configurable BI dashboards.", icon: FileBarChart2, group: "customization",
    defaults: { free: false, starter: false, pro: true, business: true, enterprise: true } },
  { kind: "feature", key: "bi.scheduled_reports", label: "Scheduled Reports", description: "Email/WhatsApp delivery of reports.", icon: FileBarChart2, group: "customization",
    defaults: { free: false, starter: false, pro: false, business: true, enterprise: true } },
  { kind: "feature", key: "api.public_access", label: "Public API Access", description: "Personal access tokens for the REST API.", icon: Zap, group: "infrastructure",
    defaults: { free: false, starter: false, pro: true, business: true, enterprise: true } },
  { kind: "feature", key: "security.sso", label: "SSO / SAML", description: "Enterprise single sign-on.", icon: Users, group: "infrastructure",
    defaults: { free: false, starter: false, pro: false, business: true, enterprise: true } },
  { kind: "feature", key: "security.audit_export", label: "Audit Log Export", description: "Export audit logs for compliance.", icon: Download, group: "infrastructure",
    defaults: { free: false, starter: false, pro: false, business: true, enterprise: true } },
];

export const CAPABILITIES: CapabilityDefinition[] = [...LIMITS, ...FEATURES];

export const GROUP_LABELS: Record<CapabilityGroup, string> = {
  workspace: "Workspace",
  crm: "CRM",
  sales: "Sales",
  marketing: "Marketing",
  automation: "Automation",
  ai: "AI",
  infrastructure: "Infrastructure",
  customization: "Customization",
};

/** Tier bucket used to look up defaults by plan.tier. */
export function bucketForTier(tier: string): keyof LimitDefinition["defaults"] {
  if (tier === "enterprise") return "enterprise";
  if (tier === "business" || tier === "growth") return "business";
  if (tier === "professional") return "pro";
  if (tier === "starter") return "starter";
  return "free";
}

export function formatLimit(v: number | null | undefined, unit: string): string {
  if (v === null) return "Unlimited";
  if (v === undefined || v === 0) return "—";
  if (v < 0) return "Unlimited";
  return `${v.toLocaleString()} ${unit}`;
}
