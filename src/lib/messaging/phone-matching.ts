/**
 * Phone normalization + configurable contact matching.
 *
 * Strategies (applied in priority order, first hit wins):
 *   - exact          : identifier equals contacts.phone byte-for-byte
 *   - e164           : normalize both sides to E.164 using default_country_code
 *   - national       : compare digits-only national significant number
 *   - last_n_digits  : compare last N digits (defaults to 8) — resilient to
 *                      country-code drift, useful for legacy imports.
 */

export type MatchStrategy = "exact" | "e164" | "national" | "last_n_digits";

export interface MatchingRule {
  id: string;
  workspace_id: string;
  priority: number;
  strategy: MatchStrategy;
  default_country_code: string | null;
  digits_to_match: number | null;
  enabled: boolean;
  label: string | null;
}

/** Strip everything except digits. */
export function digitsOnly(input: string): string {
  return (input ?? "").replace(/\D+/g, "");
}

/**
 * Normalize to E.164-ish "+<digits>". If the input starts with "+" we keep
 * its country code; otherwise we prepend `defaultCountryCode` (which may
 * be given as "+1" or "1"). Returns null when no digits are found.
 */
export function toE164(raw: string, defaultCountryCode?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const d = digitsOnly(trimmed);
    return d ? `+${d}` : null;
  }
  // Common "00" international prefix
  const d = digitsOnly(trimmed);
  if (!d) return null;
  if (d.startsWith("00")) return `+${d.slice(2)}`;
  const cc = digitsOnly(defaultCountryCode ?? "");
  if (cc && !d.startsWith(cc)) return `+${cc}${d}`;
  return `+${d}`;
}

/** National significant number = digits after country code. */
export function toNational(raw: string, defaultCountryCode?: string | null): string | null {
  const e = toE164(raw, defaultCountryCode);
  if (!e) return null;
  const cc = digitsOnly(defaultCountryCode ?? "");
  const rest = e.slice(1);
  return cc && rest.startsWith(cc) ? rest.slice(cc.length) : rest;
}

/** Last N digits of any phone-ish string. */
export function lastNDigits(raw: string, n: number): string | null {
  const d = digitsOnly(raw);
  if (d.length < Math.min(n, 4)) return null;
  return d.slice(-n);
}

// ---------------------------------------------------------------------------
// Supabase-side matcher — used by the WhatsApp webhook to map inbound
// senders onto CRM contacts. Runs with a service-role client because
// webhooks are unauthenticated.
// ---------------------------------------------------------------------------

interface SupabaseLike {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c: string, v: unknown) => {
        eq: (c: string, v: unknown) => {
          order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: any;
}

// We can't type the admin client without pulling it in here; keep it loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export async function loadMatchingRules(sb: SB, workspaceId: string): Promise<MatchingRule[]> {
  const { data } = await sb
    .from("contact_matching_rules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true)
    .order("priority", { ascending: true });
  return (data as MatchingRule[]) ?? [];
}

/**
 * Find an existing contact for `rawPhone` in `workspaceId` by walking the
 * configured rules in priority order. Returns null when nothing matches;
 * caller is responsible for creating a new contact.
 */
export async function findContactByPhone(
  sb: SB,
  workspaceId: string,
  rawPhone: string,
  rulesOverride?: MatchingRule[],
): Promise<{ id: string; display_name: string | null } | null> {
  const rules = rulesOverride ?? (await loadMatchingRules(sb, workspaceId));
  // Always try exact match first as a cheap short-circuit, even if no rule.
  const exactHit = await selectContact(sb, workspaceId, "phone", rawPhone);
  if (exactHit) return exactHit;

  for (const rule of rules) {
    if (rule.strategy === "exact") continue; // already tried
    if (rule.strategy === "e164") {
      const e164 = toE164(rawPhone, rule.default_country_code);
      if (!e164) continue;
      const hit = await selectContact(sb, workspaceId, "phone", e164);
      if (hit) return hit;
      continue;
    }
    if (rule.strategy === "national") {
      const nat = toNational(rawPhone, rule.default_country_code);
      if (!nat) continue;
      // Suffix match against stored phone.
      const hit = await selectContactByPhoneSuffix(sb, workspaceId, nat);
      if (hit) return hit;
      continue;
    }
    if (rule.strategy === "last_n_digits") {
      const n = rule.digits_to_match ?? 8;
      const tail = lastNDigits(rawPhone, n);
      if (!tail) continue;
      const hit = await selectContactByPhoneSuffix(sb, workspaceId, tail);
      if (hit) return hit;
      continue;
    }
  }
  return null;
}

async function selectContact(
  sb: SB,
  workspaceId: string,
  column: string,
  value: string,
): Promise<{ id: string; display_name: string | null } | null> {
  const { data } = await sb
    .from("contacts")
    .select("id, display_name")
    .eq("workspace_id", workspaceId)
    .eq(column, value)
    .limit(1)
    .maybeSingle();
  return (data as { id: string; display_name: string | null } | null) ?? null;
}

async function selectContactByPhoneSuffix(
  sb: SB,
  workspaceId: string,
  suffixDigits: string,
): Promise<{ id: string; display_name: string | null } | null> {
  // Use ilike suffix match; the stored `phone` column may contain "+" and
  // other formatting so we can't equality-match after normalization.
  const { data } = await sb
    .from("contacts")
    .select("id, display_name")
    .eq("workspace_id", workspaceId)
    .ilike("phone", `%${suffixDigits}`)
    .limit(1)
    .maybeSingle();
  return (data as { id: string; display_name: string | null } | null) ?? null;
}
