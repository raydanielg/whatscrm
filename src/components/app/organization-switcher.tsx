import * as React from "react";
import { Check, ChevronsUpDown, Plus, Building2, Loader2, AlertCircle, RefreshCw, Settings2, Layers } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Organization } from "@/shared/hooks/use-active-organization";

export type SwitcherWorkspace = {
  id: string;
  name: string;
  organizationId?: string | null;
  plan?: string | null;
  avatarUrl?: string | null;
  archived?: boolean;
  organizationName?: string | null;
};

/**
 * OrganizationSwitcher — top-level tenant switcher. Distinct from
 * WorkspaceSwitcher (workspace = a project inside an org). Renders a
 * searchable dropdown with avatar, org name, plan pill, and role.
 *
 * Accessibility:
 * - Trigger is a native <button> with `aria-haspopup="listbox"` +
 *   `aria-expanded` so screen readers announce the collapsed/expanded
 *   state of the popover.
 * - A visually-hidden `aria-live="polite"` region announces switching
 *   progress and completion (name changes) without stealing focus.
 * - Errors render in a `role="alert"` region and auto-focus the Retry
 *   button so keyboard users don't need to hunt for the recovery path.
 * - When a switch finishes, focus is returned to the trigger button so
 *   the user's keyboard context is preserved.
 */
export function OrganizationSwitcher({
  organizations,
  activeId,
  onSelect,
  onCreate,
  collapsed = false,
  className,
  loading = false,
  switching = false,
  switchingId = null,
  switchPhase = null,
  error = null,
  onRetry,
  workspaces = [],
  activeWorkspaceId = null,
  onSelectWorkspace,
  onCreateWorkspace,
}: {
  organizations: Organization[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate?: () => void;
  collapsed?: boolean;
  className?: string;
  loading?: boolean;
  switching?: boolean;
  switchingId?: string | null;
  /**
   * Which phase of the switch pipeline is currently running. Drives the
   * tooltip copy and the visible progress indicator so the user knows
   * *why* the switcher is disabled at any moment during quiescence.
   */
  switchPhase?: "clearing" | "settling" | "loading" | "finalizing" | null;
  error?: Error | null;
  onRetry?: () => void;
  /** Workspaces belonging to the current organization. */
  workspaces?: SwitcherWorkspace[];
  activeWorkspaceId?: string | null;
  onSelectWorkspace?: (id: string) => void;
  onCreateWorkspace?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const retryRef = React.useRef<HTMLButtonElement | null>(null);
  const listboxId = React.useId();

  const active = organizations.find((o) => o.id === activeId) ?? organizations[0];
  const switchingTarget = switching
    ? organizations.find((o) => o.id === switchingId)?.name ?? "organization"
    : null;

  // Announce switch lifecycle transitions through a polite live region.
  const [announcement, setAnnouncement] = React.useState("");
  const prevSwitching = React.useRef(switching);
  const prevActiveName = React.useRef(active?.name);
  React.useEffect(() => {
    if (switching && !prevSwitching.current) {
      setAnnouncement(`Switching to ${switchingTarget ?? "organization"}. Please wait.`);
    } else if (!switching && prevSwitching.current) {
      // Switch just finished — announce the new active org and return focus
      // to the trigger so keyboard users resume where they left off.
      if (active?.name) {
        setAnnouncement(`Active organization is now ${active.name}.`);
      }
      // Only reclaim focus if focus was lost to <body> (Popover close /
      // command dismissal). Never steal focus from a user-focused element.
      if (typeof document !== "undefined" && document.activeElement === document.body) {
        triggerRef.current?.focus();
      }
    }
    prevSwitching.current = switching;
    prevActiveName.current = active?.name;
  }, [switching, switchingTarget, active?.name]);

  // Focus the Retry button when an error appears so recovery is one keystroke away.
  React.useEffect(() => {
    if (error && retryRef.current) {
      retryRef.current.focus();
    }
  }, [error]);

  // Skeleton while the org list is loading.
  if (loading) {
    return (
      <div
        className={cn(
          "w-full flex items-center gap-2 rounded-control border border-sidebar-border/50 bg-sidebar-accent/20",
          collapsed ? "h-9 justify-center p-1.5" : "h-12 px-2",
          className,
        )}
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <Skeleton className={cn("shrink-0 rounded-control", collapsed ? "h-8 w-8" : "h-8 w-8")} aria-hidden="true" />
        {!collapsed && (
          <div className="flex-1 min-w-0 space-y-1.5" aria-hidden="true">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 w-16" />
          </div>
        )}
        <span className="sr-only">Loading organizations</span>
      </div>
    );
  }

  // Inline error with retry.
  if (error) {
    return (
      <div
        className={cn(
          "w-full flex items-center gap-2 rounded-control border border-destructive/40 bg-destructive/10 text-destructive",
          collapsed ? "h-9 justify-center p-1.5" : "h-12 px-2",
          className,
        )}
        role="alert"
        aria-live="assertive"
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {collapsed ? (
          <span className="sr-only">Couldn't load organizations. {error.message}</span>
        ) : (
          <>
            <span className="flex-1 min-w-0 truncate text-label-md text-xs">
              Couldn't load orgs
              <span className="sr-only">: {error.message}</span>
            </span>
            {onRetry && (
              <Button
                ref={retryRef}
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:bg-destructive/20"
                onClick={onRetry}
                aria-label="Retry loading organizations"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          </>
        )}
      </div>
    );
  }

  if (!active) return null;
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  // Human-readable phase copy for both the tooltip and the caption row.
  // Aligns with the switch handler's pipeline: cancel/purge → wait for
  // quiescence → flip active id → wait for the new tenant's initial load.
  const phaseCopy: Record<NonNullable<typeof switchPhase>, { title: string; hint: string }> = {
    clearing: {
      title: "Clearing cached data",
      hint: "Cancelling in-flight requests and purging the previous org's cache.",
    },
    settling: {
      title: "Waiting for background requests",
      hint: "Letting outstanding queries and mutations quiesce before switching.",
    },
    loading: {
      title: `Loading ${switchingTarget ?? "organization"}`,
      hint: "Fetching the new organization's data over refreshed realtime channels.",
    },
    finalizing: {
      title: "Reconnecting realtime",
      hint: "Reopening realtime channels scoped to the new org.",
    },
  };
  const currentPhase = switching ? (switchPhase ?? "settling") : null;
  const tooltipTitle = currentPhase
    ? phaseCopy[currentPhase].title
    : "Switch organization";
  const tooltipHint = currentPhase
    ? phaseCopy[currentPhase].hint
    : "Choose a different organization or workspace.";

  return (
    <>
      {/* Polite live region — off-screen, doesn't steal focus. */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <Popover open={open} onOpenChange={(v) => !switching && setOpen(v)}>
        <TooltipProvider delayDuration={switching ? 0 : 400}>
          <Tooltip open={switching ? true : undefined}>
            <PopoverTrigger asChild>
              <TooltipTrigger asChild>
                {/*
                  Wrap the disabled trigger in a span so pointer events still
                  reach the tooltip while the button itself is disabled.
                  The span mirrors the button's block-level layout so the
                  progress bar below stays flush with the sidebar column.
                */}
                <span className="block w-full">
                  <button
                    ref={triggerRef}
                    type="button"
                    className={cn(
                      "group w-full flex items-center gap-2 rounded-control border border-sidebar-border bg-sidebar-foreground/5 hover:bg-sidebar-foreground/10 text-sidebar-foreground transition-all",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      "disabled:opacity-70 disabled:cursor-progress",
                      collapsed ? "h-11 justify-center p-1.5" : "h-12 px-2",
                      className,
                    )}
                    disabled={switching}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-controls={open ? listboxId : undefined}
                    aria-busy={switching || undefined}
                    aria-describedby={switching ? `${listboxId}-switch-status` : undefined}
                    aria-label={
                      switching
                        ? `Switching to ${switchingTarget ?? "organization"}. ${tooltipHint}`
                        : `Current organization: ${active.name}. Activate to switch organization.`
                    }
                  >
                    <div className="relative shrink-0">
                      <Avatar className={cn("rounded-control", collapsed ? "h-8 w-8" : "h-8 w-8", switching && "opacity-40")}>
                        {active.avatarUrl && <AvatarImage src={active.avatarUrl} alt="" />}
                        <AvatarFallback className="rounded-control bg-gradient-accent text-accent-foreground text-xs font-semibold" aria-hidden="true">
                          {active.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {switching && (
                        <Loader2
                          className="absolute inset-0 m-auto h-4 w-4 animate-spin text-sidebar-foreground"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    {!collapsed && (
                      <>
                        <span className="flex-1 min-w-0 text-left animate-fade-in" aria-hidden="true">
                          <span className="block truncate text-label-md text-xs">
                            {switching ? "Switching" : active.name}
                          </span>
                          <span className="block truncate text-[11px] text-sidebar-foreground/75">
                            {switching
                              ? phaseCopy[currentPhase ?? "settling"].title
                              : activeWorkspace
                                ? `${activeWorkspace.name} · ${active.role ?? "member"}`
                                : `${active.plan ?? "Free"} · ${active.role ?? "member"}`}
                          </span>
                        </span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60 transition-transform" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </span>
              </TooltipTrigger>
            </PopoverTrigger>
            <TooltipContent
              side={collapsed ? "right" : "bottom"}
              align="start"
              className="max-w-64"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">{tooltipTitle}</span>
                <span className="pt-0.5 text-white/80 text-xs">{tooltipHint}</span>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/*
          Indeterminate progress rail under the trigger. Renders only while
          switching and only when the sidebar is expanded — collapsed mode
          keeps the trigger compact and relies on the spinner + tooltip.
        */}
        {switching && !collapsed && (
          <div
            id={`${listboxId}-switch-status`}
            role="status"
            aria-live="polite"
            className="mt-1 h-1 w-full overflow-hidden rounded-full bg-sidebar-accent/40"
          >
            <div
              className="h-full w-1/3 animate-[progress-indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-primary/80"
              aria-hidden="true"
            />
            <span className="sr-only">{tooltipTitle}</span>
          </div>
        )}
        <PopoverContent
          id={listboxId}
          className="w-72 p-0 animate-scale-in origin-top-left"
          align="start"
          sideOffset={8}
          aria-label="Organizations and workspaces"
        >
          <Command loop>
            <CommandInput placeholder="Search organizations" aria-label="Search organizations" />
            <CommandList>
              <CommandEmpty>No organizations found.</CommandEmpty>
              <CommandGroup heading="Organizations">
                {organizations.map((o) => {
                  const isActive = o.id === active.id;
                  const isSwitchingRow = switching && switchingId === o.id;
                  return (
                    <CommandItem
                      key={o.id}
                      value={o.name}
                      disabled={switching}
                      aria-current={isActive ? "true" : undefined}
                      aria-label={`${o.name}${isActive ? ", current organization" : ""}${isSwitchingRow ? ", switching" : ""}`}
                      onSelect={() => { if (switching) return; onSelect(o.id); setOpen(false); }}
                      className="gap-2 aria-disabled:opacity-60"
                    >
                      <Avatar className="h-10 w-10 rounded-full" aria-hidden="true">
                        {o.avatarUrl && <AvatarImage src={o.avatarUrl} alt="" />}
                        <AvatarFallback className="rounded-full bg-muted text-[12px] font-semibold">
                          {o.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-label-md text-xs">{o.name}</div>
                        <div className="truncate text-[12px] text-muted-foreground">
                          {o.plan ?? "Free"}
                        </div>
                      </div>
                      {isSwitchingRow ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                          <span className="sr-only">Switching</span>
                        </>
                      ) : (
                        <>
                          <Check className={cn("h-4 w-4", isActive ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                          {isActive && <span className="sr-only">Current organization</span>}
                        </>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {workspaces.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Workspaces">
                    {workspaces.map((w) => {
                      const isActiveWs = w.id === activeWorkspaceId;
                      return (
                        <CommandItem
                          key={w.id}
                          value={`ws:${w.name}`}
                          disabled={switching || w.archived || !w.organizationId}
                          aria-current={isActiveWs ? "true" : undefined}
                          aria-label={`${w.name}${w.archived ? ", archived" : ""}${!w.organizationId ? ", not linked to an organization" : ""}${isActiveWs ? ", current workspace" : ""}`}
                          onSelect={() => { if (switching || w.archived || !w.organizationId || !onSelectWorkspace) return; onSelectWorkspace(w.id); setOpen(false); }}
                          className="gap-2 aria-disabled:opacity-60"
                        >
                          <Avatar className="h-10 w-10 rounded-full" aria-hidden="true">
                            {w.avatarUrl && <AvatarImage src={w.avatarUrl} alt="" />}
                            <AvatarFallback className="rounded-full bg-muted text-[11px] font-semibold">
                              {w.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="truncate text-label-md text-xs">{w.name}</div>
                            <div className="truncate text-[12px] text-muted-foreground">
                              {w.organizationName ? `${w.organizationName} · ` : ""}
                              {w.archived ? "archived" : !w.organizationId ? "Not linked to an organization" : "Workspace"}
                            </div>
                          </div>
                          <Check className={cn("h-4 w-4", isActiveWs ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                          {isActiveWs && <span className="sr-only">Current workspace</span>}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
              <CommandSeparator />
              <CommandGroup>
                {onCreate && (
                  <CommandItem
                    disabled={switching}
                    onSelect={() => { if (switching) return; onCreate(); setOpen(false); }}
                    className="gap-2 text-primary aria-disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create organization
                  </CommandItem>
                )}
                {onCreateWorkspace && (
                  <CommandItem
                    disabled={switching}
                    onSelect={() => { if (switching) return; onCreateWorkspace(); setOpen(false); }}
                    className="gap-2 aria-disabled:opacity-60"
                  >
                    <Layers className="h-4 w-4" aria-hidden="true" />
                    New workspace
                  </CommandItem>
                )}
                <CommandItem asChild className="gap-2">
                  <Link to="/workspace" onClick={() => setOpen(false)}>
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                    Workspace settings
                  </Link>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

OrganizationSwitcher.Icon = Building2;
