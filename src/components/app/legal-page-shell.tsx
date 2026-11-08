import { useBrandName } from "@/hooks/use-brand-name";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/app/marketing-shell";
import { Cookie, FileText, Scale, Shield, ScrollText } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

function getLegalPages(brandName: string) {
  return [
    {
      to: "/legal/privacy-policy",
      label: "Privacy Policy",
      icon: ScrollText,
      description: "How we collect, use, and protect your data.",
    },
    {
      to: "/legal/privacy",
      label: "Privacy (short)",
      icon: Shield,
      description: "Summary of how we handle your data.",
    },
    {
      to: "/legal/terms-of-service",
      label: "Terms of Service",
      icon: FileText,
      description: `The full rules and conditions for using ${brandName}.`,
    },
    {
      to: "/legal/terms",
      label: "Terms (short)",
      icon: FileText,
      description: `Summary of the rules for using ${brandName}.`,
    },
    {
      to: "/legal/cookie-policy",
      label: "Cookie Policy",
      icon: Cookie,
      description: "How we use cookies and similar technologies.",
    },
    {
      to: "/legal/dpa",
      label: "Data Processing Agreement",
      icon: Scale,
      description: "How we process personal data on your behalf.",
    },
  ];
}

const linkBaseClass =
  "group flex items-start gap-3 rounded-control border border-transparent px-3 py-3 text-sm transition-colors hover:bg-muted hover:border-border";

const linkActiveClass = "bg-muted border-border font-medium text-foreground";

const linkInactiveClass = "text-muted-foreground";

const iconBaseClass = "mt-0.5 h-4 w-4 shrink-0";

const iconActiveClass = "text-foreground";

const iconInactiveClass = "text-muted-foreground group-hover:text-foreground";

export function LegalPageShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const matchRoute = useMatchRoute();
  const legalPages = getLegalPages(useBrandName());
  const navigationRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const navigation = navigationRef.current;
    const activeLink = navigation?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!navigation || !activeLink) return;

    navigation.scrollTo({
      behavior: "smooth",
      left: activeLink.offsetLeft - (navigation.clientWidth - activeLink.offsetWidth) / 2,
    });
  }, [title]);

  return (
    <MarketingShell>
      <div className="container-marketing px-8 py-12 sm:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-14">
          <nav
            aria-label="Legal"
            className="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
          >
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:px-3">
              Legal
            </div>
            <ul
              ref={navigationRef}
              className="flex snap-x gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0"
            >
              {legalPages.map((page) => {
                const Icon = page.icon;
                const isActive = !!matchRoute({ to: page.to });
                return (
                  <li key={page.to} className="w-64 shrink-0 snap-start lg:w-auto">
                    <Link
                      to={page.to}
                      className={linkBaseClass}
                      activeProps={{ className: linkActiveClass }}
                      inactiveProps={{ className: linkInactiveClass }}
                      activeOptions={{ exact: true }}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon
                        className={`${iconBaseClass} ${isActive ? iconActiveClass : iconInactiveClass}`}
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="leading-tight">{page.label}</span>
                        <span className="text-xs leading-tight text-muted-foreground">
                          {page.description}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <article className="min-w-0 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Legal</p>
            <h1 className="mt-2 text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              {title}
            </h1>
            {subtitle && <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="legal-prose mt-10">{children}</div>
          </article>
        </div>
      </div>
    </MarketingShell>
  );
}
