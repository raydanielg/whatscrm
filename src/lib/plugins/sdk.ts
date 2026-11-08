/**
 * Extension SDK — client-side plugin runtime.
 *
 * Plugins register into a typed event bus + extension-point registry.
 * They cannot import app source or mutate globals directly — everything
 * flows through this module. Permissions are declared in the manifest and
 * granted at install time; the SDK enforces them at call time.
 */

export type PluginPermission =
  | 'read:contacts' | 'write:contacts'
  | 'read:conversations' | 'write:conversations'
  | 'read:deals' | 'write:deals'
  | 'read:tickets' | 'write:tickets'
  | 'read:campaigns' | 'write:campaigns'
  | 'read:analytics'
  | 'ui:nav' | 'ui:inbox-sidebar' | 'ui:contact-panel' | 'ui:deal-panel' | 'ui:settings'
  | 'webhook:outbound'
  | 'ai:chat';

export type ExtensionPoint =
  | 'nav.item'
  | 'inbox.sidebar'
  | 'contact.panel'
  | 'deal.panel'
  | 'ticket.panel'
  | 'settings.section'
  | 'command.palette';

export type PluginManifest = {
  slug: string;
  name: string;
  version: string;
  entry?: string;
  permissions: PluginPermission[];
  extensionPoints?: Partial<Record<ExtensionPoint, ExtensionRegistration[]>>;
  hooks?: Partial<Record<HookName, string>>; // event name → callback id
};

export type ExtensionRegistration = {
  id: string;
  title: string;
  icon?: string;
  path?: string;   // where to navigate (deep link)
  render?: string; // named renderer id — resolved by host UI
};

export type HookName =
  | 'conversation.created' | 'conversation.assigned' | 'message.sent'
  | 'contact.created' | 'contact.updated'
  | 'deal.created' | 'deal.stage_changed' | 'deal.won' | 'deal.lost'
  | 'ticket.created' | 'ticket.resolved'
  | 'workflow.step';

type HookHandler = (payload: unknown) => void | Promise<void>;

class PluginRegistry {
  private manifests = new Map<string, PluginManifest>();
  private grants = new Map<string, Set<PluginPermission>>();
  private extensions = new Map<ExtensionPoint, Array<ExtensionRegistration & { pluginSlug: string }>>();
  private hooks = new Map<HookName, Array<{ pluginSlug: string; fn: HookHandler }>>();

  register(manifest: PluginManifest, grantedPermissions: PluginPermission[]) {
    this.manifests.set(manifest.slug, manifest);
    this.grants.set(manifest.slug, new Set(grantedPermissions));
    for (const [point, items] of Object.entries(manifest.extensionPoints ?? {})) {
      for (const item of items ?? []) {
        const list = this.extensions.get(point as ExtensionPoint) ?? [];
        list.push({ ...item, pluginSlug: manifest.slug });
        this.extensions.set(point as ExtensionPoint, list);
      }
    }
  }

  onHook(pluginSlug: string, name: HookName, fn: HookHandler) {
    const list = this.hooks.get(name) ?? [];
    list.push({ pluginSlug, fn });
    this.hooks.set(name, list);
  }

  async emit(name: HookName, payload: unknown) {
    const list = this.hooks.get(name);
    if (!list?.length) return;
    await Promise.allSettled(list.map((h) => Promise.resolve(h.fn(payload))));
  }

  extensionsFor(point: ExtensionPoint) {
    return this.extensions.get(point) ?? [];
  }

  hasPermission(slug: string, perm: PluginPermission): boolean {
    return this.grants.get(slug)?.has(perm) ?? false;
  }

  requirePermission(slug: string, perm: PluginPermission) {
    if (!this.hasPermission(slug, perm)) {
      throw new Error(`[plugin ${slug}] missing permission: ${perm}`);
    }
  }

  unregister(slug: string) {
    this.manifests.delete(slug);
    this.grants.delete(slug);
    for (const [k, list] of this.extensions)
      this.extensions.set(k, list.filter((e) => e.pluginSlug !== slug));
    for (const [k, list] of this.hooks)
      this.hooks.set(k, list.filter((e) => e.pluginSlug !== slug));
  }

  list() {
    return Array.from(this.manifests.values());
  }
}

export const plugins = new PluginRegistry();

/** Global bus — host code emits from key actions; plugins subscribe via hooks. */
export async function emitPluginEvent(name: HookName, payload: unknown) {
  await plugins.emit(name, payload);
}
