import { Link } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import { useBreadcrumbs } from "@/shared/hooks/use-breadcrumbs";

/**
 * Breadcrumb trail rendered from the current route match chain.
 * Drop into any page — it reads directly from the router.
 */
export function Breadcrumbs({ homeTo = "/dashboard" }: { homeTo?: string }) {
  const crumbs = useBreadcrumbs();
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link to={homeTo} className="inline-flex items-center gap-1 hover:text-foreground">
        <Home className="w-3 h-3" />
      </Link>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${c.to ?? "group"}-${i}`} className="inline-flex items-center gap-1">
            <ChevronRight className="w-3 h-3 opacity-60" />
            {last ? (
              <span aria-current="page" className="text-foreground font-medium">{c.label}</span>
            ) : c.to ? (
              <Link to={c.to} className="hover:text-foreground">{c.label}</Link>
            ) : (
              <span className="text-muted-foreground">{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
