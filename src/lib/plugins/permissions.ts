/**
 * Permission Manager — canonical permission list + runtime enforcement.
 * A plugin can only touch platform surfaces its installation grants explicitly.
 */

export const ALL_PERMISSIONS = [
  // Read/write scopes per resource
  'read:contacts', 'write:contacts',
  'read:conversations', 'write:conversations',
  'read:deals', 'write:deals',
  'read:tickets', 'write:tickets',
  'read:campaigns', 'write:campaigns',
  'read:analytics',
  'read:workspace', 'write:workspace',
  // UI extension points
  'ui:nav', 'ui:inbox-sidebar', 'ui:contact-panel',
  'ui:deal-panel', 'ui:ticket-panel', 'ui:settings', 'ui:command-palette',
  // Integration surfaces
  'webhook:outbound', 'webhook:inbound',
  'ai:chat', 'ai:embed',
  'files:read', 'files:write',
  'schedule:cron',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSION_GROUPS: Record<string, { label: string; description: string; permissions: Permission[] }> = {
  contacts: {
    label: 'Contacts & CRM',
    description: 'Access customer records, companies, and CRM data.',
    permissions: ['read:contacts', 'write:contacts'],
  },
  conversations: {
    label: 'Conversations & Messaging',
    description: 'Read and send messages across all channels.',
    permissions: ['read:conversations', 'write:conversations'],
  },
  sales: {
    label: 'Deals & Pipeline',
    description: 'Access sales pipeline, deals, and revenue data.',
    permissions: ['read:deals', 'write:deals'],
  },
  helpdesk: {
    label: 'Helpdesk & Tickets',
    description: 'Manage support tickets and SLAs.',
    permissions: ['read:tickets', 'write:tickets'],
  },
  marketing: {
    label: 'Marketing',
    description: 'View and launch campaigns.',
    permissions: ['read:campaigns', 'write:campaigns'],
  },
  analytics: {
    label: 'Analytics',
    description: 'Read reporting data and metrics.',
    permissions: ['read:analytics'],
  },
  ui: {
    label: 'User interface',
    description: 'Add nav items, panels, and settings pages.',
    permissions: ['ui:nav', 'ui:inbox-sidebar', 'ui:contact-panel', 'ui:deal-panel', 'ui:ticket-panel', 'ui:settings', 'ui:command-palette'],
  },
  integrations: {
    label: 'Integrations',
    description: 'Send outbound webhooks and receive inbound calls.',
    permissions: ['webhook:outbound', 'webhook:inbound'],
  },
  ai: {
    label: 'AI',
    description: 'Use AI chat and embeddings on behalf of the workspace.',
    permissions: ['ai:chat', 'ai:embed'],
  },
  files: {
    label: 'Files & storage',
    description: 'Read and upload workspace files.',
    permissions: ['files:read', 'files:write'],
  },
  schedule: {
    label: 'Background jobs',
    description: 'Run scheduled/cron tasks.',
    permissions: ['schedule:cron'],
  },
};

export class PermissionManager {
  private grants = new Map<string, Set<Permission>>();

  grant(slug: string, permissions: Permission[]) {
    this.grants.set(slug, new Set(permissions));
  }
  revoke(slug: string) {
    this.grants.delete(slug);
  }
  has(slug: string, perm: Permission): boolean {
    return this.grants.get(slug)?.has(perm) ?? false;
  }
  require(slug: string, perm: Permission) {
    if (!this.has(slug, perm))
      throw new PermissionDeniedError(slug, perm);
  }
  granted(slug: string): Permission[] {
    return Array.from(this.grants.get(slug) ?? []);
  }
}

export class PermissionDeniedError extends Error {
  constructor(public slug: string, public permission: Permission) {
    super(`[plugin ${slug}] permission denied: ${permission}`);
  }
}

export const permissions = new PermissionManager();
