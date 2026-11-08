import { Link } from "@tanstack/react-router";
import DOMPurify from "dompurify";
import { HeaderSlot } from "@/lib/layout/header-height";
import { useTenantBrand, socialUrl, type TenantSocials } from "@/hooks/use-tenant-brand";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import { APP_VERSION_LABEL } from "@/lib/app-version";
import { docsUrl } from "@/lib/docs/links";
import { SHOW_RESOURCE_LINKS } from "@/lib/docs/visibility";

const footerLinkClass =
  "rounded-control px-1 -mx-1 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background text-xs";

export function AppFooter() {
  const year = new Date().getFullYear();
  const brand = useTenantBrand();
  const platform = usePlatformBranding();
  return (
    <HeaderSlot
      as="footer"
      border="top"
      tone="surface"
      role="contentinfo"
      aria-label="Application footer"
      className="bg-background text-foreground border-border"
    >

      <div className="flex w-full items-center justify-between gap-4 text-sm text-muted-foreground">
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex min-w-0 items-center gap-2"
        >
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success animate-pulse"
            aria-hidden="true"
          />
          <span className="truncate">All systems operational</span>
          <span className="opacity-40 hidden sm:inline" aria-hidden="true">·</span>
          <span className="hidden sm:inline text-xs">{brand.name} · {APP_VERSION_LABEL}</span>
        </div>
        <BrandSocials socials={brand.socials} />
        <nav
          aria-label="Footer navigation"
          className="hidden sm:flex items-center gap-x-4 whitespace-nowrap"
        >
          <Link to="/settings" className={footerLinkClass}>
            Settings
          </Link>
          {SHOW_RESOURCE_LINKS && <a
            href={docsUrl()}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Documentation (opens in a new tab)"
            className={`${footerLinkClass} hidden md:inline`}
          >
            Docs
          </a>}
          {SHOW_RESOURCE_LINKS && <a
            href={docsUrl("changelog")}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Changelog (opens in a new tab)"
            className={`${footerLinkClass} hidden md:inline`}
          >
            Changelog
          </a>}
          {SHOW_RESOURCE_LINKS && <a
            href={docsUrl("status")}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="System status (opens in a new tab)"
            className={`${footerLinkClass} hidden lg:inline`}
          >
            Status
          </a>}
          {SHOW_RESOURCE_LINKS && <a
            href={docsUrl("support")}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Support (opens in a new tab)"
            className={`${footerLinkClass} hidden lg:inline`}
          >
            Support
          </a>}
          {platform.supportEmail && (
            <a
              href={`mailto:${platform.supportEmail}`}
              className={`${footerLinkClass} hidden lg:inline`}
              aria-label={`Email support at ${platform.supportEmail}`}
            >
              Contact
            </a>
          )}
          {platform.footerHtml && (
            <span
              className="hidden lg:inline text-muted-foreground [&_a]:underline hover:[&_a]:text-foreground"
              // Allow-list sanitized server-side, then sanitized again here on render.
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(platform.footerHtml, {
                  ALLOWED_TAGS: ["a", "span", "b", "strong", "i", "em", "u", "small", "br", "p"],
                  ALLOWED_ATTR: ["href", "target", "rel", "title"],
                }),
              }}
            />
          )}
          <span className="text-muted-foreground text-xs">&copy; {year} {brand.name}</span>
        </nav>
        <span className="sm:hidden text-muted-foreground">&copy; {year} {brand.name}</span>

      </div>
    </HeaderSlot>
  );
}

const SOCIAL_LABELS: Record<keyof TenantSocials, string> = {
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  threads: "Threads",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  website: "Website",
};

/** Real workspace social handles from White Label settings. Hidden until set. */
function BrandSocials({ socials }: { socials: TenantSocials }) {
  const links = (Object.keys(SOCIAL_LABELS) as (keyof TenantSocials)[])
    .map((k) => ({ key: k, label: SOCIAL_LABELS[k], href: socialUrl(k, socials[k]) }))
    .filter((l) => !!l.href);
  if (links.length === 0) return null;
  return (
    <nav aria-label="Social links" className="hidden lg:flex items-center gap-x-3 whitespace-nowrap">
      {links.map((l) => (
        <a
          key={l.key}
          href={l.href as string}
          target="_blank"
          rel="noreferrer noopener me"
          className={footerLinkClass}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}
