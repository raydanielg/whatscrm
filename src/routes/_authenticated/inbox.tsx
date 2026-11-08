import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Keyboard, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConversationList } from "@/components/app/inbox/conversation-list";
import type { ConversationListAction } from "@/components/app/inbox/conversation-list-item";
import { ChannelIcon } from "@/components/app/inbox/channel-icon";
import { useChannelAccounts } from "@/hooks/use-channel-accounts";
import { normalizeChannelAccounts } from "@/lib/inbox/account-sync";
import { ConversationWindow } from "@/components/app/inbox/conversation-window";
import { ConversationHeader } from "@/components/app/inbox/conversation-header";
import { LinkContactDialog } from "@/components/app/inbox/link-contact-dialog";
import { ConversationDiagnosticsDrawer } from "@/components/app/inbox/conversation-diagnostics-drawer";
import { CustomerProfileSidebar } from "@/components/app/inbox/customer-profile-sidebar";
import { CollaborationPanel } from "@/components/app/inbox/collaboration-panel";
import { AssignmentSlaPanel } from "@/components/app/inbox/assignment-sla-panel";
import { ConversationIntelligencePanel } from "@/components/app/inbox/conversation-intelligence-panel";
import { InboxWorkPanel } from "@/components/app/inbox/inbox-work-panel";
import { InboxViewMenu } from "@/components/app/inbox/inbox-view-menu";
import { HandoffQueuePanel } from "@/components/app/inbox/handoff-queue-panel";
import { useAgentHeartbeat } from "@/hooks/use-handoff";
import { useInboxCacheReset } from "@/hooks/use-inbox-cache-reset";
import { useLivechatBackfill } from "@/hooks/use-livechat-backfill";
import { supabase } from "@/integrations/supabase/client";
import {
  INBOX_VIEWS,
  readSavedInboxView,
  viewToFilter,
  writeSavedInboxView,
  type InboxView,
} from "@/lib/inbox/inbox-views";
import { conversationMatchesScope } from "@/lib/inbox/conversation-scope";

import { KeyboardShortcutsDialog } from "@/components/app/inbox/keyboard-shortcuts-dialog";

import { RealtimeStatusIndicator } from "@/components/app/inbox/realtime-status-indicator";
import { useInboxKeyboardShortcuts } from "@/hooks/use-inbox-shortcuts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ConversationRow } from "@/hooks/use-conversations";
import {
  useToggleStar,
  useToggleMetaFlag,
  useUpdateConversation,
  useMarkAsUnread,
} from "@/hooks/use-conversations";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { isInboundSoundEnabled, setInboundSoundEnabled } from "@/lib/notifications/inbound-sound";

const isInitialDesktop = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches;

export const Route = createFileRoute("/_authenticated/inbox")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    conversationId?: string;
    view?: InboxView;
    account?: string;
    q?: string;
    channels?: string;
  } => {
    const out: {
      conversationId?: string;
      view?: InboxView;
      account?: string;
      q?: string;
      channels?: string;
    } = {};
    if (typeof search.conversationId === "string") out.conversationId = search.conversationId;
    if (typeof search.view === "string" && INBOX_VIEWS.includes(search.view as InboxView)) {
      out.view = search.view as InboxView;
    }
    if (typeof search.account === "string" && search.account) out.account = search.account;
    if (typeof search.q === "string" && search.q.trim()) out.q = search.q.slice(0, 200);
    if (typeof search.channels === "string" && search.channels.trim()) {
      out.channels = search.channels.slice(0, 200);
    }
    return out;
  },

  component: InboxPage,
});

type SidePanel = "customer" | "team" | "sla" | "intel" | "work" | null;

// INBOX_VIEWS / view persistence live in "@/lib/inbox/inbox-views" so
// `validateSearch` (shared chunk) and the component (split chunk) share them.

/** Persisted last-open conversation, scoped per workspace. */
const conversationKey = (workspaceId: string) => `wacrm.inbox.conversation.${workspaceId}`;

function clearAllSavedConversationIds() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("wacrm.inbox.conversation.")) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* private mode / quota */
  }
}

function readSavedConversationId(workspaceId: string | undefined | null): string | null {
  if (typeof window === "undefined" || !workspaceId) return null;
  try {
    return window.localStorage.getItem(conversationKey(workspaceId));
  } catch {
    return null;
  }
}

function writeSavedConversationId(workspaceId: string | undefined | null, id: string | null) {
  if (typeof window === "undefined" || !workspaceId) return;
  try {
    if (id) window.localStorage.setItem(conversationKey(workspaceId), id);
    else window.localStorage.removeItem(conversationKey(workspaceId));
  } catch {
    /* private mode / quota */
  }
}

function SelectedAccountBadge() {
  const navigate = useNavigate({ from: "/inbox" });
  const { active } = useCurrentWorkspace();
  const accountId = Route.useSearch({ select: (s) => s.account });
  const { data } = useChannelAccounts(active?.id);
  // Only accounts that passed provider validation may drive inbox state.
  const { accounts } = normalizeChannelAccounts<{
    id: string;
    display_name: string;
    phone_number: string | null;
    provider: string;
  }>(data);
  const account = accountId ? accounts.find((a) => a.id === accountId) : null;
  if (!account) return null;
  const channel = account.channel;

  return (
    <Badge
      variant="secondary"
      className="hidden sm:inline-flex gap-1.5 pl-1.5 pr-1 py-1 text-xs font-medium"
    >
      <ChannelIcon
        channel={channel}
        boxed
        className="h-3.5 w-3.5 rounded-full"
        iconClassName="h-full w-full"
      />
      <span className="max-w-[120px] truncate">{account.display_name}</span>
      <button
        type="button"
        onClick={() =>
          navigate({
            search: (prev: Record<string, unknown>) => ({ ...prev, account: undefined }),
            replace: true,
          })
        }
        className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
        aria-label="Clear account filter"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

function InboxPage() {
  const [selected, setSelected] = useState<ConversationRow | null>(null);
  const [panel, setPanel] = useState<SidePanel>(null);
  const [compactPanelOpen, setCompactPanelOpen] = useState(false);
  const compactPanelRequestedRef = useRef(false);
  const navigate = useNavigate({ from: "/inbox" });
  const { active: activeWorkspace } = useCurrentWorkspace();
  const workspaceId = activeWorkspace?.id;
  const searchView = Route.useSearch({ select: (s) => s.view });
  const view: InboxView = searchView ?? "all";
  // Keep the URL, storage and workspace in sync: restore the saved chip for the
  // active workspace, and drop a stale chip when switching workspaces.
  const viewSyncedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!workspaceId) return;
    const isSameWorkspace = viewSyncedForRef.current === workspaceId;
    const isSwitch = viewSyncedForRef.current !== null && !isSameWorkspace;
    if (isSameWorkspace) {
      // Same workspace: persist whatever the URL currently says (shareable links win).
      writeSavedInboxView(workspaceId, view);
      return;
    }
    viewSyncedForRef.current = workspaceId;
    const saved = readSavedInboxView(workspaceId);
    if (isSwitch) {
      // Workspace switch: replace the previous workspace's chip with this one's.
      const next = saved && saved !== "all" ? saved : undefined;
      if (next !== searchView) {
        navigate({
          search: (prev: Record<string, unknown>) => ({ ...prev, view: next }),
          replace: true,
        });
      }
      return;
    }
    // First load: URL wins, otherwise restore from storage.
    if (searchView) {
      writeSavedInboxView(workspaceId, searchView);
    } else if (saved && saved !== "all") {
      navigate({
        search: (prev: Record<string, unknown>) => ({ ...prev, view: saved }),
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, view]);
  const setView = (v: InboxView) => {
    writeSavedInboxView(workspaceId, v);
    if (v !== view) {
      setSelected(null);
      writeSavedConversationId(workspaceId, null);
    }
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        conversationId: undefined,
        view: v === "all" ? undefined : v,
      }),
    });
  };

  const [listOpen, setListOpen] = useState(true);
  const [isDesktop, setIsDesktop] = useState(() => isInitialDesktop());
  const [linkContactOpen, setLinkContactOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  useEffect(() => {
    // Keep this in sync with the inline side panel's `xl:*` classes.
    // The list/detail split starts at 992px; side panels stay in a Sheet until 1280px.
    const mql = window.matchMedia("(min-width: 1280px)");
    const update = () => {
      setIsDesktop(mql.matches);
      if (!mql.matches) {
        compactPanelRequestedRef.current = false;
        setCompactPanelOpen(false);
      }
    };
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  // Drop every cached conversation/thread the moment the workspace or the
  // signed-in user changes, so stale threads never linger in the Inbox.
  useInboxCacheReset({
    onReset: () => {
      setSelected(null);
      setDiagnosticsOpen(false);
      clearAllSavedConversationIds();
      setLinkContactOpen(false);
    },
  });
  // Link legacy widget sessions (created before the inbox bridge) once per workspace.
  useLivechatBackfill();
  useAgentHeartbeat();
  const toggleStar = useToggleStar();
  const toggleFlag = useToggleMetaFlag();
  const updateConv = useUpdateConversation();
  const markUnread = useMarkAsUnread();

  const readMeta = (c: ConversationRow) => (c.metadata ?? {}) as Record<string, unknown>;
  const isFlag = (m: Record<string, unknown>, k: string) => m[k] === true || m[k] === "true";

  const handleStar = () => {
    if (!selected) return;
    const meta = readMeta(selected);
    toggleStar.mutate(
      { id: selected.id, metadata: meta, starred: !isFlag(meta, "starred") },
      { onSuccess: () => toast.success(isFlag(meta, "starred") ? "Unstarred" : "Starred") },
    );
  };
  const handlePin = () => {
    if (!selected) return;
    const meta = readMeta(selected);
    const next = !isFlag(meta, "pinned");
    toggleFlag.mutate(
      { id: selected.id, metadata: meta, key: "pinned", value: next },
      { onSuccess: () => toast.success(next ? "Pinned to top" : "Unpinned") },
    );
  };
  const handleMute = () => {
    if (!selected) return;
    const meta = readMeta(selected);
    const next = !isFlag(meta, "muted");
    toggleFlag.mutate(
      { id: selected.id, metadata: meta, key: "muted", value: next },
      { onSuccess: () => toast.success(next ? "Notifications muted" : "Notifications on") },
    );
  };
  const handleMarkUnread = () => {
    if (!selected) return;
    const conversation = selected;
    markUnread.mutate(conversation, {
      onSuccess: () => toast.success("Marked unread"),
      onError: (error) => toast.error(error.message || "Could not mark unread"),
    });
    // Keep the flag visible in the list. Leaving the thread also prevents its
    // normal on-open read effect from immediately clearing the user's action.
    setSelected(null);
    writeSavedConversationId(active?.id, null);
  };
  const handleResolve = () => {
    if (!selected) return;
    const resolving = selected.status !== "resolved";
    updateConv.mutate(
      {
        id: selected.id,
        patch: resolving
          ? { status: "resolved", resolved_at: new Date().toISOString() }
          : { status: "open", resolved_at: null },
      },
      { onSuccess: () => toast.success(resolving ? "Marked as resolved" : "Reopened") },
    );
  };
  const handleArchive = () => {
    if (!selected) return;
    const next = !selected.is_archived;
    updateConv.mutate(
      { id: selected.id, patch: { is_archived: next } },
      { onSuccess: () => toast.success(next ? "Archived" : "Unarchived") },
    );
  };
  const handleSpam = () => {
    if (!selected) return;
    const meta = readMeta(selected);
    const next = !isFlag(meta, "spam");
    toggleFlag.mutate(
      { id: selected.id, metadata: meta, key: "spam", value: next },
      { onSuccess: () => toast.success(next ? "Marked as spam" : "Not spam") },
    );
  };
  const handleTrash = () => {
    if (!selected) return;
    updateConv.mutate(
      { id: selected.id, patch: { deleted_at: new Date().toISOString() } },
      {
        onSuccess: () => {
          toast.success("Moved to trash");
          setSelected(null);
          writeSavedConversationId(active?.id, null);
        },
      },
    );
  };
  const handleAssign = () => togglePanel("sla");

  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const handleSelectConversation = (conversation: ConversationRow) => {
    setSelected(conversation);
    writeSavedConversationId(active?.id, conversation.id);
    if (!isDesktop) {
      compactPanelRequestedRef.current = false;
      setCompactPanelOpen(false);
      setPanel(null);
    }
  };

  const handleListAction = (conversation: ConversationRow, action: ConversationListAction) => {
    const metadata = readMeta(conversation);
    const reportError = (error: Error) => toast.error(error.message || "Could not update conversation");
    switch (action) {
      case "open":
        handleSelectConversation(conversation);
        break;
      case "unread":
        markUnread.mutate(conversation, {
          onSuccess: () => toast.success("Marked unread"),
          onError: reportError,
        });
        if (selected?.id === conversation.id) {
          setSelected(null);
          writeSavedConversationId(active?.id, null);
        }
        break;
      case "star": {
        const next = !isFlag(metadata, "starred");
        toggleStar.mutate(
          { id: conversation.id, metadata, starred: next },
          { onSuccess: () => toast.success(next ? "Starred" : "Unstarred"), onError: reportError },
        );
        break;
      }
      case "pin": {
        const next = !isFlag(metadata, "pinned");
        toggleFlag.mutate(
          { id: conversation.id, metadata, key: "pinned", value: next },
          { onSuccess: () => toast.success(next ? "Pinned to top" : "Unpinned"), onError: reportError },
        );
        break;
      }
      case "resolve": {
        const next = conversation.status !== "resolved";
        updateConv.mutate(
          { id: conversation.id, patch: next ? { status: "resolved", resolved_at: new Date().toISOString() } : { status: "open", resolved_at: null } },
          { onSuccess: () => toast.success(next ? "Marked as resolved" : "Reopened"), onError: reportError },
        );
        break;
      }
      case "archive": {
        const next = !conversation.is_archived;
        updateConv.mutate(
          { id: conversation.id, patch: { is_archived: next } },
          { onSuccess: () => toast.success(next ? "Archived" : "Unarchived"), onError: reportError },
        );
        break;
      }
    }
  };

  // Restore the last open conversation thread for this workspace.
  const restoredForRef = useRef<string | null>(null);
  useEffect(() => {
    const workspaceId = active?.id;
    if (!workspaceId || restoredForRef.current === workspaceId) return;
    restoredForRef.current = workspaceId;
    const savedId = readSavedConversationId(workspaceId);
    if (!savedId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", savedId)
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        writeSavedConversationId(workspaceId, null);
        return;
      }
      setSelected((current) => current ?? (data as unknown as ConversationRow));
    })();
    return () => {
      cancelled = true;
    };
  }, [active?.id]);

  // Deep link from a notification or the handoff queue (`/inbox?conversationId=`):
  // open that thread, then drop the param so a refresh doesn't re-open it.
  const deepLinkId = Route.useSearch({ select: (s) => s.conversationId });
  useEffect(() => {
    if (!deepLinkId || !workspaceId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", deepLinkId)
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        setSelected(data as unknown as ConversationRow);
        writeSavedConversationId(workspaceId, deepLinkId);
      }
      navigate({
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          conversationId: undefined,
          view: undefined,
        }),
        replace: true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [deepLinkId, workspaceId]);

  // Keep the open thread's row fresh (assignment, status, priority, SLA) so
  // side panels never render a stale snapshot after a mutation.
  const selectedId = selected?.id;
  const { data: freshSelected } = useQuery({
    queryKey: ["conversation", workspaceId, selectedId],
    enabled: !!selectedId && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", selectedId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as ConversationRow | null;
    },
  });
  useEffect(() => {
    if (!freshSelected) return;
    setSelected((current) =>
      current && current.id === freshSelected.id ? { ...current, ...freshSelected } : current,
    );
  }, [freshSelected]);

  const togglePanel = (nextPanel: Exclude<SidePanel, null>) => {
    setPanel((current) => {
      const isSame = current === nextPanel;
      if (!isDesktop) {
        const nextOpen = !isSame || !compactPanelOpen;
        compactPanelRequestedRef.current = nextOpen;
        setCompactPanelOpen(nextOpen);
      }
      return isSame && (isDesktop || compactPanelOpen) ? null : nextPanel;
    });
  };

  useEffect(() => {
    if (!isDesktop && !compactPanelRequestedRef.current) {
      setCompactPanelOpen(false);
      setPanel(null);
    }
  }, [isDesktop, selected?.id]);

  const stepSelection = (dir: 1 | -1) => {
    const entries = qc.getQueriesData<
      { pages?: Array<{ items?: ConversationRow[] }> } | ConversationRow[]
    >({
      queryKey: ["conversations", active?.id],
    });
    // Prefer an entry whose filter matches the current view.
    const wantFilter = viewToFilter(view);
    let items: ConversationRow[] = [];
    for (const [key, data] of entries) {
      const params = (key as unknown[])[2] as { filter?: string } | undefined;
      if (!data) continue;
      const pages = Array.isArray(data) ? undefined : data.pages;
      const flat = pages
        ? pages.flatMap((p) => p.items ?? [])
        : Array.isArray(data)
          ? (data as ConversationRow[])
          : [];
      if (!flat.length) continue;
      if (params?.filter === wantFilter) {
        items = flat;
        break;
      }
      if (!items.length) items = flat;
    }
    if (!items.length) return;
    const idx = selected ? items.findIndex((c) => c.id === selected.id) : -1;
    const nextIdx =
      idx < 0
        ? dir === 1
          ? 0
          : items.length - 1
        : Math.max(0, Math.min(items.length - 1, idx + dir));
    const next = items[nextIdx];
    if (next) handleSelectConversation(next);
  };

  useInboxKeyboardShortcuts({
    onNext: () => stepSelection(1),
    onPrev: () => stepSelection(-1),
    onReply: () => {
      if (!selected) return;
      window.dispatchEvent(new CustomEvent("inbox:focus-composer"));
    },
    onNote: () => togglePanel("team"),
    onStar: handleStar,
    onPin: handlePin,
    onResolve: handleResolve,
    onArchive: handleArchive,
    onSpam: handleSpam,
    onTrash: handleTrash,
    onAssign: () => togglePanel("sla"),
    onTogglePanel: () => togglePanel("customer"),
    onToggleList: () => setListOpen((v) => !v),
    onGo: (v) => setView(v),
  });

  return (
    <>
      <AppTopbar title="Inbox" showPageHeader={false} showSidebarToggle={false} />
      <KeyboardShortcutsDialog />
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        {view === "queue" ? (
          <div className="flex-1 min-w-0 overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h1 className="text-sm font-semibold text-foreground">Inbox</h1>
              <InboxHeaderActions />
            </div>
            <InboxViewMenu view={view} onChange={setView} className="mb-4 max-w-sm" />
            <HandoffQueuePanel
              onOpenConversation={(id) =>
                navigate({
                  search: (prev: Record<string, unknown>) => ({ ...prev, conversationId: id }),
                })
              }
            />
          </div>
        ) : (
          <>
            <div
              className={cn(
                "min-w-0 overflow-hidden border-r border-border shrink-0 w-full min-[992px]:w-[360px] min-[992px]:max-w-[360px] xl:w-[420px] xl:max-w-[420px] transition-[width,opacity]",
                selected
                  ? (listOpen ? "hidden min-[992px]:block" : "hidden")
                  : (listOpen ? "block" : "block min-[992px]:hidden"),
              )}
            >
              <ConversationList
                headerActions={<InboxHeaderActions />}
                selectedId={selected?.id}
                inboxView={view}
                onInboxViewChange={setView}
                onScopeChange={({ channels, accountId }) => {
                  if (!selected) return;
                  if (!conversationMatchesScope(selected, { channels, accountId })) {
                    setSelected(null);
                    writeSavedConversationId(workspaceId, null);
                    navigate({
                      search: (prev: Record<string, unknown>) => ({
                        ...prev,
                        conversationId: undefined,
                      }),
                      replace: true,
                    });
                  }
                }}
                onSelect={handleSelectConversation}
                onItemAction={handleListAction}
                filter={viewToFilter(view)}
                pinnedView={view === "pinned"}
                onFilterChange={(f) => setView(f as InboxView)}
              />
            </div>

            <div className={cn("flex-1 flex-col min-w-0 min-h-0", selected ? "flex" : "hidden min-[992px]:flex")}>
              {selected ? (
                <div className="@container flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
                  <ConversationHeader
                    conversation={selected}
                    onBack={() => {
                      setSelected(null);
                      writeSavedConversationId(active?.id, null);
                    }}
                    onStar={handleStar}
                    onPin={handlePin}
                    onMute={handleMute}
                    onMarkUnread={handleMarkUnread}
                    onResolve={handleResolve}
                    onArchive={handleArchive}
                    onSpam={handleSpam}
                    onTrash={handleTrash}
                    onAssign={handleAssign}
                    onLinkContact={() => setLinkContactOpen(true)}
                    onOpenContact={() => togglePanel("customer")}
                    onDiagnostics={() => setDiagnosticsOpen(true)}
                    panel={panel}
                    onPanelToggle={togglePanel}
                  />

                  <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
                    <div className="flex-1 flex flex-col min-w-0 min-h-0 relative overflow-hidden">
                      <ConversationWindow conversation={selected} />
                    </div>

                    {/* Desktop side panel */}
                    <div
                      className={cn(
                        "hidden xl:flex shrink-0 min-h-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out motion-reduce:transition-none",
                        panel
                          ? "w-[300px] xl:w-[320px] 2xl:w-[360px] opacity-100"
                          : "w-0 opacity-0 pointer-events-none",
                      )}
                      aria-hidden={!panel}
                    >
                      {panel === "customer" && (
                        <CustomerProfileSidebar
                          contactId={selected.contact_id}
                          onClose={() => setPanel(null)}
                        />
                      )}
                      {panel === "team" && <CollaborationPanel conversation={selected} />}
                      {panel === "sla" && (
                        <AssignmentSlaPanel
                          conversation={selected}
                          onClose={() => setPanel(null)}
                        />
                      )}
                      {panel === "intel" && (
                        <ConversationIntelligencePanel conversationId={selected.id} />
                      )}
                      {panel === "work" && workspaceId && (
                        <InboxWorkPanel
                          conversationId={selected.id}
                          workspaceId={workspaceId}
                          channel={selected.channel}
                          recipient={selected.contact?.email ?? selected.subject ?? selected.id}
                          onClose={() => setPanel(null)}
                        />
                      )}
                    </div>

                    {/* Mobile / tablet side panel — rendered as an off-canvas sheet */}
                    {!isDesktop && (
                      <Sheet
                        open={compactPanelOpen && !!panel}
                        onOpenChange={(o) => {
                          setCompactPanelOpen(o);
                          if (!o) setPanel(null);
                        }}
                      >
                        <SheetContent
                          side="right"
                          className="w-full sm:max-w-md overflow-y-auto p-0"
                        >
                          {panel !== "customer" && (
                            <SheetHeader className="px-4 py-3 border-b border-border">
                              <SheetTitle>
                                {panel === "team"
                                  ? "Collaboration"
                                  : panel === "intel"
                                    ? "AI Intelligence"
                                    : panel === "work"
                                      ? "Work & reminders"
                                      : "Assignment & SLA"}
                              </SheetTitle>
                            </SheetHeader>
                          )}
                          <div className={panel === "customer" ? "flex min-h-0 flex-1" : "p-3"}>
                            {panel === "customer" && (
                              <CustomerProfileSidebar
                                contactId={selected.contact_id}
                                onClose={() => {
                                  setCompactPanelOpen(false);
                                  setPanel(null);
                                }}
                              />
                            )}
                            {panel === "team" && <CollaborationPanel conversation={selected} />}
                            {panel === "sla" && <AssignmentSlaPanel conversation={selected} />}
                            {panel === "intel" && (
                              <ConversationIntelligencePanel conversationId={selected.id} />
                            )}
                            {panel === "work" && workspaceId && (
                              <InboxWorkPanel
                                conversationId={selected.id}
                                workspaceId={workspaceId}
                                channel={selected.channel}
                                recipient={
                                  selected.contact?.email ?? selected.subject ?? selected.id
                                }
                                onClose={() => {
                                  setCompactPanelOpen(false);
                                  setPanel(null);
                                }}
                              />
                            )}
                          </div>
                        </SheetContent>
                      </Sheet>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyPane />
              )}
            </div>
          </>
        )}
      </div>

      <ConversationDiagnosticsDrawer
        open={diagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
        conversationId={selected?.id ?? null}
        workspaceId={active?.id}
      />

      <LinkContactDialog
        open={linkContactOpen}
        onOpenChange={setLinkContactOpen}
        conversation={selected}
        onLinked={(contactId) => {
          if (selected) setSelected({ ...selected, contact_id: contactId });
        }}
      />
    </>
  );
}

function InboxHeaderActions() {
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => setSoundOn(isInboundSoundEnabled()), []);
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-w-0 items-center gap-1">
        <SelectedAccountBadge />
        <RealtimeStatusIndicator />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
              aria-label={soundOn ? "Mute inbox sounds" : "Turn on inbox sounds"}
              aria-pressed={soundOn}
              onClick={() => { const next = !soundOn; setSoundOn(next); setInboundSoundEnabled(next); }}>
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">{soundOn ? "Inbox sounds on" : "Inbox sounds off"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Keyboard shortcuts"
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))}
            >
              <Keyboard className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Shortcuts · ?</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

function EmptyPane() {
  return (
    <div className="flex-1 grid place-items-center bg-gradient-subtle">
      <div className="text-center max-w-sm px-6">
        <div className="mx-auto h-16 w-16 rounded-control bg-muted grid place-items-center mb-4">
          <MessageSquare className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-base font-semibold">Select a conversation</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a conversation from the list to view messages and reply.
        </p>
      </div>
    </div>
  );
}
