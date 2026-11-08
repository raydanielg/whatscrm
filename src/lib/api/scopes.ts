/**
 * Canonical API key scope catalog.
 *
 * Client-safe (no server-only imports) so the key management UI, the
 * server functions that create/update keys, and the API gateway all agree
 * on exactly one list of scopes.
 */

export const API_SCOPES = [
  "contacts:read",
  "contacts:write",
  "conversations:read",
  "conversations:write",
  "messages:read",
  "messages:write",
  "deals:read",
  "deals:write",
  "campaigns:read",
  "campaigns:write",
  "webhooks:manage",
  "analytics:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** Wildcard grant. A key holding "*" satisfies every scope check. */
export const WILDCARD_SCOPE = "*";

export type ApiScopeGrant = ApiScope | typeof WILDCARD_SCOPE;

export interface ScopeGroup {
  key: string;
  label: string;
  description: string;
  scopes: Array<{ scope: ApiScope; label: string; description: string }>;
}

export const SCOPE_GROUPS: ScopeGroup[] = [
  {
    key: "crm",
    label: "CRM",
    description: "Contacts, companies and deals.",
    scopes: [
      { scope: "contacts:read", label: "Read contacts", description: "List and fetch contacts and companies." },
      { scope: "contacts:write", label: "Write contacts", description: "Create, update and delete contacts and companies." },
      { scope: "deals:read", label: "Read deals", description: "List and fetch deals in the sales pipeline." },
      { scope: "deals:write", label: "Write deals", description: "Create and update deals." },
    ],
  },
  {
    key: "messaging",
    label: "Messaging",
    description: "Conversations and outbound messages.",
    scopes: [
      { scope: "conversations:read", label: "Read conversations", description: "List conversations and their metadata." },
      { scope: "conversations:write", label: "Write conversations", description: "Assign, tag, close and reopen conversations." },
      { scope: "messages:read", label: "Read messages", description: "Read message history in conversations." },
      { scope: "messages:write", label: "Send messages", description: "Send outbound messages, including WhatsApp templates." },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Campaigns and broadcast sending.",
    scopes: [
      { scope: "campaigns:read", label: "Read campaigns", description: "List campaigns and their delivery stats." },
      { scope: "campaigns:write", label: "Write campaigns", description: "Create, schedule and stop campaigns." },
    ],
  },
  {
    key: "platform",
    label: "Platform",
    description: "Analytics and webhook subscriptions.",
    scopes: [
      { scope: "analytics:read", label: "Read analytics", description: "Read reporting and usage metrics." },
      { scope: "webhooks:manage", label: "Manage webhooks", description: "Create and delete outbound webhook subscriptions." },
    ],
  },
];

const SCOPE_SET = new Set<string>(API_SCOPES);

export function isApiScope(value: string): value is ApiScope {
  return SCOPE_SET.has(value);
}

/** Keep only known scopes (plus the wildcard), de-duplicated. */
export function normalizeScopes(input: readonly string[]): ApiScopeGrant[] {
  const out = new Set<ApiScopeGrant>();
  for (const raw of input) {
    const s = raw.trim();
    if (s === WILDCARD_SCOPE) out.add(WILDCARD_SCOPE);
    else if (isApiScope(s)) out.add(s);
  }
  return [...out];
}

/** True when the granted set satisfies `required` (wildcard satisfies all). */
export function hasScope(granted: readonly string[], required: ApiScope): boolean {
  return granted.includes(WILDCARD_SCOPE) || granted.includes(required);
}

/** Scopes in `required` that `granted` does not satisfy. */
export function missingScopes(granted: readonly string[], required: readonly ApiScope[]): ApiScope[] {
  return required.filter((s) => !hasScope(granted, s));
}

export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = Object.fromEntries(
  SCOPE_GROUPS.flatMap((g) => g.scopes.map((s) => [s.scope, s.description])),
) as Record<ApiScope, string>;
