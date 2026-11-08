/**
 * Extension Registry — central in-memory store of typed contributions
 * (pages, menus, widgets, dashboard cards, reports, jobs, AI tools, etc.)
 * that plugins register through the Extension SDK.
 *
 * Everything is scoped by plugin slug so the Plugin Manager can revoke
 * all contributions when a plugin is disabled or uninstalled.
 */
import type { ComponentType, ReactNode } from 'react';

// ---------- Contribution types ----------

export type ExtensionRegion =
  | 'nav.primary' | 'nav.secondary' | 'nav.footer'
  | 'topbar.right' | 'topbar.left'
  | 'inbox.sidebar' | 'inbox.header' | 'inbox.message-actions'
  | 'contact.panel' | 'contact.tabs'
  | 'deal.panel' | 'deal.tabs'
  | 'ticket.panel' | 'ticket.tabs'
  | 'dashboard.top' | 'dashboard.grid' | 'dashboard.sidebar'
  | 'settings.section' | 'command.palette'
  | 'campaign.editor' | 'workflow.node-picker';

export type PageContribution = {
  id: string;
  path: string;               // absolute path segment, e.g. /apps/my-plugin
  title: string;
  icon?: ComponentType<{ className?: string }>;
  component: ComponentType;
  requiresAuth?: boolean;     // default true
  permissions?: string[];     // gates access with the host RBAC
};

export type MenuContribution = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  to?: string;
  onClick?: () => void;
  section?: 'primary' | 'secondary' | 'footer' | 'settings';
  order?: number;
  badge?: () => number | string | null;
  children?: MenuContribution[];
};

export type WidgetContribution = {
  id: string;
  region: ExtensionRegion;
  render: (props: { context: Record<string, unknown> }) => ReactNode;
  order?: number;
  when?: (context: Record<string, unknown>) => boolean;
};

export type DashboardCardContribution = {
  id: string;
  title: string;
  description?: string;
  render: () => ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  order?: number;
  refreshInterval?: number;   // ms
};

export type ReportContribution = {
  id: string;
  title: string;
  category?: string;
  description?: string;
  render: (props: { range: { from: Date; to: Date }; filters: Record<string, unknown> }) => ReactNode;
  defaultRange?: 'today' | '7d' | '30d' | '90d' | 'ytd';
};

/**
 * Declarative API endpoint contribution. Plugins expose HTTP-style handlers
 * consumed by the host router (e.g. /api/plugins/:slug/*) — the platform
 * handles auth, rate limits, and request validation.
 */
export type ApiEndpointContribution = {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;               // relative, e.g. /orders/:id
  handler: (req: PluginApiRequest) => Promise<PluginApiResponse> | PluginApiResponse;
  permissions?: string[];
  rateLimit?: { rpm: number };
};

export type PluginApiRequest = {
  method: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;
  headers: Record<string, string>;
  userId?: string;
  workspaceId?: string;
};

export type PluginApiResponse = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};

export type WorkflowActionContribution = {
  id: string;                 // e.g. "send-slack-notification"
  category?: string;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  inputs?: WorkflowFieldSchema[];
  outputs?: WorkflowFieldSchema[];
  run: (input: Record<string, unknown>, ctx: WorkflowRunContext) => Promise<Record<string, unknown>>;
};

export type WorkflowTriggerContribution = {
  id: string;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  event: string;              // event bus name to bind
  schema?: WorkflowFieldSchema[];
};

export type WorkflowFieldSchema = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'select' | 'contact' | 'deal';
  required?: boolean;
  options?: { value: string; label: string }[];
  default?: unknown;
  description?: string;
};

export type WorkflowRunContext = {
  workspaceId: string;
  userId?: string;
  runId: string;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
};

export type AiToolContribution = {
  id: string;                 // function name exposed to the LLM
  description: string;        // must be clear — the LLM chooses tools by this text
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>, ctx: AiToolContext) => Promise<unknown>;
  requiresPermissions?: string[];
};

export type AiToolContext = {
  workspaceId: string;
  userId?: string;
  conversationId?: string;
  logger: WorkflowRunContext['logger'];
};

export type IntegrationContribution = {
  id: string;
  name: string;
  description?: string;
  category?: 'crm' | 'messaging' | 'commerce' | 'analytics' | 'ai' | 'payments' | 'other';
  logoUrl?: string;
  auth: IntegrationAuth;
  actions?: string[];         // human-readable action names
  events?: string[];          // events this integration can emit
  configure?: () => ReactNode;
  onConnect?: (credentials: Record<string, string>) => Promise<void>;
  onDisconnect?: () => Promise<void>;
};

export type IntegrationAuth =
  | { type: 'oauth2'; authorizeUrl: string; tokenUrl: string; scopes: string[] }
  | { type: 'apikey'; fields: { key: string; label: string; secret?: boolean }[] }
  | { type: 'basic' }
  | { type: 'none' };

/**
 * Declarative table contribution. The platform provisions these on install
 * (schema migration) and enforces RLS as declared. The plugin never runs
 * raw DDL at runtime.
 */
export type TableContribution = {
  name: string;               // will be prefixed by plugin slug
  columns: TableColumn[];
  indexes?: { columns: string[]; unique?: boolean }[];
  rls: {
    read?: 'owner' | 'workspace' | 'public' | 'admin';
    write?: 'owner' | 'workspace' | 'admin';
  };
};

export type TableColumn = {
  name: string;
  type: 'text' | 'integer' | 'bigint' | 'numeric' | 'boolean' | 'uuid' | 'jsonb' | 'timestamptz' | 'date';
  nullable?: boolean;
  default?: string;
  references?: { table: string; column?: string; onDelete?: 'cascade' | 'set null' | 'restrict' };
};

export type BackgroundJobContribution = {
  id: string;
  label: string;
  schedule?: string;          // cron or ISO interval
  runOnce?: boolean;
  handler: (ctx: JobRunContext) => Promise<void>;
  concurrency?: number;
  timeoutMs?: number;
  retry?: { attempts: number; backoffMs: number };
};

export type JobRunContext = {
  jobId: string;
  workspaceId: string;
  logger: WorkflowRunContext['logger'];
  signal: AbortSignal;
};

export type EventContribution = {
  name: string;               // e.g. "myplugin.thing.happened"
  description?: string;
  payloadSchema?: Record<string, unknown>;
};

export type ComponentInjectionContribution = {
  id: string;
  region: ExtensionRegion;
  component: ComponentType<Record<string, unknown>>;
  order?: number;
};

// ---------- Registry ----------

type Owned<T> = T & { pluginSlug: string };

class ExtensionRegistry {
  private pages = new Map<string, Owned<PageContribution>>();
  private menus = new Map<string, Owned<MenuContribution>>();
  private widgets = new Map<string, Owned<WidgetContribution>>();
  private cards = new Map<string, Owned<DashboardCardContribution>>();
  private reports = new Map<string, Owned<ReportContribution>>();
  private apis = new Map<string, Owned<ApiEndpointContribution>>();
  private actions = new Map<string, Owned<WorkflowActionContribution>>();
  private triggers = new Map<string, Owned<WorkflowTriggerContribution>>();
  private aiTools = new Map<string, Owned<AiToolContribution>>();
  private integrations = new Map<string, Owned<IntegrationContribution>>();
  private tables = new Map<string, Owned<TableContribution>>();
  private jobs = new Map<string, Owned<BackgroundJobContribution>>();
  private events = new Map<string, Owned<EventContribution>>();
  private injections = new Map<string, Owned<ComponentInjectionContribution>>();

  private listeners = new Set<() => void>();

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private notify() { for (const l of this.listeners) try { l(); } catch { /* ignore */ } }

  private add<T>(map: Map<string, Owned<T>>, key: string, slug: string, value: T) {
    map.set(`${slug}::${key}`, { ...(value as any), pluginSlug: slug });
    this.notify();
  }

  registerPage(slug: string, c: PageContribution) { this.add(this.pages, c.id, slug, c); }
  registerMenu(slug: string, c: MenuContribution) { this.add(this.menus, c.id, slug, c); }
  registerWidget(slug: string, c: WidgetContribution) { this.add(this.widgets, c.id, slug, c); }
  registerDashboardCard(slug: string, c: DashboardCardContribution) { this.add(this.cards, c.id, slug, c); }
  registerReport(slug: string, c: ReportContribution) { this.add(this.reports, c.id, slug, c); }
  registerApiEndpoint(slug: string, c: ApiEndpointContribution) { this.add(this.apis, `${c.method}:${c.path}`, slug, c); }
  registerWorkflowAction(slug: string, c: WorkflowActionContribution) { this.add(this.actions, c.id, slug, c); }
  registerWorkflowTrigger(slug: string, c: WorkflowTriggerContribution) { this.add(this.triggers, c.id, slug, c); }
  registerAiTool(slug: string, c: AiToolContribution) { this.add(this.aiTools, c.id, slug, c); }
  registerIntegration(slug: string, c: IntegrationContribution) { this.add(this.integrations, c.id, slug, c); }
  registerTable(slug: string, c: TableContribution) { this.add(this.tables, c.name, slug, c); }
  registerJob(slug: string, c: BackgroundJobContribution) { this.add(this.jobs, c.id, slug, c); }
  registerEvent(slug: string, c: EventContribution) { this.add(this.events, c.name, slug, c); }
  registerInjection(slug: string, c: ComponentInjectionContribution) { this.add(this.injections, `${c.region}:${c.id}`, slug, c); }

  // Queries used by the host UI
  listPages() { return [...this.pages.values()]; }
  listMenus() { return [...this.menus.values()]; }
  listWidgetsIn(region: ExtensionRegion) {
    return [...this.widgets.values()].filter((w) => w.region === region).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  listDashboardCards() {
    return [...this.cards.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  listReports() { return [...this.reports.values()]; }
  listApiEndpoints() { return [...this.apis.values()]; }
  listWorkflowActions() { return [...this.actions.values()]; }
  listWorkflowTriggers() { return [...this.triggers.values()]; }
  listAiTools() { return [...this.aiTools.values()]; }
  listIntegrations() { return [...this.integrations.values()]; }
  listTables() { return [...this.tables.values()]; }
  listJobs() { return [...this.jobs.values()]; }
  listEvents() { return [...this.events.values()]; }
  listInjectionsIn(region: ExtensionRegion) {
    return [...this.injections.values()].filter((i) => i.region === region).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  findApiEndpoint(method: string, path: string) {
    return [...this.apis.values()].find((e) => e.method === method.toUpperCase() && matchPath(e.path, path));
  }
  findAiTool(id: string) { return [...this.aiTools.values()].find((t) => t.id === id); }
  findWorkflowAction(id: string) { return [...this.actions.values()].find((a) => a.id === id); }

  /** Revoke every contribution owned by a plugin (called on disable/uninstall). */
  revoke(slug: string) {
    for (const map of [this.pages, this.menus, this.widgets, this.cards, this.reports, this.apis, this.actions, this.triggers, this.aiTools, this.integrations, this.tables, this.jobs, this.events, this.injections]) {
      for (const [k, v] of map) if ((v as Owned<unknown>).pluginSlug === slug) map.delete(k);
    }
    this.notify();
  }

  stats() {
    return {
      pages: this.pages.size, menus: this.menus.size, widgets: this.widgets.size,
      dashboardCards: this.cards.size, reports: this.reports.size, apiEndpoints: this.apis.size,
      workflowActions: this.actions.size, workflowTriggers: this.triggers.size,
      aiTools: this.aiTools.size, integrations: this.integrations.size, tables: this.tables.size,
      jobs: this.jobs.size, events: this.events.size, injections: this.injections.size,
    };
  }
}

function matchPath(pattern: string, actual: string): boolean {
  const pp = pattern.split('/').filter(Boolean);
  const ap = actual.split('/').filter(Boolean);
  if (pp.length !== ap.length) return false;
  return pp.every((seg, i) => seg.startsWith(':') || seg === ap[i]);
}

export const extensionRegistry = new ExtensionRegistry();
