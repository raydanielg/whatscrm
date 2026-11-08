import type { QueryClient } from "@tanstack/react-query";

/**
 * Single source of truth for how a contact/customer/lead row is displayed and
 * how its cached copies are refreshed.
 *
 * The same `contacts` row is cached under several query keys across the app
 * (CRM list, contact detail, Customers module, conversation profile panel,
 * global search, inbox). Before this helper each mutation invalidated only a
 * subset, so edits appeared in one screen and stayed stale in the others.
 */

export type ContactLike = {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  phones?: Array<{ number?: string | null }> | null;
  emails?: Array<{ address?: string | null }> | null;
  company_name?: string | null;
};

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

/** Resolve the human label for a contact-like row, identically everywhere. */
export function resolveDisplayName(c: ContactLike | null | undefined, fallback = "Unnamed contact"): string {
  if (!c) return fallback;
  const joined = [clean(c.first_name), clean(c.last_name)].filter(Boolean).join(" ").trim();
  return (
    clean(c.display_name) ||
    clean(c.full_name) ||
    (joined.length ? joined : null) ||
    clean(c.name) ||
    clean(c.email) ||
    clean(c.emails?.[0]?.address) ||
    clean(c.phone) ||
    clean(c.phones?.[0]?.number) ||
    clean(c.whatsapp) ||
    clean(c.company_name) ||
    fallback
  );
}

/** Two-letter initials derived from the same resolved display name. */
export function resolveInitials(c: ContactLike | null | undefined, fallback = "Unnamed contact"): string {
  return resolveDisplayName(c, fallback)
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Every query key family that renders data derived from a `contacts` row. */
export const CONTACT_QUERY_KEY_ROOTS = [
  "contacts",
  "contact",
  "customers",
  "customer",
  "customer-profile",
  "customer-timeline",
  "customer-activities",
  "customer-attachments",
  "contact-activity",
  "contact-deals",
  "contact-tasks",
  "contact-notes",
  "contact-attachments",
  "contact-campaigns",
  "contact-lists",
  "contact-list-members",
  "crm-search",
  "inbox-contact-search",
  "conversations",
  "conversation-stats",
  "leads",
  "lead",
] as const;

/**
 * Invalidate every cached view of a contact so all modules re-render the same
 * data. Pass the contact id when known — list caches are invalidated by prefix
 * regardless, detail caches by their `[root, id, ...]` prefix.
 */
export function invalidateContactCaches(qc: QueryClient, contactId?: string | null): void {
  for (const root of CONTACT_QUERY_KEY_ROOTS) {
    qc.invalidateQueries({ queryKey: [root] });
  }
  if (contactId) {
    // Also drop any detail entry that is currently inactive, so re-opening a
    // profile never renders a stale snapshot from a previous edit.
    qc.invalidateQueries({ queryKey: ["contact", contactId], refetchType: "all" });
    qc.invalidateQueries({ queryKey: ["customer", contactId], refetchType: "all" });
    qc.invalidateQueries({ queryKey: ["customer-profile", contactId], refetchType: "all" });
  }
}
