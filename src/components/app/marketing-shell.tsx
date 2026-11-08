import { Brand, BrandWordmark, PlatformLogo } from "@/components/brand";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { openCookiePreferences } from "@/lib/compliance/cookie-consent";

export function MarketingShell({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigationLinks = [
    { to: "/", label: "Home" },
    { to: "/features", label: "Features" },
    { to: "/pricing", label: "Pricing" },
    { to: "/about", label: "About" },
    { to: "/contact", label: "Contact" },
  ] as const;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="container-marketing flex h-18 items-center justify-between gap-3 py-0!">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <PlatformLogo alt="" className="size-6 shrink-0 object-contain" />
            <BrandWordmark className="brand-wordmark min-w-0 truncate text-xl" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <Link
              to="/"
              activeProps={{ className: "text-foreground" }}
              className="hover:text-foreground"
            >
              Home
            </Link>
            <Link
              to="/features"
              activeProps={{ className: "text-foreground" }}
              className="hover:text-foreground"
            >
              Features
            </Link>
            <Link
              to="/pricing"
              activeProps={{ className: "text-foreground" }}
              className="hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              to="/about"
              activeProps={{ className: "text-foreground" }}
              className="hover:text-foreground"
            >
              About
            </Link>
            <Link
              to="/contact"
              activeProps={{ className: "text-foreground" }}
              className="hover:text-foreground"
            >
              Contact
            </Link>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="marketing-mobile-navigation"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="md:hidden grid h-9 w-9 place-items-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link
              to="/auth"
              className="hidden sm:inline-flex text-sm font-medium border border-input bg-background text-foreground px-3 py-1.5 rounded-control hover:bg-muted"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              className="text-sm font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-control hover:bg-primary/90"
            >
              Get started
            </Link>
          </div>
        </div>
        {mobileMenuOpen && (
          <nav
            id="marketing-mobile-navigation"
            aria-label="Mobile navigation"
            className="md:hidden border-t border-border bg-background px-4 py-3"
          >
            <div className="container-marketing flex flex-col gap-1">
              {navigationLinks.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  activeProps={{ className: "text-foreground bg-muted" }}
                  className="rounded-control px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {label}
                </Link>
              ))}
              <Link
                to="/auth"
                className="rounded-control px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign in
              </Link>
            </div>
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-primary">
        <div className="container-marketing flex flex-col items-center justify-between gap-4 py-10 border-white/5 text-sm text-white/70 md:flex-row">
          <span>
            &copy; {new Date().getFullYear()} <Brand />
          </span>
          <div className="flex items-center gap-4 flex-wrap justify-center text-white/80">
            <Link to="/legal/privacy-policy" className="hover:text-white">
              Privacy Policy
            </Link>
            <Link to="/legal/terms-of-service" className="hover:text-white">
              Terms of Service
            </Link>
            <Link to="/legal/cookie-policy" className="hover:text-white">
              Cookies
            </Link>
            <Link to="/legal/dpa" className="hover:text-white">
              DPA
            </Link>
            <button
              type="button"
              onClick={() => openCookiePreferences()}
              className="hover:text-white"
            >
              Cookie preferences
            </button>

            <Link to="/contact" className="hover:text-white">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
