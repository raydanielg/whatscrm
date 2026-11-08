import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Settings2, Loader2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useWorkspaces,
  useCurrentWorkspace,
  setActiveWorkspaceId,
  useCreateWorkspace,
} from "@/hooks/use-workspace";

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { data: all = [] } = useWorkspaces();
  const { active } = useCurrentWorkspace();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const create = useCreateWorkspace();
  const navigate = useNavigate();

  const current = active ?? null;
  const label = current?.name ?? "Workspace";
  const initial = label.slice(0, 1).toUpperCase();
  const plan = current?.plan ?? "free";
  const active_ = current?.archived_at ? "archived" : plan;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim() });
      toast.success("Workspace created");
      setCreating(false);
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create workspace");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "group w-full flex items-center gap-2.5 rounded-control border border-sidebar-border/60 bg-sidebar-accent/40 text-left transition-all",
              "hover:bg-sidebar-accent/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed ? "justify-center p-1.5" : "px-2.5 py-2",
            )}
            aria-label="Switch workspace"
          >
            <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-control bg-gradient-accent font-display font-semibold text-sidebar-primary-foreground shadow-sm">
              {current?.avatar_url ? (
                <img src={current.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : initial}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-sidebar-accent-foreground">{label}</div>
                  <div className="truncate text-[11px]  text-sidebar-foreground/60">
                    {active_} {current?.archived_at ? "" : "plan"}
                  </div>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/60 transition-transform group-data-[state=open]:rotate-180" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Your workspaces</DropdownMenuLabel>
          {all.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">No workspaces yet.</div>
          )}
          {all.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onSelect={() => { setActiveWorkspaceId(w.id); toast.success(`Switched to ${w.name}`); }}
              className="gap-2"
            >
              <div className="grid h-6 w-6 place-items-center overflow-hidden rounded bg-gradient-accent text-[11px] font-semibold text-accent-foreground">
                {w.avatar_url ? <img src={w.avatar_url} alt="" className="h-full w-full object-cover" /> : w.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate">{w.name}</div>
                <div className="truncate text-[11px]  text-muted-foreground">
                  {w.archived_at ? "archived" : `${w.plan} plan`}
                </div>
              </div>
              {current?.id === w.id && <Check className="h-3.5 w-3.5 text-accent" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New workspace
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/workspace" onClick={() => navigate({ to: "/workspace" })} className="gap-2">
              <Settings2 className="h-4 w-4" /> Workspace settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Workspace name</Label>
              <Input id="ws-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Sales" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending || !name.trim()}>
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create workspace
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
