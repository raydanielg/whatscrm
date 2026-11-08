/**
 * Public platform branding.
 *
 * Super Admin → Platform Settings → General/Branding is stored in
 * `public.settings` (scope='platform'). Those rows are only readable by
 * platform staff, so this server function exposes the *non-sensitive*
 * presentation subset (name, tagline, logos, favicon, colors, footer) to
 * every surface of the app — including signed-out pages such as /auth.
 *
 * Everything is sanitized here so a bad value saved in the admin panel can
 * never break or inject into the app shell.
 */
import { BRAND_NAME } from "@/lib/branding/brand";
import { createServerFn } from "@tanstack/react-start";

export type PlatformBranding = {
  platformName: string;
  tagline: string | null;
  primaryUrl: string | null;
  supportEmail: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  footerHtml: string | null;
};

export const PLATFORM_BRANDING_FALLBACK: PlatformBranding = {
  platformName: BRAND_NAME,
  tagline: null,
  primaryUrl: null,
  supportEmail: null,
  logoUrl: null,
  logoDarkUrl: null,
  faviconUrl: null,
  primaryColor: null,
  accentColor: null,
  footerHtml: null,
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** Only http(s) or root-relative asset paths are accepted. */
export function safeAssetUrl(v: unknown): string | null {
  const s = str(v, 2048);
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function safeHex(v: unknown): string | null {
  const s = str(v, 16);
  return s && HEX.test(s) ? s.toLowerCase() : null;
}

export function safeEmail(v: unknown): string | null {
  const s = str(v, 254);
  return s && EMAIL.test(s) ? s : null;
}

/**
 * Footer copy is rendered as HTML.
 *
 * Blacklist regexes are bypassable (`<svg/onload=>`, `<img/src=x onerror=>`),
 * so this is a strict allow-list parser: every tag not on ALLOWED_TAGS is
 * dropped entirely, and surviving tags keep only explicitly allowed
 * attributes with safe URL schemes.
 */
const ALLOWED_TAGS: Record<string, readonly string[]> = {
  a: ["href", "target", "rel", "title"],
  span: [],
  b: [],
  strong: [],
  i: [],
  em: [],
  u: [],
  small: [],
  br: [],
  p: [],
};

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i;

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeAttributes(tag: string, raw: string): string {
  const allowed = ALLOWED_TAGS[tag] ?? [];
  if (allowed.length === 0) return "";
  const out: string[] = [];
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>`]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    if (!allowed.includes(name)) continue;
    const value = (m[3] ?? m[4] ?? m[5] ?? "").trim();
    if ((name === "href" || name === "src") && !SAFE_URL.test(value)) continue;
    if (name === "target" && value !== "_blank" && value !== "_self") continue;
    out.push(`${name}="${escapeText(value).slice(0, 2048)}"`);
  }
  if (tag === "a" && out.some((a) => a.startsWith('target="_blank"')) && !out.some((a) => a.startsWith("rel="))) {
    out.push('rel="noopener noreferrer"');
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

export function sanitizeFooterHtml(v: unknown): string | null {
  const s = str(v, 4000);
  if (!s) return null;

  let out = "";
  let index = 0;
  const openStack: string[] = [];
  const tagRe = /<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>?/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(s)) !== null) {
    out += escapeText(s.slice(index, match.index));
    index = match.index + match[0].length;

    const tag = match[1].toLowerCase();
    const isClosing = match[0].startsWith("</");
    if (!(tag in ALLOWED_TAGS)) continue;

    if (isClosing) {
      const at = openStack.lastIndexOf(tag);
      if (at === -1) continue;
      openStack.splice(at, 1);
      out += `</${tag}>`;
      continue;
    }

    const selfClosing = tag === "br" || /\/\s*$/.test(match[2]);
    out += `<${tag}${sanitizeAttributes(tag, match[2])}${selfClosing ? " /" : ""}>`;
    if (!selfClosing) openStack.push(tag);
  }

  out += escapeText(s.slice(index));
  // Close anything left open so the footer can never break the app shell.
  for (let i = openStack.length - 1; i >= 0; i -= 1) out += `</${openStack[i]}>`;

  return out.trim() || null;
}

export const getPlatformBranding = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformBranding> => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("key, value")
      .eq("scope", "platform")
      .in("key", ["general", "branding"]);

    if (error || !data) return PLATFORM_BRANDING_FALLBACK;

    const byKey: Record<string, Record<string, unknown>> = {};
    for (const row of data) {
      byKey[row.key] = (row.value ?? {}) as Record<string, unknown>;
    }
    const g = byKey["general"] ?? {};
    const b = byKey["branding"] ?? {};

    return {
      platformName: str(g["platform_name"], 60) ?? PLATFORM_BRANDING_FALLBACK.platformName,
      tagline: str(g["tagline"], 160),
      primaryUrl: safeAssetUrl(g["primary_url"]),
      supportEmail: safeEmail(g["support_email"]),
      logoUrl: safeAssetUrl(b["logo_url"]),
      logoDarkUrl: safeAssetUrl(b["dark_logo_url"]),
      faviconUrl: safeAssetUrl(b["favicon_url"]),
      primaryColor: safeHex(b["primary_color"]),
      accentColor: safeHex(b["accent_color"]),
      footerHtml: sanitizeFooterHtml(b["footer_html"]),
    };
  },
);
