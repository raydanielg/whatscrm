/**
 * WhatsApp CTA — one place that turns a configurable "channel token" into a
 * click-to-chat link with a prefilled message, and degrades to a fallback
 * link when no usable token is configured.
 *
 * The channel token accepts anything a business is likely to have on hand:
 *   - a phone number in any format:  "+971 50 123 4567" → wa.me/971501234567
 *   - a wa.me / api.whatsapp.com link (with or without its own ?text=)
 *   - a WhatsApp short link:         "wa.me/message/ABCD1234"
 *
 * Nothing here touches the network or the DOM, so it is safe on the server.
 */

import { BRAND_NAME } from "@/lib/branding/brand";
export type WhatsAppCtaConfig = {
  /** Master switch from Super Admin → Platform Settings → General. */
  enabled: boolean;
  /** Phone number or wa.me link used to open the chat. */
  token: string | null;
  /** Prefilled first message. Supports {page} and {site} placeholders. */
  message: string | null;
  /** Button label. */
  label: string | null;
  /** Where to send visitors when no token is configured (e.g. /contact). */
  fallbackUrl: string | null;
};

export const WHATSAPP_CTA_DEFAULTS: WhatsAppCtaConfig = {
  enabled: true,
  token: null,
  message: "Hi! I'd like to know more about {site}.",
  label: "Chat on WhatsApp",
  fallbackUrl: "/contact",
};

export type ResolvedWhatsAppCta = {
  /** Ready-to-use href. */
  href: string;
  /** Button label. */
  label: string;
  /** The message that will be prefilled (empty when falling back). */
  message: string;
  /** True when no valid token existed and the fallback link is used. */
  isFallback: boolean;
  /** Fallback to an in-app path → render a router Link, not an anchor. */
  isInternal: boolean;
};

const MAX_MESSAGE = 600;
const HOSTS = new Set(["wa.me", "api.whatsapp.com", "web.whatsapp.com", "chat.whatsapp.com"]);

/** Digits-only E.164 body (no +, no spaces), or null when implausible. */
export function normalizeWhatsAppToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  // A full link — trust the host allowlist, drop anything else.
  if (/^(https?:)?\/\//i.test(value) || /^(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(value)) {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/\//, "")}`;
    try {
      const url = new URL(withScheme);
      if (!HOSTS.has(url.hostname.toLowerCase())) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  // Otherwise treat it as a phone number.
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** Render {site} / {page} placeholders inside the prefilled message. */
export function renderCtaMessage(
  template: string | null | undefined,
  vars: { site?: string; page?: string } = {},
): string {
  const text = (template ?? "").trim();
  if (!text) return "";
  return text
    .replace(/\{site\}/gi, vars.site ?? BRAND_NAME)
    .replace(/\{page\}/gi, vars.page ?? "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE);
}

function safeFallback(url: string | null | undefined): { href: string; internal: boolean } {
  const value = (url ?? "").trim();
  if (value.startsWith("/") && !value.startsWith("//")) return { href: value, internal: true };
  if (/^https?:\/\//i.test(value)) return { href: value, internal: false };
  return { href: WHATSAPP_CTA_DEFAULTS.fallbackUrl!, internal: true };
}

/**
 * Build the final CTA. Never throws — a broken configuration always yields a
 * usable fallback link so the button is never a dead end.
 */
export function resolveWhatsAppCta(
  config: Partial<WhatsAppCtaConfig> | null | undefined,
  vars: { site?: string; page?: string } = {},
): ResolvedWhatsAppCta {
  const cfg = { ...WHATSAPP_CTA_DEFAULTS, ...(config ?? {}) };
  const label = (cfg.label ?? "").trim() || WHATSAPP_CTA_DEFAULTS.label!;
  const message = renderCtaMessage(cfg.message, vars);
  const token = normalizeWhatsAppToken(cfg.token);

  if (!token) {
    const fb = safeFallback(cfg.fallbackUrl);
    return { href: fb.href, label, message: "", isFallback: true, isInternal: fb.internal };
  }

  if (token.startsWith("http")) {
    const url = new URL(token);
    // Short links (wa.me/message/XXXX) cannot carry a prefilled text.
    const supportsText = !/^\/message\//i.test(url.pathname);
    if (message && supportsText && !url.searchParams.get("text")) {
      url.searchParams.set("text", message);
    }
    return {
      href: url.toString(),
      label,
      message: supportsText ? message : "",
      isFallback: false,
      isInternal: false,
    };
  }

  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return { href: `https://wa.me/${token}${query}`, label, message, isFallback: false, isInternal: false };
}
