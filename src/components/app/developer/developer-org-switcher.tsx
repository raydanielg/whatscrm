import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  useOrganizations,
  useActiveOrgIdValue,
  setActiveOrgId,
} from "@/hooks/use-organization";
import { resetRealtimeForOrgSwitch } from "@/lib/realtime/org-realtime";

/**
 * Compact organization switcher for the Developer Center topbars.
 *
 * Switching is fully in-app: realtime channels for the previous tenant are
 * torn down, every cached query is dropped, the active org id is written to
 * the shared tenant slot (which fires `wacrm:org-changed`), and channels
 * are re-opened for the new tenant. Mounted Developer Center queries refetch
 * on their own — no `window.location.reload()`, no route remount.
 */
export function DeveloperOrgSwitcher({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data: orgs = [], isLoading } = useOrganizations();
  const activeId = useActiveOrgIdValue();
  const [switching, setSwitching] = React.useState<string | null>(null);

  const active = orgs.find((o) => o.id === activeId) ?? orgs[0] ?? null;

  const switchTo = React.useCallback(
    async (id: string) => {
      if (!id || id === active?.id || switching) return;
      const label = orgs.find((o) => o.id === id)?.name ?? "organization";
      setSwitching(id);
      const t = toast.loading(`Switching to ${label}`);
      try {
        // 1. Silence the previous tenant's realtime before dropping caches.
        resetRealtimeForOrgSwitch("pre-switch");
        // 2. Drop in-flight + cached data so nothing from org A survives.
        await qc.cancelQueries();
        qc.removeQueries();
        qc.getMutationCache().clear();
        // 3. Flip the active tenant — reactive readers update immediately.
        setActiveOrgId(id);
        // 4. Re-open channels scoped to the new tenant and refetch mounted
        //    queries (including the ones whose keys aren't org-scoped).
        resetRealtimeForOrgSwitch("post-switch");
        await qc.refetchQueries({ type: "active" });
        toast.success(`Switched to ${label}`, { id: t });
      } catch (err) {
        toast.error("Could not switch organization", {
          id: t,
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setSwitching(null);
      }
    },
    [active?.id, orgs, qc, switching],
  );

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading orgs
      </span>
    );
  }
  if (orgs.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={!!switching}
          className={cn(
            "inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors",
            "hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
            className,
          )}
          aria-label="Switch organization"
          title="Switch organization"
        >
          {switching ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="truncate">{active?.name ?? "Organization"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Organization context
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={(e) => {
              e.preventDefault();
              void switchTo(o.id);
            }}
            className="gap-2"
          >
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            {active?.id === o.id && <Check className="h-3.5 w-3.5 text-accent" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
