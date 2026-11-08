/**
 * Auto-suggest values for {{variables}} before the parameter editor opens.
 *
 * Priority (highest first):
 *   1. conversation context vars supplied by the caller (agent name, )
 *   2. the selected contact / CRM record fields
 *   3. the last values the user typed for that same template
 *   4. static merge-field samples (placeholder hints only, never auto-applied)
 */

import { mergeFieldSamples } from "@/components/app/whatsapp/merge-fields";

export type SuggestionSource = "context" | "contact" | "last_used" | "sample";

export type Suggestion = { value: string; source: SuggestionSource };

/** Loose shape — any CRM contact row works. */
export type ContactLike = Record<string, unknown> | null | undefined;

const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

/** Normalise a token: `Customer Name`, `customer-name`, `customerName` → `customer_name`. */
export function normalizeToken(token: string): string {
  return token
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s.-]+/g, "_")
    .toLowerCase()
    .trim();
}

/** Aliases that all resolve to the same contact-derived value. */
const ALIASES: Record<string, string[]> = {
  name: ["name", "full_name", "customer_name", "contact_name", "client_name", "1"],
  first_name: ["first_name", "firstname", "given_name"],
  last_name: ["last_name", "lastname", "surname", "family_name"],
  phone: ["phone", "phone_number", "customer_phone", "contact_phone", "mobile", "whatsapp"],
  email: ["email", "customer_email", "contact_email", "mail"],
  company: ["company", "company_name", "organization", "account_name"],
  job_title: ["job_title", "title", "position", "role"],
  city: ["city", "town"],
  country: ["country"],
  address: ["address", "delivery_address", "street"],
  website: ["website", "url", "site"],
};

function aliasKey(token: string): string | null {
  const t = normalizeToken(token);
  for (const [key, list] of Object.entries(ALIASES)) if (list.includes(t)) return key;
  return null;
}

/** Extract the canonical contact fields from any contact-ish row. */
export function contactFields(contact: ContactLike): Record<string, string> {
  if (!contact || typeof contact !== "object") return {};
  const c = contact as Record<string, unknown>;
  const first = str(c.first_name);
  const last = str(c.last_name);
  const display = str(c.display_name) || str(c.name) || [first, last].filter(Boolean).join(" ");
  const custom = (c.custom_fields ?? c.metadata) as Record<string, unknown> | undefined;

  const out: Record<string, string> = {};
  const put = (k: string, v: string) => {
    if (v) out[k] = v;
  };
  put("name", display);
  put("first_name", first || display.split(" ")[0] || "");
  put("last_name", last);
  put("phone", str(c.phone) || str(c.phone_number) || str(c.whatsapp_number));
  put("email", str(c.email));
  put("company", str(c.company_name) || str(c.company) || str(c.organization_name));
  put("job_title", str(c.job_title) || str(c.title));
  put("city", str(c.city));
  put("country", str(c.country));
  put("address", str(c.address) || str(c.address_line1));
  put("website", str(c.website));

  if (custom && typeof custom === "object") {
    for (const [k, v] of Object.entries(custom)) {
      const val = str(v);
      if (val) out[normalizeToken(k)] = val;
    }
  }
  return out;
}

/* ------------------------- last used values (local) ------------------------ */

const LAST_USED_PREFIX = "wacrm:tpl-vars:";

export function loadLastUsedValues(templateId: string | undefined): Record<string, string> {
  if (!templateId || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LAST_USED_PREFIX + templateId);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const val = str(v);
      if (val) out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLastUsedValues(
  templateId: string | undefined,
  values: Record<string, string>,
): void {
  if (!templateId || typeof window === "undefined") return;
  try {
    const keep: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) if (v?.trim()) keep[k] = v.trim();
    if (Object.keys(keep).length === 0) return;
    window.localStorage.setItem(LAST_USED_PREFIX + templateId, JSON.stringify(keep));
  } catch {
    /* storage disabled — suggestions are best-effort */
  }
}

/* ------------------------------- suggestions ------------------------------- */

export type SuggestInput = {
  tokens: string[];
  contextVars?: Record<string, string | undefined | null> | undefined;
  contact?: ContactLike;
  lastUsed?: Record<string, string> | undefined;
  /** Include static demo samples as a last resort (defaults to false). */
  includeSamples?: boolean;
};

/**
 * Resolve a suggestion for every token. Only tokens with a real value appear
 * in the result, so callers can tell "suggested" apart from "still empty".
 */
export function suggestVariableValues({
  tokens,
  contextVars,
  contact,
  lastUsed,
  includeSamples = false,
}: SuggestInput): Record<string, Suggestion> {
  const fields = contactFields(contact);
  const samples = includeSamples ? mergeFieldSamples() : {};
  const out: Record<string, Suggestion> = {};

  for (const token of tokens) {
    const norm = normalizeToken(token);
    const alias = aliasKey(token);

    const ctx = str(contextVars?.[token]) || str(contextVars?.[norm]);
    if (ctx) {
      out[token] = { value: ctx, source: "context" };
      continue;
    }

    const fromContact = fields[norm] || (alias ? fields[alias] : "");
    if (fromContact) {
      out[token] = { value: fromContact, source: "contact" };
      continue;
    }

    const prev = str(lastUsed?.[token]) || str(lastUsed?.[norm]);
    if (prev) {
      out[token] = { value: prev, source: "last_used" };
      continue;
    }

    const sample = str(samples[token]) || str(samples[norm]);
    if (sample) out[token] = { value: sample, source: "sample" };
  }

  return out;
}

export const SOURCE_LABEL: Record<SuggestionSource, string> = {
  context: "Conversation",
  contact: "Contact",
  last_used: "Last used",
  sample: "Sample",
};
