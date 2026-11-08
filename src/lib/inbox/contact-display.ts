/**
 * Contact display helpers for the inbox.
 *
 * WhatsApp (and other messaging) contacts often arrive without a full name —
 * the webhook stores the phone number in `display_name` when the provider
 * profile has no name. The inbox header and other surfaces must fall back
 * gracefully to display_name → phone (formatted) → email, and only show
 * "Unknown contact" when nothing at all resolves.
 *
 * All phone normalization and formatting flows through the canonical helpers
 * here so the conversation list, header, detail drawer, and sidebar render
 * identical values (and `tel:` / `wa.me` links use identical digits).
 */

import { digitsOnly, toE164 } from "@/lib/messaging/phone-matching";

export type PartialContactLike = {
  name?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
} | null | undefined;

const PHONE_LIKE = /^\+?\d[\d\s().-]{5,}$/;

/**
 * Normalize a phone-ish input to canonical E.164 ("+<digits>"). Returns
 * `null` when there aren't enough digits to be a phone number. Use this
 * for storage keys, dedupe, and href construction — never for display.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountryCode?: string | null,
): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const d = digitsOnly(trimmed);
  if (d.length < 6) return null;
  return toE164(trimmed, defaultCountryCode ?? null);
}

/**
 * Format a phone (any input) into a consistent grouped display form.
 * Canonicalizes via `normalizePhone` first so "+14155551212",
 * "1-415-555-1212", and "(415) 555 1212" all render identically.
 */
export function formatPhoneNumber(
  raw: string | null | undefined,
  defaultCountryCode?: string | null,
): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const e164 = normalizePhone(trimmed, defaultCountryCode);
  if (!e164) {
    // Fall back to raw when we can't confidently normalize (too few digits).
    return trimmed || null;
  }
  const d = e164.slice(1); // strip leading "+"
  // Country code = digits[0 .. len-10]; assume the last 10 are the national
  // significant number. Cap CC at 3 digits, fall back to 1 for short inputs.
  const ccLen = Math.min(3, Math.max(1, d.length - 10));
  const cc = d.slice(0, ccLen);
  const rest = d.slice(ccLen);
  const grouped = rest
    .replace(/(\d{3})(\d{3})(\d{0,4})/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(" "),
    )
    .trim();
  return `+${cc}${grouped ? ` ${grouped}` : ""}`.trim();
}

/** Best raw phone for a contact — prefers `phone`, falls back to `whatsapp`. */
export function pickContactPhone(
  contact: PartialContactLike,
  fallback?: PartialContactLike,
): string | null {
  return (
    contact?.phone ??
    contact?.whatsapp ??
    fallback?.phone ??
    fallback?.whatsapp ??
    null
  );
}

/** `tel:` href using canonical E.164 digits — never formatted with spaces. */
export function phoneToTelHref(
  raw: string | null | undefined,
  defaultCountryCode?: string | null,
): string | undefined {
  const e164 = normalizePhone(raw, defaultCountryCode);
  return e164 ? `tel:${e164}` : undefined;
}

/** `wa.me` href — must be digits only, no "+". */
export function phoneToWhatsAppHref(
  raw: string | null | undefined,
  defaultCountryCode?: string | null,
): string | undefined {
  const e164 = normalizePhone(raw, defaultCountryCode);
  if (!e164) return undefined;
  return `https://wa.me/${e164.slice(1)}`;
}

/**
 * Resolve the best display name for a contact, considering an optional
 * fallback (e.g. the contact joined on the conversation row while the
 * full profile is still loading).
 */
export function resolveContactDisplayName(
  contact: PartialContactLike,
  fallback?: PartialContactLike,
): string {
  const candidates: Array<string | null | undefined> = [];
  for (const c of [contact, fallback]) {
    if (!c) continue;
    const composed = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    candidates.push(
      c.name,
      c.display_name,
      composed || null,
    );
  }
  for (const raw of candidates) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    // A display_name that is really a phone number should be re-formatted
    // via the canonical formatter so it matches other surfaces.
    if (PHONE_LIKE.test(v)) return formatPhoneNumber(v) ?? v;
    return v;
  }
  const phone = pickContactPhone(contact, fallback);
  const formatted = formatPhoneNumber(phone);
  if (formatted) return formatted;
  const email = (contact?.email ?? fallback?.email ?? "").trim();
  if (email) return email;
  return "Unknown contact";
}

/**
 * Phone number suitable for a secondary line (e.g. under the contact name).
 * Returns `null` when the primary display name already IS the phone, so
 * callers can render "Name / +CC " without duplication.
 */
export function resolveContactPhoneSubtitle(
  contact: PartialContactLike,
  fallback?: PartialContactLike,
): string | null {
  const primary = resolveContactDisplayName(contact, fallback);
  const raw = pickContactPhone(contact, fallback);
  const formatted = formatPhoneNumber(raw);
  if (!formatted) return null;
  if (primary === formatted) return null;
  return formatted;
}

/** Compute a 1–2 character initial string for an avatar fallback. */
export function resolveContactInitials(
  contact: PartialContactLike,
  fallback?: PartialContactLike,
): string {
  const name = resolveContactDisplayName(contact, fallback);
  if (name === "Unknown contact") return "?";
  // If the resolved name is a phone number, use the last two digits.
  if (name.startsWith("+") || /^\d/.test(name)) {
    const digits = name.replace(/[^\d]/g, "");
    return digits.slice(-2) || "?";
  }
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

