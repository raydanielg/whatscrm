import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator, CommandShortcut,
} from "@/components/ui/command";
import { useLayout } from "@/shared/contexts/layout-context";
import { useTheme } from "@/shared/providers/theme-provider";
import { NAV_ITEMS, NAV_GROUPS, navKey } from "./nav-config";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { isRouteEnabled } from "@/lib/admin/platform-features";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Moon, Sun, Monitor, PanelLeftClose, User, Building2, Target, DollarSign, CheckSquare, ArrowRight } from "lucide-react";
import { useCrmSearch, type SearchEntity } from "@/hooks/use-crm-search";

const ENTITY_ICON: Record<SearchEntity, React.ComponentType<{ className?: string }>> = {
  contact: User, company: Building2, lead: Target, deal: DollarSign, task: CheckSquare,
};
const ENTITY_LABEL: Record<SearchEntity, string> = {
  contact: "Contacts", company: "Companies", lead: "Leads", deal: "Deals", task: "Tasks",
};
const ENTITY_ROUTE: Record<SearchEntity, (id: string) => string> = {
  contact: (id) => `/contacts/${id}`,
  company: (id) => `/companies/${id}`,
  lead: (id) => `/leads/${id}`,
  deal: () => `/deals`,
  task: () => `/dashboard`,
};

export function CommandPalette() {
  const { commandOpen, setCommandOpen, toggleSidebar } = useLayout();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setTheme } = useTheme();
  const [q, setQ] = useState("");
  const { config: platform } = usePlatformRuntime();
  const { data: results, isFetching } = useCrmSearch(q);

  function run(fn: () => void | Promise<void>) {
    setCommandOpen(false);
    setQ("");
    void fn();
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const hasHits = results && (Object.keys(results) as SearchEntity[]).some((e) => (results[e] ?? []).length > 0);

  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
      <CommandInput placeholder="Search contacts, companies, leads, deals" value={q} onValueChange={setQ} />
      <CommandList className="max-h-[70vh]">
        <CommandEmpty>{q.length < 2 ? "Type to search" : isFetching ? "Searching" : "No results found."}</CommandEmpty>

        {q.length >= 2 && hasHits && (
          <>
            {(Object.keys(ENTITY_LABEL) as SearchEntity[]).map((e) => {
              const hits = results?.[e] ?? [];
              if (!hits.length) return null;
              const Icon = ENTITY_ICON[e];
              return (
                <CommandGroup key={e} heading={ENTITY_LABEL[e]}>
                  {hits.map((h) => (
                    <CommandItem
                      key={`${e}:${h.id}`}
                      value={`${e} ${h.title} ${h.subtitle ?? ""} ${h.extra ?? ""}`}
                      onSelect={() => run(() => navigate({ to: ENTITY_ROUTE[e](h.id) }))}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{h.title}</div>
                        {(h.subtitle || h.extra) && (
                          <div className="truncate text-xs text-muted-foreground">
                            {[h.subtitle, h.extra].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            <CommandItem value={`__see-all ${q}`} onSelect={() => run(() => navigate({ to: "/search", search: { q } as never }))}>
              <ArrowRight className="h-4 w-4" /> See all results for "{q}"
            </CommandItem>
            <CommandSeparator />
          </>
        )}

        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((n) => n.group === group.id).filter((n) => isRouteEnabled(platform.features, n.to));
          if (!items.length) return null;
          return (
            <CommandGroup key={group.id} heading={group.label}>
              {items.map((item) => (
                <CommandItem
                  key={navKey(item)}
                  value={`${group.label} ${item.label}`}
                  onSelect={() =>
                    item.external
                      ? run(() => { window.open(item.to, "_blank", "noopener,noreferrer"); })
                      : run(() => navigate({ to: item.to }))
                  }
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        <CommandSeparator />

        <CommandGroup heading="Preferences">
          <CommandItem onSelect={() => run(() => toggleSidebar())}>
            <PanelLeftClose className="h-4 w-4" /> Toggle sidebar
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("light"))}>
            <Sun className="h-4 w-4" /> Light theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("dark"))}>
            <Moon className="h-4 w-4" /> Dark theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("system"))}>
            <Monitor className="h-4 w-4" /> System theme
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Account">
          <CommandItem onSelect={() => run(signOut)} className="text-destructive">
            <LogOut className="h-4 w-4" /> Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
