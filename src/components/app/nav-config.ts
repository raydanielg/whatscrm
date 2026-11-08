import {
  LayoutDashboard,
  MessagesSquare,
  Users,
  Building2,
  Handshake,
  Send,
  Zap,
  Sparkles,
  BarChart3,
  FileBarChart,
  Settings,
  UsersRound,
  CreditCard,
  ShieldCheck,
  KeyRound,
  UserCircle,
  Shield,
  ShieldAlert,
  Bell,
  Volume2,
  Target,
  Heart,
  Sliders,
  Tag,
  Activity,
  BookOpen,
  TrendingUp,
  Package,
  FileText,
  Receipt,
  CalendarClock,
  Download,
  Bot,
  Workflow,
  ListTodo,
  LifeBuoy,
  ListTree,
  Timer,
  Tags,
  Star,
  LayoutGrid,
  MessageCircle,
  ShoppingCart,
  Store,
  Palette,
  Code2,
  Link2,
  Smile,
  Boxes,
  Search,
  Globe,
  Tags as TagsIcon,
  Wrench,
  Plus,
  BookUser,
  Webhook,
  Radio,
  Plug,
  Share2,
  IdCard,
  Mail,
  Instagram,
  FolderKanban,
  Kanban,
} from "lucide-react";
import { docsUrl } from "@/lib/docs/links";
import { SHOW_RESOURCE_LINKS } from "@/lib/docs/visibility";

export type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  shortcut?: string;
  group:
    | "inbox"
    | "workspace"
    | "communications"
    | "crm"
    | "projects"
    | "marketing"
    | "automation"
    | "insights"
    | "api"
    | "settings"
    | "admin";
  /** Optional sub-group label used to nest items under the main nav group. */
  category?: string;
  /** Permission required to see this menu item. Omit for public-in-app items. */
  permission?: string;
  /** When true, `to` is an external URL and renders as <a target="_blank">. */
  external?: boolean;
  /** When true, active state requires an exact pathname match. */
  exact?: boolean;
  /** Optional hash (no "#") for in-page deep links, e.g. Social Studio tabs. */
  hash?: string;
};

/**
 * Flat navigation authority. Top-level `group`s organize related workflows;
 * depth is expressed through `category`, which the sidebar renders as a
 * collapsible sub-group.
 */
/**
 * Stable, unique React key for a nav item.
 *
 * `to` alone is NOT unique: 13 paths are reused by several entries that differ
 * only by `hash` or `label` (Social Studio alone has six `/social` rows, plus
 * /reports, /profile, /inbox, /dashboard, /contacts and others). Keying lists
 * by `to` produced dozens of "Encountered two children with the same key"
 * errors, and React warns that duplicate keys may duplicate or omit children —
 * so menu entries could silently render wrong.
 */
export function navKey(item: Pick<NavItem, "to" | "hash" | "label">): string {
  return `${item.to}#${item.hash ?? ""}|${item.label}`;
}

export const NAV_ITEMS: NavItem[] = [
  // ── Workspace ───────────────────────────────────────────────
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    group: "workspace",
    shortcut: "G D",
    permission: "page.dashboard",
  },
  {
    to: "/inbox",
    label: "Inbox",
    icon: MessagesSquare,
    group: "inbox",
    shortcut: "G I",
    permission: "page.inbox",
  },
  { to: "/global-search", label: "Global Search", icon: Search, group: "workspace" },

  // ── Communications ──────────────────────────────────────────
  // One category per channel so every WhatsApp surface sits together and the
  // other providers are grouped by their own features. Channel *connection*
  // and bot settings (Instagram, Email, SMS, …) live only under API
  // Configurations — never link /api-config/* from here.
  {
    to: "/whatsapp-templates",
    label: "Templates",
    icon: FileText,
    group: "communications",
    category: "WhatsApp",
    permission: "page.campaigns",
  },
  {
    to: "/whatsapp-templates/drafts",
    label: "Draft Templates",
    icon: FileText,
    group: "communications",
    category: "WhatsApp",
    permission: "page.campaigns",
  },
  {
    to: "/whatsapp-templates/create",
    label: "Create Meta Template",
    icon: Plus,
    group: "communications",
    category: "WhatsApp",
    permission: "page.campaigns",
  },
  {
    to: "/wa-chatbot",
    label: "WhatsApp Chatbot",
    icon: Bot,
    group: "communications",
    category: "WhatsApp",
  },
  {
    to: "/commerce/wa-catalog",
    label: "WhatsApp Catalog",
    icon: Store,
    group: "communications",
    category: "WhatsApp",
  },

  {
    to: "/messenger/send",
    label: "Send Message",
    icon: Send,
    group: "communications",
    category: "Messenger",
  },

  {
    to: "/telegram-sessions",
    label: "Telegram Sessions",
    icon: Send,
    group: "communications",
    category: "Telegram",
  },

  {
    to: "/livechat",
    label: "Live Chat",
    icon: MessageCircle,
    group: "communications",
    category: "Live Chat",
    exact: true,
  },
  {
    to: "/livechat/overview",
    label: "Overview",
    icon: LayoutGrid,
    group: "communications",
    category: "Live Chat",
  },
  {
    to: "/livechat/bots",
    label: "Live Chat Bots",
    icon: Bot,
    group: "communications",
    category: "Live Chat",
  },
  {
    to: "/livechat/widget-sdk",
    label: "Widget SDK",
    icon: Code2,
    group: "communications",
    category: "Live Chat",
  },

  {
    to: "/helpdesk",
    label: "Ticket Queue",
    icon: LifeBuoy,
    group: "communications",
    category: "Helpdesk",
    exact: true,
  },
  {
    to: "/helpdesk/manage",
    label: "Manage Tickets",
    icon: ListTree,
    group: "communications",
    category: "Helpdesk",
  },
  {
    to: "/helpdesk/organization",
    label: "Teams & Assignees",
    icon: Users,
    group: "communications",
    category: "Helpdesk",
  },
  {
    to: "/helpdesk/sla",
    label: "SLA Monitor",
    icon: Timer,
    group: "communications",
    category: "Helpdesk",
  },
  {
    to: "/helpdesk/sla-management",
    label: "SLA Setup",
    icon: Timer,
    group: "communications",
    category: "Helpdesk",
  },
  {
    to: "/helpdesk/macros",
    label: "Macros",
    icon: Zap,
    group: "communications",
    category: "Helpdesk",
  },
  {
    to: "/helpdesk/categories",
    label: "Categories",
    icon: Tags,
    group: "communications",
    category: "Helpdesk",
  },
  {
    to: "/helpdesk/csat",
    label: "Ticket CSAT",
    icon: Star,
    group: "communications",
    category: "Helpdesk",
  },
  {
    to: "/helpdesk/readiness",
    label: "Readiness",
    icon: ShieldCheck,
    group: "communications",
    category: "Helpdesk",
  },

  {
    to: "/satisfaction",
    label: "Surveys",
    icon: Smile,
    group: "communications",
    category: "CSAT & Feedback",
    exact: true,
  },
  {
    to: "/satisfaction/templates",
    label: "Survey Templates",
    icon: FileText,
    group: "communications",
    category: "CSAT & Feedback",
  },
  {
    to: "/satisfaction/automations",
    label: "Survey Automations",
    icon: Zap,
    group: "communications",
    category: "CSAT & Feedback",
  },
  {
    to: "/satisfaction/analytics",
    label: "Feedback Analytics",
    icon: BarChart3,
    group: "communications",
    category: "CSAT & Feedback",
  },
  {
    to: "/satisfaction/agents",
    label: "Agent Ratings",
    icon: Users,
    group: "communications",
    category: "CSAT & Feedback",
  },
  {
    to: "/satisfaction/departments",
    label: "Department Ratings",
    icon: Building2,
    group: "communications",
    category: "CSAT & Feedback",
  },

  // Pages found unlinked by the 2026-10-26 nav audit.
  {
    to: "/crm",
    label: "CRM Hub",
    icon: LayoutGrid,
    group: "crm",
    category: "Customers",
  },
  {
    to: "/identity",
    label: "Customer Identity",
    icon: Users,
    group: "crm",
    category: "Customers",
  },
  {
    to: "/marketing",
    label: "Marketing Overview",
    icon: LayoutGrid,
    group: "marketing",
    category: "Campaigns",
  },
  {
    to: "/settings/connected-apps",
    label: "Connected Apps",
    icon: Link2,
    group: "settings",
    category: "Security",
  },
  {
    to: "/developer-portal",
    label: "API Portal",
    icon: Globe,
    group: "settings",
    category: "Developer",
  },
  {
    to: "/developer/plugins",
    label: "My Plugins",
    icon: Package,
    group: "settings",
    category: "Developer",
  },

  // ── CRM & Sales ─────────────────────────────────────────────
  {
    to: "/leads",
    label: "Leads",
    icon: Target,
    group: "crm",
    category: "Customers",
    permission: "page.contacts",
  },
  {
    to: "/contacts",
    label: "Contacts",
    icon: Users,
    group: "crm",
    category: "Customers",
    shortcut: "G C",
    permission: "page.contacts",
  },
  {
    to: "/customers",
    label: "Customers",
    icon: Heart,
    group: "crm",
    category: "Customers",
    permission: "page.contacts",
  },
  {
    to: "/companies",
    label: "Companies",
    icon: Building2,
    group: "crm",
    category: "Customers",
    permission: "page.companies",
  },
  {
    to: "/vcards",
    label: "Digital Cards",
    icon: IdCard,
    group: "crm",
    category: "Customers",
    permission: "page.contacts",
  },

  {
    to: "/deals",
    label: "Deals",
    icon: Handshake,
    group: "crm",
    category: "Sales",
    permission: "page.deals",
  },
  {
    to: "/sales",
    label: "Sales",
    icon: TrendingUp,
    group: "crm",
    category: "Sales",
    permission: "page.deals",
  },
  {
    to: "/products",
    label: "Products",
    icon: Package,
    group: "crm",
    category: "Sales",
    permission: "page.deals",
  },
  {
    to: "/quotes",
    label: "Quotes",
    icon: FileText,
    group: "crm",
    category: "Sales",
    permission: "page.deals",
  },
  {
    to: "/invoices",
    label: "Invoices",
    icon: Receipt,
    group: "crm",
    category: "Sales",
    permission: "page.deals",
  },
  {
    to: "/activities",
    label: "Activities",
    icon: CalendarClock,
    group: "crm",
    category: "Sales",
    permission: "page.deals",
  },
  {
    to: "/booking",
    label: "Appointments",
    icon: CalendarClock,
    group: "crm",
    category: "Sales",
    permission: "page.deals",
  },
  {
    to: "/tasks",
    label: "CRM Tasks",
    icon: ListTodo,
    group: "crm",
    category: "Sales",
    permission: "page.contacts",
  },
  {
    to: "/sales-ai",
    label: "AI Sales Assistant",
    icon: Sparkles,
    group: "crm",
    category: "Sales",
    permission: "page.deals",
  },

  // Project work has its own workspace-scoped roles and task lifecycle.
  {
    to: "/projects",
    label: "Projects",
    icon: FolderKanban,
    group: "projects",
    exact: true,
  },
  {
    to: "/projects/tasks",
    label: "Project Tasks",
    icon: ListTodo,
    group: "projects",
    exact: true,
  },
  {
    to: "/projects/board",
    label: "Kanban Board",
    icon: Kanban,
    group: "projects",
    exact: true,
  },
  {
    to: "/projects/team",
    label: "Project Team",
    icon: UsersRound,
    group: "projects",
    exact: true,
  },

  { to: "/commerce", label: "Commerce", icon: ShoppingCart, group: "crm", category: "Commerce" },
  { to: "/commerce/orders", label: "Orders", icon: Receipt, group: "crm", category: "Commerce" },
  {
    to: "/commerce/inventory",
    label: "Inventory",
    icon: Boxes,
    group: "crm",
    category: "Commerce",
  },
  { to: "/commerce/brands", label: "Brands", icon: TagsIcon, group: "crm", category: "Commerce" },
  {
    to: "/commerce/promotions",
    label: "Promotions",
    icon: Sparkles,
    group: "crm",
    category: "Commerce",
  },
  {
    to: "/commerce/payment-links",
    label: "Payment Links",
    icon: Link2,
    group: "crm",
    category: "Commerce",
  },
  {
    to: "/commerce/shipping",
    label: "Shipping",
    icon: Package,
    group: "crm",
    category: "Commerce",
  },
  {
    to: "/commerce/integrations",
    label: "Store Integrations",
    icon: Plug,
    group: "crm",
    category: "Commerce",
  },

  // ── Marketing ───────────────────────────────────────────────
  {
    to: "/campaigns",
    label: "Campaigns",
    icon: Send,
    group: "marketing",
    category: "Campaigns",
    permission: "page.campaigns",
  },
  {
    to: "/campaigns/dashboard",
    label: "Campaign Dashboard",
    icon: BarChart3,
    group: "marketing",
    category: "Campaigns",
    permission: "page.campaigns",
  },
  {
    to: "/broadcasts",
    label: "Broadcasts",
    icon: Send,
    group: "marketing",
    category: "Campaigns",
    permission: "page.campaigns",
  },
  {
    to: "/campaign-templates",
    label: "Campaign Presets",
    icon: FileText,
    group: "marketing",
    category: "Campaigns",
    permission: "page.campaigns",
  },
  {
    to: "/drip",
    label: "Drip Sequences",
    icon: Zap,
    group: "marketing",
    category: "Campaigns",
    permission: "page.automations",
  },
  {
    to: "/scheduling",
    label: "Scheduling",
    icon: CalendarClock,
    group: "marketing",
    category: "Campaigns",
    permission: "page.campaigns",
  },

  {
    to: "/audience",
    label: "Audience",
    icon: UsersRound,
    group: "marketing",
    category: "Audience",
    permission: "page.campaigns",
  },
  {
    to: "/segments",
    label: "Segments",
    icon: UsersRound,
    group: "marketing",
    category: "Audience",
    permission: "page.campaigns",
  },
  {
    to: "/contact-lists",
    label: "Contact Lists",
    icon: UsersRound,
    group: "marketing",
    category: "Audience",
    permission: "page.campaigns",
  },
  {
    to: "/phonebook",
    label: "Phonebook",
    icon: BookUser,
    group: "marketing",
    category: "Audience",
    permission: "page.campaigns",
  },
  {
    to: "/consent",
    label: "Consent Center",
    icon: ShieldCheck,
    group: "marketing",
    category: "Audience",
    permission: "page.campaigns",
  },

  {
    to: "/ai-studio",
    label: "AI Studio",
    icon: Sparkles,
    group: "marketing",
    category: "Content & AI",
    shortcut: "G A",
    permission: "page.ai_studio",
  },
  {
    to: "/social",
    label: "Social Studio",
    icon: Share2,
    group: "marketing",
    category: "Social Studio",
    permission: "page.campaigns",
  },
  {
    to: "/social",
    label: "Scheduled Queue",
    icon: CalendarClock,
    group: "marketing",
    category: "Social Studio",
    hash: "scheduled",
    permission: "page.campaigns",
  },
  {
    to: "/social",
    label: "Approval Queue",
    icon: ShieldCheck,
    group: "marketing",
    category: "Social Studio",
    hash: "approvals",
    permission: "page.campaigns",
  },
  {
    to: "/social",
    label: "Post Performance",
    icon: BarChart3,
    group: "marketing",
    category: "Social Studio",
    hash: "performance",
    permission: "page.campaigns",
  },
  {
    to: "/social",
    label: "Post History & Library",
    icon: BookOpen,
    group: "marketing",
    category: "Social Studio",
    hash: "history",
    permission: "page.campaigns",
  },
  {
    to: "/social",
    label: "Social Channels",
    icon: Plug,
    group: "marketing",
    category: "Social Studio",
    hash: "channels",
    permission: "page.campaigns",
  },
  {
    to: "/knowledge",
    label: "Knowledge Base",
    icon: BookOpen,
    group: "marketing",
    category: "Content & AI",
  },

  // ── Automation & Bots ───────────────────────────────────────
  {
    to: "/automation-flows",
    label: "Automation Flows",
    icon: Workflow,
    group: "automation",
    permission: "page.automations",
  },
  {
    to: "/webhook-automation",
    label: "Webhook Automation",
    icon: Webhook,
    group: "automation",
    permission: "page.automations",
  },
  {
    to: "/automations",
    label: "Advanced Workflows",
    icon: Zap,
    group: "automation",
    permission: "page.automations",
  },
  {
    to: "/chatbots",
    label: "AI Chatbots",
    icon: Bot,
    group: "automation",
    permission: "page.ai_studio",
  },
  {
    to: "/chatbots/webhooks",
    label: "Chatbot Webhooks",
    icon: Webhook,
    group: "automation",
    permission: "page.ai_studio",
  },
  { to: "/widgets", label: "Chat Widgets", icon: Code2, group: "automation" },
  { to: "/omnichannel-ai", label: "Omnichannel AI", icon: Sparkles, group: "automation" },
  {
    to: "/billing-automation",
    label: "Billing Automation",
    icon: Bell,
    group: "automation",
    permission: "page.billing",
  },

  // ── Insights ────────────────────────────────────────────────
  {
    to: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    group: "insights",
    category: "Analytics",
    permission: "page.analytics",
  },
  {
    to: "/campaign-analytics",
    label: "Campaign Analytics",
    icon: BarChart3,
    group: "insights",
    category: "Analytics",
    permission: "page.analytics",
  },
  {
    to: "/ai-analytics",
    label: "AI Analytics",
    icon: Sparkles,
    group: "insights",
    category: "Analytics",
  },
  {
    to: "/omnichannel-analytics",
    label: "Omnichannel Analytics",
    icon: BarChart3,
    group: "insights",
    category: "Analytics",
    permission: "page.analytics",
  },
  {
    to: "/helpdesk/analytics",
    label: "Helpdesk Analytics",
    icon: BarChart3,
    group: "insights",
    category: "Analytics",
  },
  {
    to: "/livechat-analytics",
    label: "Live Chat Analytics",
    icon: BarChart3,
    group: "insights",
    category: "Analytics",
  },
  {
    to: "/commerce/analytics",
    label: "Commerce Analytics",
    icon: BarChart3,
    group: "insights",
    category: "Analytics",
  },
  {
    to: "/booking/analytics",
    label: "Booking Analytics",
    icon: BarChart3,
    group: "insights",
    category: "Analytics",
  },

  {
    to: "/reports",
    label: "Reports",
    icon: FileBarChart,
    group: "insights",
    category: "Reporting",
    permission: "page.reports",
  },
  {
    to: "/bi",
    label: "Business Intelligence",
    icon: BarChart3,
    group: "insights",
    category: "Reporting",
    permission: "page.reports",
  },
  {
    to: "/forecasting",
    label: "Forecasting",
    icon: TrendingUp,
    group: "insights",
    category: "Reporting",
    permission: "page.reports",
  },
  {
    to: "/monitoring",
    label: "Monitoring",
    icon: Activity,
    group: "insights",
    category: "Reporting",
  },
  {
    to: "/exports",
    label: "Export Center",
    icon: Download,
    group: "insights",
    category: "Reporting",
    permission: "page.reports",
  },

  // ── API Configurations — top-level parent ───────────────────
  {
    to: "/api-config",
    label: "API Configurations",
    icon: Settings,
    group: "api",
    permission: "page.settings",
  },

  // ── Settings ────────────────────────────────────────────────
  { to: "/profile", label: "My Profile", icon: UserCircle, group: "settings", category: "Account" },
  {
    to: "/notifications",
    label: "Notifications",
    icon: Bell,
    group: "settings",
    category: "Account",
  },
  {
    to: "/settings/sounds",
    label: "Notification sounds",
    icon: Volume2,
    group: "settings",
    category: "Account",
  },

  {
    to: "/organization",
    label: "Organization",
    icon: ShieldCheck,
    group: "settings",
    category: "Organization",
  },
  {
    to: "/settings/general",
    label: "Workspace",
    icon: Sliders,
    group: "settings",
    category: "Workspace",
  },
  {
    to: "/team",
    label: "Team",
    icon: UsersRound,
    group: "settings",
    category: "Workspace",
    permission: "page.team",
  },
  {
    to: "/invitations",
    label: "Invitations",
    icon: Mail,
    group: "settings",
    category: "Workspace",
    permission: "page.team",
  },
  {
    to: "/roles",
    label: "Roles & Permissions",
    icon: KeyRound,
    group: "settings",
    category: "Workspace",
    permission: "page.roles",
  },

  {
    to: "/security",
    label: "Security Center",
    icon: Shield,
    group: "settings",
    category: "Security",
  },
  {
    to: "/security-issues",
    label: "Security Issues",
    icon: ShieldAlert,
    group: "settings",
    category: "Security",
  },
  {
    to: "/compliance-center",
    label: "Compliance",
    icon: ShieldCheck,
    group: "settings",
    category: "Security",
  },
  {
    to: "/settings/data",
    label: "Data & Privacy",
    icon: Shield,
    group: "settings",
    category: "Security",
    permission: "page.settings",
  },
  {
    to: "/backup-management",
    label: "Backup",
    icon: Download,
    group: "settings",
    category: "Security",
  },

  {
    to: "/billing",
    label: "Plan & Billing",
    icon: CreditCard,
    group: "settings",
    category: "Organization",
    permission: "page.billing",
  },
  {
    to: "/portal",
    label: "Billing Portal",
    icon: CreditCard,
    group: "settings",
    category: "Organization",
    permission: "page.billing",
  },
  {
    to: "/billing-documents",
    label: "Billing Documents",
    icon: FileText,
    group: "settings",
    category: "Organization",
    permission: "page.billing",
  },
  {
    to: "/usage",
    label: "Usage & Metering",
    icon: Activity,
    group: "settings",
    category: "Organization",
    permission: "page.billing",
  },

  {
    to: "/settings/white-label",
    label: "Customization",
    icon: Palette,
    group: "settings",
    category: "Customization",
    permission: "page.settings",
  },
  {
    to: "/tags",
    label: "Tags & Segments",
    icon: Tag,
    group: "settings",
    category: "Customization",
    permission: "page.settings",
  },
  {
    to: "/custom-fields",
    label: "Custom Fields",
    icon: Sliders,
    group: "settings",
    category: "Customization",
    permission: "page.settings",
  },

  {
    to: "/marketplace/plugins",
    label: "Plugin Marketplace",
    icon: Store,
    group: "settings",
    category: "Extensions",
  },
  {
    to: "/integrations",
    label: "Integrations",
    icon: Link2,
    group: "settings",
    category: "Extensions",
  },
  {
    to: "/settings/plugin-management",
    label: "Plugin Management",
    icon: Wrench,
    group: "settings",
    category: "Extensions",
  },
  {
    to: "/developer",
    label: "Developer Center",
    icon: Code2,
    group: "settings",
    category: "Developer",
  },
  {
    to: "/developer/vendor-dashboard",
    label: "Vendor Dashboard",
    icon: BarChart3,
    group: "settings",
    category: "Developer",
  },
  {
    to: "/developer/webhooks",
    label: "Webhooks",
    icon: Zap,
    group: "settings",
    category: "Developer",
  },
  {
    to: "/developer/oauth",
    label: "OAuth Apps",
    icon: KeyRound,
    group: "settings",
    category: "Developer",
  },
  ...(SHOW_RESOURCE_LINKS
    ? [
        {
          to: docsUrl(),
          label: "Documentation",
          icon: BookOpen,
          group: "settings" as const,
          category: "Developer",
          external: true,
        },
      ]
    : []),

  { to: "/admin", label: "Super Admin", icon: ShieldCheck, group: "admin" },
];

export const NAV_GROUPS: {
  id: NavItem["group"];
  label: string;
  icon: typeof LayoutDashboard;
  flat?: boolean;
}[] = [
  // Inbox is a top-level entry, not nested under Workspace, so it is one click away.
  { id: "inbox", label: "Inbox", icon: MessagesSquare, flat: true },
  { id: "workspace", label: "Dashboard", icon: LayoutDashboard },
  { id: "communications", label: "Communications", icon: MessagesSquare },
  { id: "crm", label: "CRM & Sales", icon: Users },
  { id: "projects", label: "Project Management", icon: FolderKanban },
  { id: "marketing", label: "Marketing", icon: Send },
  { id: "automation", label: "Automation & Bots", icon: Workflow },
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "api", label: "API Configurations", icon: KeyRound },
  { id: "settings", label: "Settings", icon: Settings },
];

import type { NestedNavNode } from "./nested-nav-item";
import { API_CONFIG_SECTIONS } from "./settings/api-config-sections";

/**
 * Sub-items shown under the "API Configurations" sidebar group.
 * Each links to its own route: /api-config/<section>. Derived from the
 * shared section catalog so the sidebar and the page can never drift.
 */
const API_CONFIG_GROUPS: { label: string; sections: string[] }[] = [
  {
    label: "WhatsApp",
    sections: [
      "whatsapp",
      "wa-health",
      "wa-webhook",
      "wa-qr",
      "wa-devices",
      "wa-warmer",
      "wa-forms",
      "templates",
      "wa-rest",
      "wa-conversational",
      "wa-template-api",
      "wa-api-dashboard",
    ],
  },
  { label: "Messenger", sections: ["messenger", "messenger-bot"] },
  { label: "Instagram", sections: ["instagram", "instagram-bot", "instagram-comments"] },
  { label: "Social Inbox", sections: ["facebook-comments", "youtube", "linkedin"] },
  { label: "TikTok", sections: ["tiktok", "tiktok-dm", "tiktok-bot"] },
  { label: "Telegram", sections: ["telegram"] },
  { label: "Email & SMS", sections: ["email", "sms"] },
  { label: "Meta Platform", sections: ["meta-app"] },
  { label: "Platform", sections: ["ai", "sync", "provider", "api"] },
];

function sectionNode(id: string): NestedNavNode | null {
  const section = API_CONFIG_SECTIONS.find((s) => s.id === id);
  if (!section) return null;
  return { to: `/api-config/${section.id}`, label: section.label, icon: section.icon, exact: true };
}

/**
 * Sub-items shown under the "API Configurations" sidebar group, nested by
 * provider so every WhatsApp setting sits together and the other channels are
 * grouped by their own features. Sections missing from the map fall into
 * "Other", so the catalog and the sidebar can never drift.
 */
export const API_CONFIG_CHILDREN: NestedNavNode[] = (() => {
  const mapped = new Set(API_CONFIG_GROUPS.flatMap((g) => g.sections));
  const groups: NestedNavNode[] = API_CONFIG_GROUPS.map((g) => ({
    label: g.label,
    children: g.sections.map(sectionNode).filter((n): n is NestedNavNode => n !== null),
  })).filter((g) => (g.children?.length ?? 0) > 0);

  const rest = API_CONFIG_SECTIONS.filter((s) => !mapped.has(s.id)).map((s) => sectionNode(s.id)!);
  if (rest.length > 0) groups.push({ label: "Other", children: rest });
  return groups;
})();

/**
 * Sub-items shown under the "Account" sidebar group.
 * Every entry links to a dedicated /settings/* route — no hash deep links.
 */
export const ACCOUNT_CHILDREN: NestedNavNode[] = [
  { to: "/profile", label: "My Profile", icon: UserCircle },
  { to: "/organization", label: "Organization", icon: ShieldCheck },
  { to: "/settings/general", label: "Workspace", icon: Building2, permission: "page.team" },
  { to: "/settings/security", label: "Security", icon: Shield, permission: "page.roles" },
  { to: "/billing", label: "Plan & Billing", icon: CreditCard, permission: "page.billing" },
  { to: "/settings/birthdays", label: "Birthday reminders", icon: Heart },
  { to: "/settings/task-reminders", label: "Task reminders", icon: Bell },
  { to: "/settings/sounds", label: "Notification sounds", icon: Volume2 },
  { to: "/settings/notifications", label: "Notifications", icon: Bell },
];

/**
 * Filter Account children by the current user's effective permissions.
 * - Items without a `permission` are always visible (personal panels).
 * - While permissions are still loading, show everything to avoid a flash
 *   of an empty menu; the sidebar re-renders once the query settles.
 * - Super admins bypass all checks.
 */
export function filterAccountChildrenByPermission(
  children: NestedNavNode[],
  ctx: { can: (key: string) => boolean; isSuperAdmin: boolean; loading: boolean },
): NestedNavNode[] {
  return children.filter(
    (c) => !c.permission || ctx.loading || ctx.isSuperAdmin || ctx.can(c.permission),
  );
}

/**
 * Nested nav tree — optional companion to `NAV_ITEMS`. Consumers that want
 * a hierarchical rail (Settings → Team, Billing, API keys ) render this
 * tree via `<NestedNavItem>`. `NAV_ITEMS` remains the flat authority.
 */
export const NESTED_NAV: NestedNavNode[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inbox", label: "Inbox", icon: MessagesSquare },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/deals", label: "Deals", icon: Handshake },
  { to: "/campaigns", label: "Campaigns", icon: Send },
  { to: "/automations", label: "Automations", icon: Zap },
  { to: "/ai-studio", label: "AI Studio", icon: Sparkles },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/settings", label: "Settings", icon: Settings },
];

import { MessagesSquare as _MobileInbox } from "lucide-react";
import {
  Home as _MobileHome,
  User as _MobileMe,
  Search as _MobileSearch,
  Bell as _MobileBell,
} from "lucide-react";

/**
 * Default primary destinations for the mobile bottom nav. Cap at 5.
 */
export const MOBILE_BOTTOM_NAV = [
  { to: "/dashboard", label: "Home", icon: _MobileHome },
  { to: "/inbox", label: "Inbox", icon: _MobileInbox },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/profile", label: "Me", icon: _MobileMe },
];
