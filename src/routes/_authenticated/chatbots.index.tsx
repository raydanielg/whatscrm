import { useMemo, useState } from "react";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listChatbots,
  deleteChatbot,
  restoreChatbot,
  purgeChatbot,
  duplicateChatbot,
  bulkUpdateChatbotStatus,
  upsertChatbot,
  disableInstalledChatbot,
  reEnableInstalledChatbot,
  uninstallInstalledChatbot,
  type Chatbot,
} from "@/lib/chatbots/chatbots.functions";
import {
  Bot,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  MessageSquare,
  Search,
  MoreHorizontal,
  Copy,
  Pause,
  Play,
  Undo2,
  Power,
  Pencil,
  PowerOff,
  PackageX,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import { toast } from "sonner";
import { NewChatbotDialog } from "@/components/chatbots/new-chatbot-dialog";
import {
  UninstallTemplateDialog,
  type TemplateAction,
} from "@/components/chatbots/uninstall-template-dialog";
import { useChatbotPermissions } from "@/hooks/use-chatbot-permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_authenticated/chatbots/")({
  head: () => ({
    meta: [
      { title: "AI Chatbots" },
      {
        name: "description",
        content:
          "Build no-code AI chatbots with RAG, visual flows, and human handoff across every channel.",
      },
    ],
  }),
  component: ChatbotsListPage,
});

type Tab = "active" | "trash";

function ChatbotsListPage() {
  const fmtZoned = useZonedDateFormatter();
  const ws = useCurrentWorkspace();
  const workspaceId = ws.data?.id;
  const qc = useQueryClient();
  const perms = useChatbotPermissions(workspaceId);
  const readOnly = !perms.canManage;

  const [newOpen, setNewOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{
    kind: "delete" | "restore" | "purge";
    ids: string[];
    name?: string;
  } | null>(null);
  const [renaming, setRenaming] = useState<Chatbot | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [templateAction, setTemplateAction] = useState<{
    kind: TemplateAction;
    bot: Chatbot;
  } | null>(null);

  const trashed = tab === "trash";

  const bots = useQuery({
    queryKey: ["chatbots", workspaceId, trashed, search],
    enabled: !!workspaceId,
    queryFn: () => listChatbots({ data: { workspaceId: workspaceId!, trashed, search } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["chatbots", workspaceId] });
  const clearSelection = () => setSelected(new Set());

  const remove = useMutation({
    mutationFn: (ids: string[]) => deleteChatbot({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`${r.count} chatbot(s) moved to trash`);
      invalidate();
      clearSelection();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const restore = useMutation({
    mutationFn: (ids: string[]) => restoreChatbot({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`${r.count} chatbot(s) restored`);
      invalidate();
      clearSelection();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const purge = useMutation({
    mutationFn: (ids: string[]) => purgeChatbot({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`${r.count} chatbot(s) permanently deleted`);
      invalidate();
      clearSelection();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => duplicateChatbot({ data: { id } }),
    onSuccess: () => {
      toast.success("Chatbot duplicated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: (v: { ids: string[]; status: "active" | "paused" | "draft" | "archived" }) =>
      bulkUpdateChatbotStatus({ data: v }),
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
      clearSelection();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rename = useMutation({
    mutationFn: (v: { bot: Chatbot; name: string }) =>
      upsertChatbot({ data: { id: v.bot.id, workspaceId: v.bot.workspace_id, name: v.name } }),
    onSuccess: () => {
      toast.success("Renamed");
      invalidate();
      setRenaming(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disableInstalled = useMutation({
    mutationFn: (v: { id: string; reason: string }) => disableInstalledChatbot({ data: v }),
    onSuccess: () => {
      toast.success("Template bot disabled");
      invalidate();
      setTemplateAction(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const uninstallInstalled = useMutation({
    mutationFn: (v: { id: string; reason: string }) => uninstallInstalledChatbot({ data: v }),
    onSuccess: () => {
      toast.success("Template bot uninstalled");
      invalidate();
      setTemplateAction(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reEnableInstalled = useMutation({
    mutationFn: (id: string) => reEnableInstalledChatbot({ data: { id } }),
    onSuccess: () => {
      toast.success("Template bot re-enabled");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = bots.data ?? [];
  const allSelected = rows.length > 0 && rows.every((b) => selected.has(b.id));
  const selectedIds = useMemo(
    () => rows.filter((b) => selected.has(b.id)).map((b) => b.id),
    [rows, selected],
  );
  const toggleAll = (v: boolean) => setSelected(v ? new Set(rows.map((b) => b.id)) : new Set());
  const toggleOne = (id: string, v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <>
      <AppTopbar
        title="AI Chatbots"
        subtitle="Build no-code AI chatbots for every channel"
        actions={
          <div className="flex items-center gap-2">
            <Link to="/chatbots/marketplace" search={{ share: undefined, preview: undefined }}>
              <Button size="sm" variant="outline">
                <Sparkles className="h-4 w-4 " /> Marketplace
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => setNewOpen(true)}
              disabled={!workspaceId || readOnly}
              title={
                readOnly ? "You need manager, admin, or owner role to create chatbots" : undefined
              }
            >
              <Plus className="h-4 w-4 " /> New chatbot
            </Button>
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="rounded-control border border-border bg-gradient-to-br from-primary/10 via-surface to-surface p-6">
          <div className="flex items-center gap-2 text-xs uppercase   text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Chatbot Builder
          </div>
          <h2 className="mt-2 font-bold text-xl">
            Deploy AI-powered chatbots across every channel
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Grounded in your knowledge base, powered by any AI provider, deployable to WhatsApp,
            Instagram, Messenger, Telegram and more. Human handoff built in.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as Tab);
              clearSelection();
            }}
          >
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="trash">
                <Trash2 className="h-3.5 w-3.5 " />
                Trash
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chatbots"
              className="pl-8"
            />
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">{selectedIds.length} selected</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {!trashed && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!perms.canChangeStatus}
                    onClick={() => setStatus.mutate({ ids: selectedIds, status: "active" })}
                  >
                    <Play className="h-3.5 w-3.5 " /> Activate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!perms.canChangeStatus}
                    onClick={() => setStatus.mutate({ ids: selectedIds, status: "paused" })}
                  >
                    <Pause className="h-3.5 w-3.5 " /> Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!perms.canDelete}
                    onClick={() => setConfirm({ kind: "delete", ids: selectedIds })}
                  >
                    <Trash2 className="h-3.5 w-3.5 " /> Delete
                  </Button>
                </>
              )}
              {trashed && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!perms.canManage}
                    onClick={() => setConfirm({ kind: "restore", ids: selectedIds })}
                  >
                    <Undo2 className="h-3.5 w-3.5 " /> Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!perms.canPurge}
                    onClick={() => setConfirm({ kind: "purge", ids: selectedIds })}
                  >
                    <Trash2 className="h-3.5 w-3.5 " /> Delete permanently
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => toggleAll(!!v)}
              aria-label="Select all"
            />
            <span>Select all on this page</span>
          </div>
        )}

        {bots.isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm p-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading chatbots
          </div>
        )}

        {bots.data && rows.length === 0 && (
          <div className="rounded-control border border-dashed border-border p-12 text-center">
            <Bot className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              {trashed
                ? "Trash is empty."
                : search
                  ? "No chatbots match your search."
                  : "No chatbots yet."}
            </p>
            {!trashed && !search && (
              <Button
                className="mt-4"
                onClick={() => setNewOpen(true)}
                disabled={!workspaceId || readOnly}
              >
                <Plus className="h-4 w-4 " /> Create your first chatbot
              </Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((b) => {
            const isSel = selected.has(b.id);
            return (
              <div
                key={b.id}
                className={`rounded-control border bg-surface p-5 transition-colors ${isSel ? "border-primary ring-1 ring-primary/40" : "border-border hover:border-primary/50"}`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    className="mt-1"
                    checked={isSel}
                    onCheckedChange={(v) => toggleOne(b.id, !!v)}
                    aria-label={`Select ${b.name}`}
                  />
                  {trashed ? (
                    <div className="flex-1 min-w-0">
                      <BotCardHeader bot={b} />
                    </div>
                  ) : (
                    <Link to="/chatbots/$botId" params={{ botId: b.id }} className="flex-1 min-w-0">
                      <BotCardHeader bot={b} />
                    </Link>
                  )}
                  {readOnly ? (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="p-1.5 rounded-control text-muted-foreground/50 cursor-not-allowed">
                            <MoreHorizontal className="h-4 w-4" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Read-only: manager, admin, or owner role required
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="p-1.5 rounded-control text-muted-foreground hover:bg-muted"
                          aria-label="Actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!trashed && (
                          <>
                            <DropdownMenuItem
                              disabled={!perms.canRename}
                              onClick={() => {
                                setRenaming(b);
                                setRenameValue(b.name);
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!perms.canDuplicate}
                              onClick={() => duplicate.mutate(b.id)}
                            >
                              <Copy className="h-4 w-4 mr-2" /> Duplicate
                            </DropdownMenuItem>
                            {b.status === "active" ? (
                              <DropdownMenuItem
                                disabled={!perms.canChangeStatus}
                                onClick={() => setStatus.mutate({ ids: [b.id], status: "paused" })}
                              >
                                <Pause className="h-4 w-4 mr-2" /> Pause
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                disabled={!perms.canChangeStatus}
                                onClick={() => setStatus.mutate({ ids: [b.id], status: "active" })}
                              >
                                <Play className="h-4 w-4 mr-2" /> Activate
                              </DropdownMenuItem>
                            )}
                            {b.installed_from_template_id && (
                              <>
                                <DropdownMenuSeparator />
                                {!b.disabled_at ? (
                                  <DropdownMenuItem
                                    disabled={!perms.canManage}
                                    onClick={() => setTemplateAction({ kind: "disable", bot: b })}
                                  >
                                    <PowerOff className="h-4 w-4 mr-2" /> Disable template bot
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    disabled={!perms.canManage || reEnableInstalled.isPending}
                                    onClick={() => reEnableInstalled.mutate(b.id)}
                                  >
                                    <Power className="h-4 w-4 mr-2" /> Re-enable template bot
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  disabled={!perms.canUninstallTemplate}
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setTemplateAction({ kind: "uninstall", bot: b })}
                                >
                                  <PackageX className="h-4 w-4 mr-2" /> Uninstall template bot
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={!perms.canDelete}
                              className="text-destructive focus:text-destructive"
                              onClick={() =>
                                setConfirm({ kind: "delete", ids: [b.id], name: b.name })
                              }
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                        {trashed && (
                          <>
                            <DropdownMenuItem
                              disabled={!perms.canManage}
                              onClick={() =>
                                setConfirm({ kind: "restore", ids: [b.id], name: b.name })
                              }
                            >
                              <Undo2 className="h-4 w-4 mr-2" /> Restore
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={!perms.canPurge}
                              className="text-destructive focus:text-destructive"
                              onClick={() =>
                                setConfirm({ kind: "purge", ids: [b.id], name: b.name })
                              }
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete permanently
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {b.description && (
                  <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{b.description}</p>
                )}
                <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> {b.total_sessions} sessions
                  </span>
                  <span>{b.total_messages} msgs</span>
                  {trashed && b.deleted_at && (
                    <span className="ml-auto">
                      Deleted {fmtZoned(new Date(b.deleted_at), { dateStyle: "medium" })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <NewChatbotDialog open={newOpen} onOpenChange={setNewOpen} workspaceId={workspaceId} />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={
          confirm?.kind === "delete"
            ? "Move to trash?"
            : confirm?.kind === "restore"
              ? "Restore chatbot(s)?"
              : "Delete permanently?"
        }
        description={
          confirm?.kind === "delete"
            ? `${confirm.ids.length} chatbot(s) will be moved to Trash. You can restore them later.`
            : confirm?.kind === "restore"
              ? `${confirm?.ids.length} chatbot(s) will be moved back to Active.`
              : `${confirm?.ids.length} chatbot(s) and their configuration will be permanently removed. This cannot be undone.`
        }
        destructive={confirm?.kind !== "restore"}
        confirmLabel={
          confirm?.kind === "delete"
            ? "Move to trash"
            : confirm?.kind === "restore"
              ? "Restore"
              : "Delete forever"
        }
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.kind === "delete") await remove.mutateAsync(confirm.ids);
          if (confirm.kind === "restore") await restore.mutateAsync(confirm.ids);
          if (confirm.kind === "purge") await purge.mutateAsync(confirm.ids);
          setConfirm(null);
        }}
      />

      <Dialog open={!!renaming} onOpenChange={(v) => !v && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chatbot</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Chatbot name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              disabled={!renameValue.trim() || rename.isPending}
              onClick={() => renaming && rename.mutate({ bot: renaming, name: renameValue.trim() })}
            >
              {rename.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UninstallTemplateDialog
        open={templateAction !== null}
        onOpenChange={(v) => !v && setTemplateAction(null)}
        action={templateAction?.kind ?? "disable"}
        botName={templateAction?.bot.name ?? ""}
        pending={disableInstalled.isPending || uninstallInstalled.isPending}
        onConfirm={async (reason) => {
          if (!templateAction) return;
          if (templateAction.kind === "disable") {
            await disableInstalled.mutateAsync({ id: templateAction.bot.id, reason });
          } else {
            await uninstallInstalled.mutateAsync({ id: templateAction.bot.id, reason });
          }
        }}
      />
    </>
  );
}

function BotCardHeader({ bot }: { bot: Chatbot }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-control bg-primary/10 text-primary grid place-items-center">
        <Bot className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold truncate">{bot.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge
            variant={bot.status === "active" ? "default" : "secondary"}
            className="text-xs capitalize"
          >
            {bot.status}
          </Badge>
          {bot.installed_from_template_id && (
            <Badge variant="outline" className="text-xs gap-1">
              <PackageCheck className="h-3 w-3" /> Template
            </Badge>
          )}
          {bot.disabled_at && (
            <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-500/40">
              <PowerOff className="h-3 w-3" /> Disabled
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
