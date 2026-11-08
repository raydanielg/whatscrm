import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch, Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Search,
  ArrowUpDown,
  Inbox as InboxIcon,
  CheckSquare,
  Tag,
  SlidersHorizontal,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  ChevronsUpDown,
  ChevronDown,
  Check,
  Settings2,
  Info,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  useConversations,
  useConversationCounts,
  useChannelUnreadCounts,
  useInfiniteScroll,
  useWorkspaceTypingIndicators,
  type ConversationCounts,
  type ConversationFilter,
  type ConversationSort,
  type ConversationRow,
  type InboxChannel,
} from "@/hooks/use-conversations";
import {
  FILTERABLE_CHANNELS,
  channelLabel,
  channelSetupPath,
  isFilterableChannel,
} from "@/lib/inbox/channel-capabilities";
import {
  normalizeChannelAccounts,
  mergeAccountSources,
  type SyncedChannelAccount,
} from "@/lib/inbox/account-sync";
import { useLiveChatAccounts } from "@/hooks/use-livechat-accounts";
import { useInboxChannelRefresh } from "@/hooks/use-inbox-channel-refresh";
import { useExternalChannelAccounts } from "@/hooks/use-external-accounts";

import { ChannelIcon } from "./channel-icon";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useChannelAccounts, type ChannelAccountRow } from "@/hooks/use-channel-accounts";

import { ConversationListItem, ConversationListItemSkeleton, type ConversationListAction } from "./conversation-list-item";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LabelManagerDialog } from "./label-manager";
import { AdvancedSearchDialog } from "./advanced-search";
import { BulkActionsBar } from "./bulk-actions-bar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useInboxSyncSettings,
  SYNC_INTERVAL_OPTIONS,
  SYNC_BUTTON_OPTIONS,
  formatSyncAgo,
  formatSyncDuration,
} from "@/lib/inbox/sync-settings";
import { cn } from "@/lib/utils";
import { useOpenTaskCounts } from "@/hooks/use-conversation-tasks";
import { InboxViewMenu } from "./inbox-view-menu";
import type { InboxView } from "@/lib/inbox/inbox-views";

/** One completed conversation-list refresh, kept for the sync details panel. */
type SyncRun = {
  at: number;
  ms: number;
  count: number;
  ok: boolean;
  error: string | null;
};

type Props = {
  headerActions?: React.ReactNode;
  selectedId?: string;
  onSelect: (c: ConversationRow) => void;
  onItemAction?: (conversation: ConversationRow, action: ConversationListAction) => void;
  inboxId?: string | null;
  inboxView: InboxView;
  onInboxViewChange: (view: InboxView) => void;
  /** Optional controlled filter (from the view menu). Falls back to internal state. */
  filter?: ConversationFilter;
  onFilterChange?: (f: ConversationFilter) => void;
  onScopeChange?: (scope: { channels: InboxChannel[]; accountId: string | null }) => void;
  /** True when the dedicated "Pinned" view is active (shows every pinned row). */
  pinnedView?: boolean;
};

type Tab = {
  id: ConversationFilter;
  label: string;
  countKey?: keyof ConversationCounts["badges"];
};

const TABS: Tab[] = [
  { id: "all", label: "All", countKey: "all" },
  { id: "unread", label: "Unread", countKey: "unread" },
  { id: "mine", label: "Mine", countKey: "mine" },
  { id: "unassigned", label: "Unassigned", countKey: "unassigned" },
  { id: "open", label: "Open", countKey: "open" },
  { id: "pending", label: "Pending", countKey: "pending" },
  { id: "resolved", label: "Resolved", countKey: "resolved" },
  { id: "starred", label: "Starred" },
  { id: "archived", label: "Archived", countKey: "archived" },
];

/** Per-workspace localStorage key for the selected inbox account filter. */
const accountKey = (workspaceId?: string) => `wacrm.inbox.account.${workspaceId ?? "none"}`;

/** Per-workspace localStorage key for the selected channel tile filters. */
const channelsKey = (workspaceId?: string) => `wacrm.inbox.channels.${workspaceId ?? "none"}`;

function readSavedAccountId(workspaceId?: string): string | null {
  if (typeof window === "undefined" || !workspaceId) return null;
  try {
    return window.localStorage.getItem(accountKey(workspaceId));
  } catch {
    return null;
  }
}

function writeSavedAccountId(workspaceId: string | undefined, id: string | null) {
  if (typeof window === "undefined" || !workspaceId) return;
  try {
    if (id) window.localStorage.setItem(accountKey(workspaceId), id);
    else window.localStorage.removeItem(accountKey(workspaceId));
  } catch {
    /* storage unavailable */
  }
}

function readSavedChannels(workspaceId?: string): InboxChannel[] {
  if (typeof window === "undefined" || !workspaceId) return [];
  try {
    const raw = window.localStorage.getItem(channelsKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFilterableChannel);
  } catch {
    return [];
  }
}

function writeSavedChannels(workspaceId: string | undefined, channels: InboxChannel[]) {
  if (typeof window === "undefined" || !workspaceId) return;
  try {
    if (channels.length > 0) {
      window.localStorage.setItem(channelsKey(workspaceId), JSON.stringify(channels));
    } else {
      window.localStorage.removeItem(channelsKey(workspaceId));
    }
  } catch {
    /* storage unavailable */
  }
}

/** Per-workspace localStorage key for the inbox search term. */
const searchKey = (workspaceId?: string) => `wacrm.inbox.search.${workspaceId ?? "none"}`;

function readSavedSearch(workspaceId?: string): string {
  if (typeof window === "undefined" || !workspaceId) return "";
  try {
    return window.localStorage.getItem(searchKey(workspaceId)) ?? "";
  } catch {
    return "";
  }
}

function writeSavedSearch(workspaceId: string | undefined, term: string) {
  if (typeof window === "undefined" || !workspaceId) return;
  try {
    if (term.trim()) window.localStorage.setItem(searchKey(workspaceId), term);
    else window.localStorage.removeItem(searchKey(workspaceId));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Connection status badge for an account row in the selector.
 *
 * Live Chat "accounts" are chatbots, so this is how you tell a live widget bot
 * from a disabled/archived one at a glance; the same badge is reused for every
 * channel since they all carry a normalized `status`.
 */
function AccountStatusBadge({
  status,
  reason,
  className,
}: {
  status?: string | null;
  reason?: string | null;
  className?: string;
}) {
  const s = (status ?? "").toLowerCase();
  const tone =
    s === "connected"
      ? { dot: "bg-success", text: "text-success", label: "Connected" }
      : s === "pending" || s === "syncing"
        ? { dot: "bg-warning", text: "text-warning", label: "Syncing" }
        : s === "error" || s === "invalid"
          ? { dot: "bg-destructive", text: "text-destructive", label: "Error" }
          : { dot: "bg-muted-foreground", text: "text-muted-foreground", label: "Disabled" };

  return (
    <span
      title={reason ?? tone.label}
      className={`inline-flex shrink-0 items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 text-[11px] font-medium leading-none ${tone.text} ${className ?? ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
      {tone.label}
    </span>
  );
}

export function ConversationList({
  headerActions,
  selectedId,
  onSelect,
  onItemAction,
  inboxId,
  inboxView,
  onInboxViewChange,
  filter: filterProp,
  onFilterChange,
  onScopeChange,
  pinnedView = false,
}: Props) {
  const formatZoned = useZonedDateFormatter();
  const [filterState, setFilterState] = useState<ConversationFilter>("all");
  const filter = filterProp ?? filterState;
  const setFilter = (f: ConversationFilter) => {
    if (onFilterChange) onFilterChange(f);
    else setFilterState(f);
  };
  const [sort, setSort] = useState<ConversationSort>("recent");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [channels, setChannels] = useState<InboxChannel[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [pinnedExpanded, setPinnedExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [accountId, setAccountIdState] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");
  const isMobile = useIsMobile();
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const accountSearchRef = useRef<HTMLInputElement>(null);
  const { active: workspace } = useCurrentWorkspace();
  const {
    data: accountsData,
    isError: accountsError,
    error: accountsErrorObj,
    isFetching: accountsFetching,
    refetch: refetchAccounts,
  } = useChannelAccounts(workspace?.id);
  // Live Chat has no `channel_accounts` rows — widget-enabled chatbots are the
  // accounts, projected into the same shape so the selector treats them alike.
  const { data: liveChatAccounts } = useLiveChatAccounts(workspace?.id);
  // Telegram / Messenger / Instagram each have their own provider table.
  const { data: externalAccounts } = useExternalChannelAccounts(workspace?.id);
  // Validate providers at the sync boundary: rows with an unsupported
  // `provider` never reach inbox state, they are surfaced as an error instead.
  // `mergeAccountSources` additionally drops rows left over from another
  // workspace and de-duplicates ids, so a partially-settled merge can never
  // point the thread view at a stale account.
  const { accounts, invalid: invalidAccounts } = useMemo(
    () =>
      normalizeChannelAccounts<ChannelAccountRow>(
        mergeAccountSources<ChannelAccountRow>(
          workspace?.id,
          accountsData,
          externalAccounts,
          liveChatAccounts,
        ),
      ),
    [workspace?.id, accountsData, externalAccounts, liveChatAccounts],
  );

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;

  // Switching channel/account force-fetches the list, folder counts and unread
  // badges so a stale cached page never survives the switch.
  useInboxChannelRefresh(workspace?.id, channels, accountId);

  // Keep the selected account + channels in the URL so the inbox view is shareable.
  const navigate = useNavigate();
  const urlSearchParams = useSearch({ strict: false }) as {
    account?: string;
    q?: string;
    channels?: string;
  };
  const urlAccountId = urlSearchParams.account ?? null;
  const urlQ = urlSearchParams.q ?? null;
  const urlChannelsRaw = urlSearchParams.channels ?? null;
  const urlChannels: InboxChannel[] = (urlChannelsRaw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(isFilterableChannel);
  useEffect(() => {
    onScopeChange?.({ channels, accountId });
  }, [channels, accountId, onScopeChange]);
  const syncFiltersToUrl = (id: string | null, chs?: InboxChannel[]) => {
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        account: id ?? undefined,
        ...(chs === undefined ? {} : { channels: chs.length > 0 ? chs.join(",") : undefined }),
      }),
      replace: true,
    });
  };
  const syncAccountToUrl = (id: string | null) => syncFiltersToUrl(id);
  const setAccountId = (id: string | null) => {
    setAccountIdState(id);
    syncAccountToUrl(id);
  };

  /** Update channel filter state + per-workspace storage + URL in one place. */
  const applyChannels = (next: InboxChannel[], accountForUrl?: string | null) => {
    setChannels(next);
    writeSavedChannels(workspace?.id, next);
    syncFiltersToUrl(accountForUrl === undefined ? accountId : accountForUrl, next);
  };

  const filteredAccounts = accountSearch.trim()
    ? accounts.filter((a) => {
        const q = accountSearch.toLowerCase();
        return (
          a.display_name.toLowerCase().includes(q) ||
          (a.phone_number?.toLowerCase().includes(q) ?? false) ||
          channelLabel(a.channel).toLowerCase().includes(q)
        );
      })
    : accounts;

  /** Select an account (or "All") and mirror it onto the channel filter. */
  const selectAccount = (a: SyncedChannelAccount<ChannelAccountRow> | null) => {
    setAccountIdState(a?.id ?? null);
    setAccountMenuOpen(false);
    setAccountSearch("");
    const nextChannels: InboxChannel[] = (() => {
      if (!a) return [];
      return FILTERABLE_CHANNELS.includes(a.channel) ? [a.channel] : [];
    })();
    writeSavedAccountId(workspace?.id, a?.id ?? null);
    applyChannels(nextChannels, a?.id ?? null);
  };

  // Focus the account search input when the dropdown opens.
  useEffect(() => {
    if (accountMenuOpen) {
      const t = setTimeout(() => accountSearchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [accountMenuOpen]);

  // Restore the chosen account/channel filter once the account list has loaded.
  // The URL query param wins over the per-workspace localStorage fallback so
  // shared/bookmarked inbox links open with the same account selected.
  // Treat a failed sync as "settled" so the restore effect still applies the
  // saved channel filter instead of hanging in the loading state forever.
  const accountsLoaded = accountsData !== undefined || accountsError;
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !workspace?.id || !accountsLoaded) return;
    restoredRef.current = true;
    const savedAccountId = urlAccountId ?? readSavedAccountId(workspace.id);
    // URL channels win over the per-workspace localStorage fallback.
    const savedChannels = urlChannels.length > 0 ? urlChannels : readSavedChannels(workspace.id);
    const match = savedAccountId ? accounts.find((a) => a.id === savedAccountId) : null;
    if (match) {
      setAccountIdState(match.id);
      writeSavedAccountId(workspace.id, match.id);
      const ch = match.channel;
      const next = FILTERABLE_CHANNELS.includes(ch) ? [ch] : [];
      setChannels(next);
      writeSavedChannels(workspace.id, next);
      if (!urlAccountId || urlChannels.join(",") !== next.join(",")) {
        syncFiltersToUrl(match.id, next);
      }
    } else {
      // Stale account (deleted, or belongs to another workspace) — purge it
      // from the URL and from this workspace's saved filter.
      if (savedAccountId) writeSavedAccountId(workspace.id, null);
      setChannels(savedChannels);
      writeSavedChannels(workspace.id, savedChannels);
      if (urlAccountId || urlChannels.join(",") !== savedChannels.join(",")) {
        syncFiltersToUrl(null, savedChannels);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, accountsLoaded, accounts.length, urlAccountId, urlChannelsRaw]);

  // Switching workspaces invalidates the current account filter immediately:
  // clear state and drop the inherited ?account= param so the new workspace
  // never renders another tenant's account selection while accounts load.
  const prevWorkspaceRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevWorkspaceRef.current;
    prevWorkspaceRef.current = workspace?.id;
    if (prev === workspace?.id) return;
    restoredRef.current = false;
    setAccountIdState(null);
    setChannels([]);
    if (prev !== undefined) {
      // Search terms are per-workspace too — clear and re-restore.
      searchRestoredRef.current = false;
      setSearch("");
      setDebouncedSearch("");
    }
    // On first mount keep the URL params (they target the current workspace).
    if (prev !== undefined && (urlAccountId || urlQ || urlChannelsRaw)) {
      navigate({
        to: ".",
        search: (p: Record<string, unknown>) => ({
          ...p,
          account: undefined,
          q: undefined,
          channels: undefined,
        }),
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  // React to external URL changes (e.g. the topbar badge clear button) so the
  // account/channel filters stay in sync with the URL after the initial restore.
  useEffect(() => {
    if (!restoredRef.current) return;
    if (urlAccountId === accountId && urlChannels.join(",") === channels.join(",")) return;
    setAccountIdState(urlAccountId);
    writeSavedAccountId(workspace?.id, urlAccountId);
    let nextChannels: InboxChannel[] = urlChannels;
    if (urlAccountId) {
      const match = accounts.find((a) => a.id === urlAccountId);
      if (match) {
        const ch = match.channel;
        nextChannels = FILTERABLE_CHANNELS.includes(ch) ? [ch] : [];
      }
    }
    setChannels(nextChannels);
    writeSavedChannels(workspace?.id, nextChannels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlAccountId, urlChannelsRaw, accountId, accounts.length, workspace?.id]);

  const [advOpen, setAdvOpen] = useState(false);

  /** Channel that a given account maps onto in the filter row. */
  const accountChannel = (a: SyncedChannelAccount<ChannelAccountRow>) => a.channel;

  // Toggling channels manually must drop an account selection that no longer matches.
  const toggleChannel = (c: InboxChannel) => {
    const next = channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c];
    let nextAccount: string | null = accountId;
    if (selectedAccount) {
      const accCh = accountChannel(selectedAccount);
      if (next.length !== 1 || next[0] !== accCh) {
        nextAccount = null;
        setAccountIdState(null);
        writeSavedAccountId(workspace?.id, null);
      }
    }
    applyChannels(next, nextAccount);
  };

  /** Reset everything back to "All accounts / All channels / All conversations". */
  const resetFilters = () => {
    setSearch("");
    selectAccount(null);
    setFilter("all");
  };

  // ⌘K / Ctrl+K opens advanced search.
  // `defaultPrevented` is checked first so this backs off when another ⌘K
  // owner (the composer's template picker, or the app-wide command palette in
  // layout-context.tsx) already claimed the same keydown — otherwise several
  // unrelated ⌘K dialogs opened on top of each other.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAdvOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Restore the last search term for this workspace (URL wins over storage).
  const searchRestoredRef = useRef(false);
  useEffect(() => {
    if (searchRestoredRef.current || !workspace?.id) return;
    searchRestoredRef.current = true;
    const restored = urlQ ?? readSavedSearch(workspace.id);
    if (restored) {
      setSearch(restored);
      setDebouncedSearch(restored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  // Debounce the search term, then persist it (URL + per-workspace storage).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      if (!searchRestoredRef.current) return;
      writeSavedSearch(workspace?.id, search);
      const next = search.trim() ? search : undefined;
      if ((urlQ ?? undefined) !== next) {
        navigate({
          to: ".",
          search: (prev: Record<string, unknown>) => ({ ...prev, q: next }),
          replace: true,
        });
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, workspace?.id]);

  const qc = useQueryClient();
  const { data: counts } = useConversationCounts(inboxId);
  const { data: unreadCounts } = useChannelUnreadCounts(inboxId);
  const channelUnread = unreadCounts?.byChannel;
  const accountUnread = unreadCounts?.byAccount;
  // When one account is selected the badge must reflect that account only,
  // otherwise it shows every channel's unread total.
  const totalChannelUnread = accountId
    ? (accountUnread?.[accountId] ?? 0)
    : Object.values(channelUnread ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const {
    conversations,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    dataUpdatedAt,
  } = useConversations({
    filter,
    inboxId,
    search: debouncedSearch,
    sort,
    channels: channels.length > 0 ? channels : undefined,
    // Selecting one account must narrow the list to that account, not just to
    // its channel — several WhatsApp accounts share the `whatsapp` channel.
    accountId,
  });

  // Open linked-task counts for the visible rows (one query for the whole page).
  const { data: openTaskCounts } = useOpenTaskCounts(conversations.map((c) => c.id));

  // Pinned threads sit at the top: the first few inline, the rest behind a
  // toggle row. The dedicated "pinned" view shows all of them.
  const PINNED_INLINE_LIMIT = 3;
  const listItems = useMemo(() => {
    const isPinned = (c: (typeof conversations)[number]) => {
      const m = (c.metadata ?? {}) as Record<string, unknown>;
      return m.pinned === true || m.pinned === "true";
    };
    const pinnedRows = conversations.filter(isPinned);
    const otherRows = conversations.filter((c) => !isPinned(c));
    const showAllPinned = pinnedView || pinnedExpanded;
    const inline = showAllPinned ? pinnedRows : pinnedRows.slice(0, PINNED_INLINE_LIMIT);
    const hidden = pinnedRows.length - inline.length;
    const items: Array<
      { kind: "row"; c: (typeof conversations)[number] } | { kind: "toggle"; hidden: number }
    > = [
      ...inline.map((c) => ({ kind: "row" as const, c })),
      ...(hidden > 0 || (pinnedExpanded && pinnedRows.length > PINNED_INLINE_LIMIT)
        ? [{ kind: "toggle" as const, hidden }]
        : []),
      ...otherRows.map((c) => ({ kind: "row" as const, c })),
    ];
    return items;
  }, [conversations, pinnedView, pinnedExpanded]);

  // Typing indicators for the whole workspace, keyed by conversation id.
  const typingByConversation = useWorkspaceTypingIndicators();

  // Background/auto refetches stay silent; only an explicit manual sync shows
  // the "Updating conversations" feedback.
  const [manualSync, setManualSync] = useState(false);

  // Per-workspace sync preferences: background cadence + sync button visibility.
  const {
    settings: syncSettings,
    update: updateSyncSettings,
    showSyncButton,
  } = useInboxSyncSettings(workspace?.id);

  // Track when the last refetch (background or manual) finished and how long
  // it took, so the toolbar can prove background updates are still running.
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null);
  // Rolling history of recent sync runs shown in the sync details panel.
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);

  const fetchStartedRef = useRef<number | null>(null);
  const countRef = useRef(0);
  countRef.current = conversations.length;
  const errorRef = useRef<unknown>(null);
  errorRef.current = isError ? error : null;
  useEffect(() => {
    if (isFetching) {
      if (fetchStartedRef.current == null) fetchStartedRef.current = Date.now();
      return;
    }
    if (fetchStartedRef.current != null) {
      const ms = Date.now() - fetchStartedRef.current;
      setLastSyncMs(ms);
      fetchStartedRef.current = null;
      const err = errorRef.current;
      setSyncRuns((prev) =>
        [
          {
            at: Date.now(),
            ms,
            count: countRef.current,
            ok: !err,
            error: err ? (err instanceof Error ? err.message : String(err)) : null,
          },
          ...prev,
        ].slice(0, 20),
      );
    }
    if (dataUpdatedAt) setLastSyncedAt(dataUpdatedAt);
  }, [isFetching, dataUpdatedAt, conversations.length, isError, error]);

  // Re-render the relative label on a slow tick so "2m ago" stays truthful.
  const [, setAgoTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setAgoTick((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const lastSyncedLabel = formatSyncAgo(lastSyncedAt);

  // Track the most recent sync failure so the toolbar can surface *why* the
  // list may be stale and when it will try again.
  const [lastErrorAt, setLastErrorAt] = useState<number | null>(null);
  const [lastErrorMsg, setLastErrorMsg] = useState<string | null>(null);
  useEffect(() => {
    if (isError) {
      setLastErrorAt(Date.now());
      setLastErrorMsg(
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unknown sync error",
      );
    } else if (!isFetching && dataUpdatedAt) {
      // A successful refresh clears the failure state.
      setLastErrorAt(null);
      setLastErrorMsg(null);
    }
  }, [isError, error, isFetching, dataUpdatedAt]);

  const syncFailed = isError || lastErrorAt != null;
  const retryIntervalMs = Math.max(syncSettings.refetchIntervalMs || 0, 15_000);
  const nextRetryAt = lastErrorAt != null ? lastErrorAt + retryIntervalMs : null;
  const nextRetryLabel = (() => {
    if (isFetching) return "retrying now";
    if (nextRetryAt == null) return "—";
    const secs = Math.max(0, Math.round((nextRetryAt - Date.now()) / 1000));
    if (secs <= 0) return "any moment";
    if (secs < 60) return `in ${secs}s`;
    return `in ${Math.round(secs / 60)}m`;
  })();

  const syncNow = () => {
    setManualSync(true);
    void Promise.allSettled([
      refetch(),
      qc.invalidateQueries({ queryKey: ["conversation-counts"] }),
      qc.invalidateQueries({ queryKey: ["conversation-channel-unread"] }),
    ]).finally(() => setManualSync(false));
  };

  const sentinelRef = useInfiniteScroll(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, hasNextPage ?? false);

  const selectChannel = (c: InboxChannel | null) => {
    setAccountIdState(null);
    writeSavedAccountId(workspace?.id, null);
    applyChannels(c ? [c] : [], null);
    setAccountMenuOpen(false);
    setAccountSearch("");
  };

  const accountsByChannel = (c: InboxChannel) =>
    filteredAccounts.filter((a) => accountChannel(a) === c);

  const q = accountSearch.trim().toLowerCase();
  const visibleChannels = FILTERABLE_CHANNELS.filter(
    (c) => !q || channelLabel(c).toLowerCase().includes(q) || accountsByChannel(c).length > 0,
  );

  const triggerTitle = selectedAccount
    ? selectedAccount.display_name
    : channels.length === 1
      ? channelLabel(channels[0]!)
      : "All channels";
  const triggerSubtitle = accountsError
    ? "Couldn't load accounts — tap to retry"
    : !accountsLoaded
      ? "Loading accounts"
      : selectedAccount
        ? (selectedAccount.phone_number ?? channelLabel(accountChannel(selectedAccount)))
        : channels.length === 1
          ? `${accounts.filter((a) => accountChannel(a) === channels[0]).length} account(s)`
          : accounts.length > 0
            ? `${accounts.length} connected`
            : "No accounts connected";

  return (
    <div className="flex flex-col h-full bg-surface">
      {headerActions && (
        <div className="flex min-h-12 items-center justify-between gap-2 border-b border-border px-3 py-4.5">
          <h1 className="text-xl font-semibold text-foreground">Inbox</h1>
          <div className="flex min-w-0 items-center gap-1">{headerActions}</div>
        </div>
      )}
      {/* Search + filter header */}
      <div className="flex flex-wrap gap-2 border-b border-border p-2 sm:p-3">
        <InboxViewMenu
          view={inboxView}
          onChange={onInboxViewChange}
          inboxId={inboxId}
          className="w-auto min-w-[170px] flex-1"
        />
        {/* Channel + account selector */}
        <DropdownMenu open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="min-w-[190px] flex-[1.2] flex items-center gap-2.5 rounded-control border border-border bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Select channel or account"
            >
              {selectedAccount || channels.length === 1 ? (
                <ChannelIcon
                  channel={selectedAccount ? accountChannel(selectedAccount) : channels[0]!}
                  boxed
                  className="h-5 w-5 shrink-0 rounded-full"
                  iconClassName="h-full w-full"
                />
              ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-gradient-accent text-accent-foreground">
                  <InboxIcon className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {triggerTitle}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {triggerSubtitle}
                </span>
              </span>
              {totalChannelUnread > 0 && (
                <span className="min-w-[20px] h-5 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-center text-primary-foreground">
                  {totalChannelUnread > 99 ? "99+" : totalChannelUnread}
                </span>
              )}
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={6}
            collisionPadding={12}
            avoidCollisions
            scrollable={false}
            className="z-50 w-[--radix-dropdown-menu-trigger-width] min-w-72 max-w-[calc(100vw-1.5rem)] p-0"
          >
            <div className="px-2 pt-2 pb-1.5 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  ref={accountSearchRef}
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Search channels or accounts"
                  className="h-8 pl-7 pr-7 text-xs"
                  aria-label="Search channels and connected accounts"
                  onKeyDown={(e) => {
                    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
                      e.stopPropagation();
                    }
                    if (e.key === "Escape") setAccountMenuOpen(false);
                  }}
                />
                {accountSearch && (
                  <button
                    type="button"
                    onClick={() => setAccountSearch("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Clear search"
                    tabIndex={-1}
                  >
                    <span className="sr-only">Clear</span>
                    <span aria-hidden className="text-[11px] leading-none">
                      ×
                    </span>
                  </button>
                )}
              </div>
            </div>
            <ScrollArea className="max-h-80" viewportClassName="max-h-80 py-1 [&>div]:!block">
              <DropdownMenuItem className="gap-2.5 mx-1" onSelect={() => selectChannel(null)}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-muted text-muted-foreground">
                  <InboxIcon className="h-4 w-4" />
                </span>
                <span className="flex-1">All channels</span>
                {totalChannelUnread > 0 && (
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {totalChannelUnread > 99 ? "99+" : totalChannelUnread}
                  </span>
                )}
                {!accountId && channels.length === 0 && (
                  <Check className="h-3.5 w-3.5 text-accent" />
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="mx-1" />
              {accountsError ? (
                <div
                  className="mx-1 my-1 rounded-control border border-danger/30 bg-danger-muted px-3 py-3 space-y-2"
                  role="alert"
                  aria-live="assertive"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold text-danger">
                        Couldn't load connected accounts
                      </p>
                      <p className="text-[11px] text-danger/80">
                        {accountsErrorObj instanceof Error && accountsErrorObj.message
                          ? accountsErrorObj.message
                          : "Check your connection and try again."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-6">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={accountsFetching}
                      onClick={(e) => {
                        e.preventDefault();
                        void refetchAccounts();
                      }}
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${accountsFetching ? "animate-spin" : ""}`}
                        aria-hidden
                      />
                      {accountsFetching ? "Retrying" : "Retry"}
                    </Button>
                    <Link
                      to="/integrations/marketplace"
                      className="text-[11px] font-medium text-accent hover:underline"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      Manage channels
                    </Link>
                  </div>
                </div>
              ) : !accountsLoaded ? (
                <div className="px-2 py-1.5 space-y-2" role="status" aria-live="polite">
                  <p className="px-1 text-[11px] text-muted-foreground">
                    Loading connected accounts
                  </p>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-2 px-1">
                      <Skeleton className="h-4 w-4 rounded-control" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-2.5 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {invalidAccounts.length > 0 && (
                    <div
                      className="mx-1 my-1 rounded-control border border-warning/30 bg-warning-muted px-3 py-2.5 space-y-1.5"
                      role="alert"
                      aria-live="polite"
                    >
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-semibold text-warning">
                            {invalidAccounts.length} account
                            {invalidAccounts.length > 1 ? "s" : ""} use an unsupported channel type
                          </p>
                          <ul className="space-y-0.5">
                            {invalidAccounts.slice(0, 3).map(({ row, reason }) => (
                              <li key={row.id} className="text-[11px] text-warning/90 truncate">
                                <span className="font-medium">{row.display_name}</span> — {reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="pl-6">
                        <Link
                          to="/integrations/marketplace"
                          className="text-[11px] font-medium text-accent hover:underline"
                          onClick={() => setAccountMenuOpen(false)}
                        >
                          Manage channels
                        </Link>
                      </div>
                    </div>
                  )}
                  {visibleChannels.map((c) => {
                    const chAccounts = accountsByChannel(c);
                    const unread = channelUnread?.[c] ?? 0;
                    const isActive = channels.length === 1 && channels[0] === c;
                    const row = (
                      <>
                        <ChannelIcon
                          channel={c}
                          boxed
                          className="h-5 w-5 rounded-full"
                          iconClassName="h-full w-full"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{channelLabel(c)}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {chAccounts.length > 0
                              ? `${chAccounts.length} account${chAccounts.length > 1 ? "s" : ""}`
                              : "No accounts connected"}
                          </span>
                        </span>
                        {unread > 0 && (
                          <span className="min-w-[20px] h-5 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-center text-primary-foreground">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                        {isActive && !accountId && <Check className="h-3.5 w-3.5 text-accent" />}
                      </>
                    );

                    if (chAccounts.length === 0) {
                      const setupTo = channelSetupPath(c);
                      return (
                        <div key={c} className="mx-1 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => selectChannel(c)}
                            className="relative flex min-h-11 flex-1 cursor-default select-none items-center rounded-control text-sm text-left outline-none transition-colors menu-item-state px-2 py-1.5 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 gap-2 sm:min-h-9"
                          >
                            {row}
                          </button>
                          <Link
                            to={setupTo.to}
                            params={setupTo.params}
                            className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-accent hover:underline"
                            onClick={() => setAccountMenuOpen(false)}
                          >
                            Connect
                          </Link>
                        </div>
                      );
                    }

                    // On mobile a side-anchored submenu can render off-screen and is
                    // hard to tap, so expand the accounts inline instead.
                    if (isMobile) {
                      const expanded = expandedChannel === c;
                      return (
                        <div key={c} className="mx-1">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => selectChannel(c)}
                              className="flex min-h-11 flex-1 items-center gap-2 rounded px-2 text-sm text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {row}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedChannel(expanded ? null : c);
                              }}
                              aria-expanded={expanded}
                              aria-label={`${expanded ? "Hide" : "Show"} ${channelLabel(c)} accounts`}
                              className="grid h-11 w-9 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted"
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                              />
                            </button>
                          </div>
                          {expanded && (
                            <div className="mb-1 ml-4 border-l border-border pl-2">
                              {chAccounts.map((a) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => selectAccount(a)}
                                  className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-sm text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <ChannelIcon
                                    channel={c}
                                    boxed
                                    className="h-5 w-5 rounded-full"
                                    iconClassName="h-full w-full"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate">{a.display_name}</span>
                                    <span className="block truncate text-[11px] text-muted-foreground">
                                      {a.phone_number ?? channelLabel(c)}
                                    </span>
                                  </span>
                                  <AccountStatusBadge status={a.status} reason={a.status_reason} />
                                  {accountId === a.id && (
                                    <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <DropdownMenuSub key={c}>
                        <DropdownMenuSubTrigger className="gap-2 mx-1">
                          {row}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          sideOffset={6}
                          alignOffset={-4}
                          collisionPadding={12}
                          avoidCollisions
                          className="z-[60] max-h-[60vh] w-[min(15rem,calc(100vw-2rem))] overflow-y-auto p-1"
                        >
                          <DropdownMenuItem className="gap-2" onSelect={() => selectChannel(c)}>
                            <ChannelIcon
                              channel={c}
                              boxed
                              className="h-5 w-5 rounded-full"
                              iconClassName="h-full w-full"
                            />
                            <span className="flex-1">All {channelLabel(c)} accounts</span>
                            {isActive && !accountId && (
                              <Check className="h-3.5 w-3.5 text-accent" />
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {chAccounts.map((a) => (
                            <DropdownMenuItem
                              key={a.id}
                              className="gap-2"
                              onSelect={() => selectAccount(a)}
                            >
                              <ChannelIcon
                                channel={c}
                                boxed
                                className="h-5 w-5 rounded-full"
                                iconClassName="h-full w-full"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{a.display_name}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {a.phone_number ?? channelLabel(c)}
                                </span>
                              </span>
                              <AccountStatusBadge status={a.status} reason={a.status_reason} />
                              {accountId === a.id && <Check className="h-3.5 w-3.5 text-accent" />}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    );
                  })}
                  {visibleChannels.length === 0 && (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                      No channels or accounts match "{accountSearch}"
                    </div>
                  )}
                  {accounts.length === 0 && (
                    <div className="mt-1 border-t border-border px-3 py-3 text-center space-y-2">
                      <p className="text-xs text-muted-foreground">
                        No channel accounts connected yet.
                      </p>
                      <Link
                        to="/integrations/marketplace"
                        className="inline-block text-xs font-medium text-accent hover:underline"
                        onClick={() => setAccountMenuOpen(false)}
                      >
                        Connect a channel
                      </Link>
                    </div>
                  )}
                </>
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex w-full min-w-0 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isMobile ? "Search conversations" : "Search name, phone or message"}
              className="h-9 pl-8"
              aria-label="Search conversations by contact name, phone or message text"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Conversation list options" title="Conversation list options">
                {syncFailed ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <SlidersHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Conversation list</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <ArrowUpDown className="h-4 w-4" />
                  Sort: {sortLabel(sort)}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuRadioGroup value={sort} onValueChange={(value) => setSort(value as ConversationSort)}>
                    <DropdownMenuRadioItem value="recent">Most recent</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="priority">Priority</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="unread">Unread first</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuCheckboxItem
                checked={selectMode}
                onCheckedChange={(checked) => {
                  setSelectMode(Boolean(checked));
                  setSelectedIds(new Set());
                }}
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                Bulk select
              </DropdownMenuCheckboxItem>
              <DropdownMenuItem onSelect={() => setLabelsOpen(true)}>
                <Tag className="mr-2 h-4 w-4" />
                Manage labels
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAdvOpen(true)}>
                <Search className="mr-2 h-4 w-4" />
                Advanced search
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {showSyncButton && (
                <DropdownMenuItem onSelect={syncNow} disabled={manualSync}>
                  <RefreshCw className={cn("mr-2 h-4 w-4", manualSync && "animate-spin")} />
                  Sync conversations
                </DropdownMenuItem>
              )}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  Sync settings
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  <DropdownMenuCheckboxItem checked={syncSettings.realtimeEnabled} onCheckedChange={(checked) => updateSyncSettings({ realtimeEnabled: Boolean(checked) })}>
                    Live updates
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Background refresh</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-44">
                      <DropdownMenuRadioGroup value={String(syncSettings.refetchIntervalMs)} onValueChange={(value) => updateSyncSettings({ refetchIntervalMs: Number(value) })}>
                        {SYNC_INTERVAL_OPTIONS.map((option) => (
                          <DropdownMenuRadioItem key={option.value} value={String(option.value)}>{option.label}</DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Manual sync button</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-44">
                      <DropdownMenuRadioGroup value={syncSettings.syncButtonMode} onValueChange={(value) => updateSyncSettings({ syncButtonMode: value as typeof syncSettings.syncButtonMode })}>
                        {SYNC_BUTTON_OPTIONS.map((option) => (
                          <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <Info className={cn("h-4 w-4", syncFailed && "text-destructive")} />
                  Sync details
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64">
                  <DropdownMenuLabel>Status: {isFetching ? "Syncing" : syncFailed ? "Failed" : "Healthy"}</DropdownMenuLabel>
                  <div className="space-y-1 px-2 py-1 text-xs text-muted-foreground">
                    <div>Last synced: {lastSyncedLabel}</div>
                    <div>Duration: {formatSyncDuration(lastSyncMs)}</div>
                    <div>Conversations: {conversations.length}</div>
                    {syncFailed && (
                      <>
                        <div className="break-words text-destructive">Last error: {lastErrorMsg ?? "Unknown sync error"}</div>
                        <div className="text-destructive">Next retry: {nextRetryLabel}</div>
                      </>
                    )}
                  </div>
                  {syncRuns.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Recent syncs</DropdownMenuLabel>
                        <div className="max-h-32 space-y-1 overflow-y-auto px-2 pb-1 text-xs text-muted-foreground">
                          {syncRuns.map((run) => (
                            <div key={run.at}>
                              <div className="flex justify-between gap-2">
                                <span className={cn(!run.ok && "text-destructive")}>
                                  {formatZoned(new Date(run.at), { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                                </span>
                                <span>
                                  {formatSyncDuration(run.ms)} · {run.count} {run.count === 1 ? "item" : "items"}
                                </span>
                              </div>
                              {!run.ok && run.error && (
                                <div className="break-words text-destructive">{run.error}</div>
                              )}
                            </div>
                          ))}
                        </div>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={syncNow} disabled={manualSync}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", manualSync && "animate-spin")} />
                    Sync now
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {selectMode && conversations.length > 0 && (
        <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 bg-muted/40">
          <Checkbox
            checked={selectedIds.size > 0 && selectedIds.size === conversations.length}
            onCheckedChange={(v) => {
              if (v) setSelectedIds(new Set(conversations.map((c) => c.id)));
              else setSelectedIds(new Set());
            }}
            aria-label="Select all"
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all visible"}
          </span>
          <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            <SlidersHorizontal className="h-3 w-3" />
            Bulk mode
          </div>
        </div>
      )}

      {/* Background refresh indicator */}
      {manualSync && !isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30 text-[11px] text-muted-foreground"
        >
          <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
          Updating conversations
        </div>
      )}

      {/* List */}
      <ScrollArea
        type="hover"
        className="group/inbox-scroll min-h-0 flex-1"
        viewportClassName="[&>div]:!block [&>div]:!w-full"
        role="listbox"
        aria-label="Conversations"
      >
        {isLoading ? (
          <div role="status" aria-live="polite">
            <span className="sr-only">Loading conversations</span>
            {Array.from({ length: 8 }).map((_, i) => (
              <ConversationListItemSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="p-6 text-center space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive" aria-hidden />
            <div className="text-sm font-medium">Could not load conversations</div>
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {(error as { message?: string } | null)?.message ?? "Unknown error"}
            </p>
            <Button size="sm" variant="outline" onClick={syncNow} disabled={manualSync}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", manualSync && "animate-spin")} />
              Retry sync
            </Button>
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState
            filter={filter}
            filterLabel={TABS.find((t) => t.id === filter)?.label ?? filter}
            search={debouncedSearch}
            accountName={selectedAccount?.display_name ?? null}
            channelCount={channels.length}
            canReset={Boolean(selectedAccount) || filter !== "all" || channels.length > 0}
            onReset={resetFilters}
            onSync={syncNow}
            isFetching={manualSync}
          />
        ) : (
          <>
            {listItems.map((item) => {
              if (item.kind === "toggle") {
                return (
                  <button
                    key="pinned-toggle"
                    type="button"
                    onClick={() => setPinnedExpanded((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    <span>{pinnedExpanded ? "Show less" : `${item.hidden} more pinned`}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        pinnedExpanded && "rotate-180",
                      )}
                    />
                  </button>
                );
              }
              const c = item.c;
              const checked = selectedIds.has(c.id);
              return (
                <div key={c.id} className={cn("flex items-stretch", selectMode && "gap-0")}>
                  {selectMode && (
                    <label className="flex items-center px-2 border-b border-border cursor-pointer hover:bg-muted">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setSelectedIds((s) => {
                            const n = new Set(s);
                            if (v) n.add(c.id);
                            else n.delete(c.id);
                            return n;
                          })
                        }
                        aria-label="Select conversation"
                      />
                    </label>
                  )}
                  <div className="flex-1 min-w-0">
                    <ConversationListItem
                      conversation={c}
                      isActive={c.id === selectedId}
                      typingUserIds={typingByConversation[c.id]}
                      openTaskCount={openTaskCounts?.[c.id] ?? 0}
                      onSelect={() =>
                        selectMode
                          ? setSelectedIds((s) => {
                              const n = new Set(s);
                              if (n.has(c.id)) n.delete(c.id);
                              else n.add(c.id);
                              return n;
                            })
                          : onSelect(c)
                      }
                      onAction={onItemAction}
                    />
                  </div>
                </div>
              );
            })}
            <div ref={sentinelRef} className="h-9" />
            {isFetchingNextPage && (
              <div className="p-3">
                <ConversationListItemSkeleton />
              </div>
            )}
          </>
        )}
      </ScrollArea>

      {selectMode && (
        <BulkActionsBar
          selectedIds={Array.from(selectedIds)}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      <LabelManagerDialog open={labelsOpen} onOpenChange={setLabelsOpen} />
      <AdvancedSearchDialog
        open={advOpen}
        onOpenChange={setAdvOpen}
        onSelectHit={(hit) => {
          if (hit.conversation_id) {
            // Best-effort: match against currently loaded list; otherwise the caller reloads.
            const found = conversations.find((c) => c.id === hit.conversation_id);
            if (found) onSelect(found);
          }
        }}
      />
    </div>
  );
}

function sortLabel(s: ConversationSort) {
  switch (s) {
    case "oldest":
      return "Oldest";
    case "priority":
      return "Priority";
    case "unread":
      return "Unread";
    default:
      return "Recent";
  }
}

function EmptyState({
  filter,
  filterLabel,
  search,
  accountName,
  channelCount,
  canReset,
  onReset,
  onSync,
  isFetching,
}: {
  filter: ConversationFilter;
  filterLabel: string;
  search: string;
  accountName: string | null;
  channelCount: number;
  canReset: boolean;
  onReset: () => void;
  onSync: () => void;
  isFetching: boolean;
}) {
  const title = search
    ? "No matches"
    : accountName
      ? `No conversations for ${accountName}`
      : filter === "unread"
        ? "Everything's read"
        : filter === "mine"
          ? "No conversations assigned to you"
          : channelCount > 0
            ? "No conversations on the selected channels"
            : "No conversations yet";

  const detail = search
    ? `Nothing found for "${search}".`
    : accountName
      ? `Nothing under the “${filterLabel}” filter for this account. Conversations on other channels may still exist — use “Show all conversations”.`
      : filter !== "all" || channelCount > 0
        ? `Nothing matches the “${filterLabel}” filter right now.`
        : "New messages appear here in realtime.";

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="h-12 w-12 rounded-full bg-muted grid place-items-center mb-3">
        <InboxIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-[260px] [overflow-wrap:anywhere]">
        {detail}
      </p>
      <div className="mt-4 flex items-center gap-2">
        {canReset && (
          <Button size="sm" variant="outline" onClick={onReset}>
            Show all conversations
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onSync} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>
    </div>
  );
}
