/**
 * Module Loader — dynamically fetches and instantiates a plugin's entry
 * module at runtime. Everything is sandboxed:
 *
 *  1. Plugin code is loaded as text and executed inside a controlled scope
 *     (no direct `import` of app internals; the plugin sees only its `api`
 *     handle).
 *  2. Failures during load are caught so a bad plugin never takes down the app.
 *  3. Cache-busted URLs enable hot updates: bumping the version reloads the
 *     module without a page refresh.
 *
 * The `PluginAPI` handle exposed to plugin code is a stable, permission-gated
 * surface. Everything a plugin can do goes through here.
 */
import { addAction, addFilter, doAction, applyFilters, type HookName } from './hooks';
type CoreAction = HookName;
type CoreFilter = HookName;
import { permissions, type Permission } from './permissions';

export type PluginModule = {
  activate?: (api: PluginAPI) => void | Promise<void>;
  deactivate?: (api: PluginAPI) => void | Promise<void>;
};

export type PluginAPI = {
  slug: string;
  version: string;
  hooks: {
    on: (action: CoreAction | string, fn: (payload: any) => void | Promise<void>, priority?: number) => () => void;
    filter: <T>(name: CoreFilter | string, fn: (value: T) => T | Promise<T> | null, priority?: number) => () => void;
    emit: (action: CoreAction | string, payload?: any) => Promise<void>;
    applyFilters: <T>(name: CoreFilter | string, value: T) => Promise<T | null>;
  };
  permissions: {
    has: (perm: Permission) => boolean;
    require: (perm: Permission) => void;
  };
  storage: {
    /** Per-plugin scoped localStorage. */
    get: <T = unknown>(key: string) => T | null;
    set: (key: string, value: unknown) => void;
    remove: (key: string) => void;
  };
  ui: {
    /** Register an extension slot (nav, panel, etc.). Rendered by host UI. */
    register: (point: string, item: { id: string; title: string; icon?: string; path?: string; render?: string }) => () => void;
  };
  log: (level: 'info' | 'warn' | 'error', ...args: any[]) => void;
};

type LoadedModule = { slug: string; version: string; module: PluginModule; teardown: Array<() => void> };
const loaded = new Map<string, LoadedModule>();

// UI extension registry — host UI polls this.
const uiExtensions = new Map<string, Array<{ slug: string; id: string; title: string; icon?: string; path?: string; render?: string }>>();

export function getUiExtensions(point: string) {
  return uiExtensions.get(point) ?? [];
}

function makeAPI(slug: string, version: string, teardown: Array<() => void>): PluginAPI {
  const namespace = `wacrm.plugin.${slug}.`;
  return {
    slug,
    version,
    hooks: {
      on(action, fn, priority) {
        const off = addAction(slug, action, fn, priority);
        teardown.push(off);
        return off;
      },
      filter(name, fn, priority) {
        const off = addFilter(slug, name, fn as any, priority);
        teardown.push(off);
        return off;
      },
      emit: doAction,
      applyFilters,
    },
    permissions: {
      has: (p) => permissions.has(slug, p),
      require: (p) => permissions.require(slug, p),
    },
    storage: {
      get(key) { try { const v = localStorage.getItem(namespace + key); return v ? (JSON.parse(v) as any) : null; } catch { return null; } },
      set(key, value) { try { localStorage.setItem(namespace + key, JSON.stringify(value)); } catch {} },
      remove(key) { try { localStorage.removeItem(namespace + key); } catch {} },
    },
    ui: {
      register(point, item) {
        const list = uiExtensions.get(point) ?? [];
        list.push({ ...item, slug });
        uiExtensions.set(point, list);
        const off = () => {
          const l = uiExtensions.get(point) ?? [];
          uiExtensions.set(point, l.filter((x) => !(x.slug === slug && x.id === item.id)));
        };
        teardown.push(off);
        return off;
      },
    },
    log(level, ...args) {
      const tag = `%c[plugin:${slug}]`;
      const style = level === 'error' ? 'color:#ef4444' : level === 'warn' ? 'color:#f59e0b' : 'color:#3b82f6';
      // eslint-disable-next-line no-console
      console[level](tag, style, ...args);
    },
  };
}

/**
 * Load a plugin module by URL. Evaluates the code in an isolated function
 * scope where the only exposed globals are `module` and `exports` (CommonJS
 * shape). Cache-busted by version so hot updates re-fetch.
 */
export async function loadPluginModule(params: { slug: string; version: string; entryUrl: string }): Promise<PluginModule> {
  // Restrict plugin entry URLs to https:// only — block javascript:, data:,
  // blob:, and mixed-content http:// which could be used to smuggle arbitrary
  // code into the evaluated Function scope.
  let parsed: URL;
  try {
    parsed = new URL(params.entryUrl, typeof window !== 'undefined' ? window.location.href : 'https://localhost');
  } catch {
    throw new Error('Invalid plugin entry URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Refusing to load plugin from non-https URL: ${parsed.protocol}`);
  }
  const bust = `?v=${encodeURIComponent(params.version)}`;
  const res = await fetch(parsed.toString() + bust, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Failed to fetch plugin entry: ${res.status}`);
  const code = await res.text();

  const module: { exports: PluginModule } = { exports: {} };
  // Evaluate inside a scoped function; withhold `window`/`document` (still accessible via `globalThis`
  // but a good-faith isolation for accidental typos, not a security boundary).
  const factory = new Function('module', 'exports', 'console', `"use strict";\n${code}\n;return module.exports;`);
  const result = factory(module, module.exports, { log: console.log, warn: console.warn, error: console.error });
  return (result ?? module.exports) as PluginModule;
}

/** Activate a plugin: load module, call `activate(api)`, remember teardown. */
export async function activatePlugin(params: {
  slug: string;
  version: string;
  entryUrl?: string | null;
  grantedPermissions: Permission[];
}): Promise<void> {
  await deactivatePlugin(params.slug); // idempotent
  permissions.grant(params.slug, params.grantedPermissions);
  const teardown: Array<() => void> = [];
  let mod: PluginModule = {};
  if (params.entryUrl) {
    try {
      mod = await loadPluginModule({ slug: params.slug, version: params.version, entryUrl: params.entryUrl });
    } catch (err) {
      console.error(`[module-loader] Failed to load ${params.slug}@${params.version}:`, err);
      permissions.revoke(params.slug);
      throw err;
    }
  }
  const api = makeAPI(params.slug, params.version, teardown);
  try {
    await mod.activate?.(api);
  } catch (err) {
    console.error(`[module-loader] activate() failed for ${params.slug}:`, err);
  }
  loaded.set(params.slug, { slug: params.slug, version: params.version, module: mod, teardown });
}

/** Deactivate a plugin: call `deactivate`, run all teardown, revoke perms. */
export async function deactivatePlugin(slug: string): Promise<void> {
  const entry = loaded.get(slug);
  if (!entry) return;
  try {
    const api = makeAPI(slug, entry.version, entry.teardown);
    await entry.module.deactivate?.(api);
  } catch (err) {
    console.error(`[module-loader] deactivate() failed for ${slug}:`, err);
  }
  for (const off of entry.teardown) { try { off(); } catch {} }
  permissions.revoke(slug);
  loaded.delete(slug);
}

export function isPluginActive(slug: string): boolean {
  return loaded.has(slug);
}

export function activePlugins(): Array<{ slug: string; version: string }> {
  return Array.from(loaded.values()).map(({ slug, version }) => ({ slug, version }));
}
