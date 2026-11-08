/**
 * Extension SDK — clean, high-level developer API.
 *
 * A plugin's entry file calls `definePlugin({ slug, setup })` and receives a
 * fully-typed `ExtensionContext` with builder methods for every extension
 * surface: pages, menus, widgets, cards, reports, APIs, workflows, AI tools,
 * integrations, tables, jobs, events, hooks, and inline injections.
 *
 * Registrations are scoped to the plugin slug — the Plugin Manager revokes
 * everything atomically on disable/uninstall.
 */
import type { ComponentType, ReactNode } from 'react';
import { extensionRegistry } from './extension-registry';
import type {
  AiToolContribution, ApiEndpointContribution, BackgroundJobContribution,
  ComponentInjectionContribution, DashboardCardContribution, EventContribution,
  ExtensionRegion, IntegrationContribution, MenuContribution, PageContribution,
  ReportContribution, TableContribution, WidgetContribution,
  WorkflowActionContribution, WorkflowTriggerContribution,
} from './extension-registry';
import { addAction, addFilter, doAction, applyFilters, addMiddleware, addBeforeAction, addAfterAction, doActionAround, runAround, type HookName } from './hooks';
import type { Middleware } from './event-bus';
type CoreAction = HookName;
type CoreFilter = HookName;
import { eventBus } from './event-bus';
import { permissions as permissionManager } from './permissions';
import type { PluginPermission } from './sdk';

// ---------- Public types ----------

export interface DefinePluginOptions {
  slug: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  permissions?: PluginPermission[];
  setup: (ctx: ExtensionContext) => void | Promise<void>;
  teardown?: () => void | Promise<void>;
}

export interface ExtensionContext {
  readonly slug: string;
  readonly name: string;
  readonly version: string;

  /** Storage tied to the plugin — persisted client-side, mirrored to the server. */
  storage: PluginStorage;

  /** Logger scoped to the plugin. */
  logger: PluginLogger;

  /** Show toast/notification through host UI. */
  notify: (opts: { title: string; description?: string; variant?: 'default' | 'success' | 'error' | 'warning' }) => void;

  /** Ask the host for the current auth context. */
  getUser: () => { userId: string; workspaceId: string; role: string } | null;

  /** Builder namespaces. */
  pages: PageBuilder;
  menus: MenuBuilder;
  widgets: WidgetBuilder;
  dashboard: DashboardBuilder;
  reports: ReportBuilder;
  api: ApiBuilder;
  workflows: WorkflowBuilder;
  ai: AiBuilder;
  integrations: IntegrationBuilder;
  db: DatabaseBuilder;
  jobs: JobBuilder;
  events: EventBuilder;
  hooks: HookBuilder;
  ui: UiInjectionBuilder;

  /** Assertions. */
  requirePermission: (p: PluginPermission) => void;
}

// ---------- Builder shapes ----------

interface PageBuilder {
  register(page: PageContribution): void;
}
interface MenuBuilder {
  register(menu: MenuContribution): void;
}
interface WidgetBuilder {
  register(widget: WidgetContribution): void;
}
interface DashboardBuilder {
  addCard(card: DashboardCardContribution): void;
}
interface ReportBuilder {
  register(report: ReportContribution): void;
}
interface ApiBuilder {
  get(path: string, handler: ApiEndpointContribution['handler'], opts?: Partial<Omit<ApiEndpointContribution, 'id' | 'method' | 'path' | 'handler'>>): void;
  post(path: string, handler: ApiEndpointContribution['handler'], opts?: Partial<Omit<ApiEndpointContribution, 'id' | 'method' | 'path' | 'handler'>>): void;
  put(path: string, handler: ApiEndpointContribution['handler'], opts?: Partial<Omit<ApiEndpointContribution, 'id' | 'method' | 'path' | 'handler'>>): void;
  patch(path: string, handler: ApiEndpointContribution['handler'], opts?: Partial<Omit<ApiEndpointContribution, 'id' | 'method' | 'path' | 'handler'>>): void;
  delete(path: string, handler: ApiEndpointContribution['handler'], opts?: Partial<Omit<ApiEndpointContribution, 'id' | 'method' | 'path' | 'handler'>>): void;
}
interface WorkflowBuilder {
  action(action: WorkflowActionContribution): void;
  trigger(trigger: WorkflowTriggerContribution): void;
}
interface AiBuilder {
  tool(tool: AiToolContribution): void;
}
interface IntegrationBuilder {
  register(integration: IntegrationContribution): void;
}
interface DatabaseBuilder {
  table(def: TableContribution): void;
}
interface JobBuilder {
  register(job: BackgroundJobContribution): void;
}
interface EventBuilder {
  define(event: EventContribution): void;
  emit(name: string, payload: unknown): Promise<void>;
}
interface HookBuilder {
  onAction(name: HookName, fn: (payload: unknown) => void | Promise<void>, priority?: number): void;
  onBefore(name: HookName, fn: (payload: unknown) => void | Promise<void>, priority?: number): void;
  onAfter(name: HookName, fn: (payload: unknown) => void | Promise<void>, priority?: number): void;
  addFilter<T = unknown>(name: HookName, fn: (value: T) => T | Promise<T> | null, priority?: number): void;
  addMiddleware<C = unknown>(name: HookName, fn: Middleware<C>, priority?: number): void;
  doAction(name: HookName, payload?: unknown): Promise<void>;
  doActionAround<T>(name: HookName, payload: T, core: (v: T) => Promise<void> | void): Promise<T | null>;
  applyFilters<T = unknown>(name: HookName, value: T): Promise<T | null>;
  runAround<C>(name: HookName, ctx: C, core: () => Promise<void> | void): Promise<C>;
}
interface UiInjectionBuilder {
  inject(injection: ComponentInjectionContribution): void;
  injectAt(region: ExtensionRegion, component: ComponentType<Record<string, unknown>>, opts?: { id?: string; order?: number }): void;
}

// ---------- Helpers ----------

export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface PluginLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

function createStorage(slug: string): PluginStorage {
  const prefix = `plugin:${slug}:`;
  return {
    async get(key) {
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(prefix + key) : null;
        return raw ? (JSON.parse(raw) as never) : null;
      } catch { return null; }
    },
    async set(key, value) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch { /* quota / private mode */ }
    },
    async remove(key) {
      try { if (typeof localStorage !== 'undefined') localStorage.removeItem(prefix + key); } catch { /* ignore */ }
    },
    async keys() {
      try {
        if (typeof localStorage === 'undefined') return [];
        const out: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(prefix)) out.push(k.slice(prefix.length));
        }
        return out;
      } catch { return []; }
    },
  };
}

function createLogger(slug: string): PluginLogger {
  const tag = `[plugin:${slug}]`;
  const push = (level: string, message: string, meta?: unknown) => {
    // eslint-disable-next-line no-console
    (console[level as 'log'] ?? console.log)(tag, message, meta ?? '');
  };
  return {
    info: (m, meta) => push('log', m, meta),
    warn: (m, meta) => push('warn', m, meta),
    error: (m, meta) => push('error', m, meta),
    debug: (m, meta) => push('debug', m, meta),
  };
}

// ---------- Public entrypoint ----------

/**
 * Define and register a plugin.
 *
 *   export default definePlugin({
 *     slug: 'acme-crm',
 *     name: 'Acme CRM',
 *     version: '1.0.0',
 *     permissions: ['read:contacts'],
 *     setup(ctx) {
 *       ctx.pages.register({ id: 'home', path: '/apps/acme', title: 'Acme', component: Home });
 *       ctx.menus.register({ id: 'acme', label: 'Acme', to: '/apps/acme', section: 'primary' });
 *       ctx.dashboard.addCard({ id: 'stats', title: 'Acme Stats', render: () => <Stats /> });
 *       ctx.hooks.onAction('conversation.created', (c) => ctx.logger.info('new conv', c));
 *     },
 *   });
 */
export function definePlugin(options: DefinePluginOptions) {
  const { slug, name, version, setup, teardown } = options;

  const notify = (opts: Parameters<ExtensionContext['notify']>[0]) => {
    // toast facade — resolved by host at runtime
    const w = globalThis as unknown as { __wacrm_toast?: (o: unknown) => void };
    w.__wacrm_toast?.(opts);
  };
  const getUser: ExtensionContext['getUser'] = () => {
    const w = globalThis as unknown as { __wacrm_auth?: () => { userId: string; workspaceId: string; role: string } | null };
    return w.__wacrm_auth?.() ?? null;
  };

  const ctx: ExtensionContext = {
    slug, name, version,
    storage: createStorage(slug),
    logger: createLogger(slug),
    notify,
    getUser,

    pages: {
      register: (p) => extensionRegistry.registerPage(slug, p),
    },
    menus: {
      register: (m) => extensionRegistry.registerMenu(slug, m),
    },
    widgets: {
      register: (w) => extensionRegistry.registerWidget(slug, w),
    },
    dashboard: {
      addCard: (c) => extensionRegistry.registerDashboardCard(slug, c),
    },
    reports: {
      register: (r) => extensionRegistry.registerReport(slug, r),
    },
    api: {
      get: (path, handler, opts) => extensionRegistry.registerApiEndpoint(slug, { id: `GET:${path}`, method: 'GET', path, handler, ...opts }),
      post: (path, handler, opts) => extensionRegistry.registerApiEndpoint(slug, { id: `POST:${path}`, method: 'POST', path, handler, ...opts }),
      put: (path, handler, opts) => extensionRegistry.registerApiEndpoint(slug, { id: `PUT:${path}`, method: 'PUT', path, handler, ...opts }),
      patch: (path, handler, opts) => extensionRegistry.registerApiEndpoint(slug, { id: `PATCH:${path}`, method: 'PATCH', path, handler, ...opts }),
      delete: (path, handler, opts) => extensionRegistry.registerApiEndpoint(slug, { id: `DELETE:${path}`, method: 'DELETE', path, handler, ...opts }),
    },
    workflows: {
      action: (a) => extensionRegistry.registerWorkflowAction(slug, a),
      trigger: (t) => extensionRegistry.registerWorkflowTrigger(slug, t),
    },
    ai: {
      tool: (t) => extensionRegistry.registerAiTool(slug, t),
    },
    integrations: {
      register: (i) => extensionRegistry.registerIntegration(slug, i),
    },
    db: {
      table: (t) => extensionRegistry.registerTable(slug, t),
    },
    jobs: {
      register: (j) => extensionRegistry.registerJob(slug, j),
    },
    events: {
      define: (e) => extensionRegistry.registerEvent(slug, e),
      emit: (n, p) => eventBus.emit(n, p),
    },
    hooks: {
      onAction: (n, fn, priority) => addAction(slug, n, fn, priority),
      onBefore: (n, fn, priority) => addBeforeAction(slug, n, fn, priority),
      onAfter: (n, fn, priority) => addAfterAction(slug, n, fn, priority),
      addFilter: (n, fn, priority) => addFilter(slug, n, fn as (v: unknown) => unknown, priority),
      addMiddleware: (n, fn, priority) => addMiddleware(slug, n, fn as Middleware<unknown>, priority),
      doAction,
      doActionAround,
      applyFilters,
      runAround,
    },
    ui: {
      inject: (i) => extensionRegistry.registerInjection(slug, i),
      injectAt: (region, component, opts) =>
        extensionRegistry.registerInjection(slug, { id: opts?.id ?? component.displayName ?? region, region, component, order: opts?.order }),
    },

    requirePermission: (p) => {
      if (!permissionManager.has(slug, p as never)) {
        throw new Error(`[plugin:${slug}] missing permission: ${p}`);
      }
    },
  };

  // Return an initializer the Plugin Manager can invoke after granting perms.
  return {
    slug, name, version,
    init: async () => { await setup(ctx); },
    teardown: async () => {
      if (teardown) await teardown();
      extensionRegistry.revoke(slug);
      eventBus.revokePlugin(slug);
    },
    context: ctx,
  };
}

export type DefinedPlugin = ReturnType<typeof definePlugin>;

/** Utility: render children as ReactNode. Re-exported for plugin authors. */
export type { ReactNode };
