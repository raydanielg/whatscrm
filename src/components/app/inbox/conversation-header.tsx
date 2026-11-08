import { useCallback, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Star,
  Pin,
  Trash2,
  AlertOctagon,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  Bell,
  BellOff,
  UserPlus,
  ArrowLeft,
  Phone,
  Video,
  Mail,
  MessageCircle,
  Send,
  Link2,
  User,
  Users,
  Gauge,
  Sparkles,
  Stethoscope,
  Download,
  CheckSquare,
  CalendarClock,
  MailOpen,
  PanelRightOpen,
  PanelRightClose,
  ChevronRight,
  MessageSquareText,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConversationRow, InboxChannel } from "@/hooks/use-conversations";
import { channelLabel } from "@/lib/inbox/channel-capabilities";
import { useCustomerProfile } from "@/hooks/use-customer-profile";
import {
  resolveContactDisplayName,
  resolveContactInitials,
  resolveContactPhoneSubtitle,
} from "@/lib/inbox/contact-display";
import { cn } from "@/lib/utils";
import { HandoffToolbar } from "./handoff-toolbar";
import { ChannelSwitcher } from "./channel-switcher";
import { ChannelIcon as BrandChannelIcon } from "./channel-icon";
import { RequestPaymentButton } from "@/components/app/payments/request-payment-button";
import { MotionStagger, MotionItem } from "@/shared/motion";
import { Skeleton, SkeletonCircle } from "@/shared/components/skeleton";
import { EmptyState } from "@/shared/components/empty-state";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { ExportTranscriptDialog } from "./export-transcript-dialog";
import { CreateTaskDialog } from "./create-task-dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNowStrict } from "date-fns";

type Props = {
  conversation: ConversationRow;
  onBack?: () => void;
  onArchive?: () => void;
  onStar?: () => void;
  onPin?: () => void;
  onSpam?: () => void;
  onTrash?: () => void;
  onResolve?: () => void;
  onAssign?: () => void;
  onMute?: () => void;
  onMarkUnread?: () => void;
  onLinkContact?: () => void;
  onOpenContact?: () => void;
  /** Opens the per-conversation link diagnostics drawer. */
  onDiagnostics?: () => void;
  /** Currently open right-hand panel (null when closed). */
  panel?: InboxPanel;
  /** Toggle a right-hand panel. Buttons render only when provided. */
  onPanelToggle?: (panel: Exclude<InboxPanel, null>) => void;
};

export type InboxPanel = "customer" | "team" | "sla" | "intel" | "work" | null;

const PANEL_BUTTONS: { id: Exclude<InboxPanel, null>; label: string; icon: typeof User }[] = [
  { id: "customer", label: "Contact details", icon: User },
  { id: "intel", label: "Conversation intel", icon: Sparkles },
  { id: "work", label: "Work & reminders", icon: CalendarClock },
  { id: "sla", label: "SLA & priority", icon: Gauge },
  { id: "team", label: "Team collaboration", icon: Users },
];

type MenuGroup = "task" | "contact" | "conversation" | "tools" | "panels" | "danger";

const MENU_GROUP_LABELS: Record<MenuGroup, string> = {
  task: "Tasks",
  contact: "Contact",
  conversation: "Conversation",
  tools: "Tools & notifications",
  panels: "Panels",
  danger: "Danger zone",
};
const MENU_GROUP_ORDER: MenuGroup[] = [
  "task",
  "contact",
  "conversation",
  "tools",
  "panels",
  "danger",
];
const MENU_GROUP_ICONS: Record<MenuGroup, typeof Star> = {
  task: CheckSquare,
  contact: User,
  conversation: MessageSquareText,
  tools: Download,
  panels: PanelRightOpen,
  danger: AlertOctagon,
};

/**
 * Conversation header — sticky top bar above the message thread.
 * Inspired by Front / Intercom: identity on the left, channel + status
 * chips in the middle, actions on the right.
 */
export function ConversationHeader({
  conversation,
  onBack,
  onArchive,
  onStar,
  onPin,
  onSpam,
  onTrash,
  onResolve,
  onAssign,
  onMute,
  onMarkUnread,
  onLinkContact,
  onOpenContact,
  onDiagnostics,
  panel,
  onPanelToggle,
}: Props) {
  const { data: contact, isLoading: contactLoading } = useCustomerProfile(conversation.contact_id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [activeMenuGroup, setActiveMenuGroup] = useState<MenuGroup | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const meta = (conversation.metadata ?? {}) as Record<string, unknown>;
  const starred = meta.starred === "true" || meta.starred === true;
  const pinned = meta.pinned === "true" || meta.pinned === true;
  const muted = meta.muted === "true" || meta.muted === true;

  const displayName = useMemo(
    () => resolveContactDisplayName(contact, conversation.contact),
    [contact, conversation.contact],
  );
  const initials = useMemo(
    () => resolveContactInitials(contact, conversation.contact),
    [contact, conversation.contact],
  );
  const phoneSubtitle = useMemo(
    () => resolveContactPhoneSubtitle(contact, conversation.contact),
    [contact, conversation.contact],
  );
  const isUnknownContact = displayName === "Unknown contact";

  type MenuAction = {
    key: string;
    label: string;
    icon: typeof Star;
    onClick?: () => void;
    destructive?: boolean;
    group: MenuGroup;
  };

  const menuActions = useMemo<MenuAction[]>(() => {
    const items: MenuAction[] = [];
    if (onAssign)
      items.push({
        key: "assign",
        label: "Assign",
        icon: UserPlus,
        onClick: onAssign,
        group: "task",
      });
    items.push({
      key: "create-task",
      label: "Create task",
      icon: CheckSquare,
      onClick: () => setCreateTaskOpen(true),
      group: "task",
    });
    if (onLinkContact)
      items.push({
        key: "link",
        label: "Link contact",
        icon: Link2,
        onClick: onLinkContact,
        group: "contact",
      });
    if (onDiagnostics)
      items.push({
        key: "diag",
        label: "Diagnose linking",
        icon: Stethoscope,
        onClick: onDiagnostics,
        group: "contact",
      });
    if (onStar)
      items.push({
        key: "star",
        label: starred ? "Unstar" : "Star",
        icon: Star,
        onClick: onStar,
        group: "conversation",
      });
    if (onPin)
      items.push({
        key: "pin",
        label: pinned ? "Unpin" : "Pin to top",
        icon: Pin,
        onClick: onPin,
        group: "conversation",
      });
    if (onMarkUnread)
      items.push({
        key: "mark-unread",
        label: "Mark unread",
        icon: MailOpen,
        onClick: onMarkUnread,
        group: "conversation",
      });
    // Inline Resolve and panel buttons are hidden on narrow containers, so keep
    // them reachable from the overflow menu.
    if (onResolve) {
      items.push({
        key: "resolve",
        label: conversation.status === "resolved" ? "Reopen" : "Resolve",
        icon: conversation.status === "resolved" ? Clock : CheckCircle2,
        onClick: onResolve,
        group: "conversation",
      });
    }
    if (onMute)
      items.push({
        key: "mute",
        label: muted ? "Unmute" : "Mute notifications",
        icon: muted ? Bell : BellOff,
        onClick: onMute,
        group: "tools",
      });
    items.push({
      key: "export",
      label: "Export transcript",
      icon: Download,
      onClick: () => setExportOpen(true),
      group: "tools",
    });
    if (onPanelToggle) {
      for (const p of PANEL_BUTTONS) {
        items.push({
          key: `panel-${p.id}`,
          label: panel === p.id ? `Hide ${p.label}` : p.label,
          icon: p.icon,
          onClick: () => onPanelToggle(p.id),
          group: "panels",
        });
      }
    }
    if (onArchive) {
      items.push({
        key: "archive",
        label: conversation.is_archived ? "Unarchive" : "Archive",
        icon: conversation.is_archived ? ArchiveRestore : Archive,
        onClick: onArchive,
        group: "danger",
      });
    }
    if (onSpam)
      items.push({
        key: "spam",
        label: "Mark as spam",
        icon: AlertOctagon,
        onClick: onSpam,
        group: "danger",
      });
    if (onTrash)
      items.push({
        key: "trash",
        label: "Move to trash",
        icon: Trash2,
        onClick: onTrash,
        destructive: true,
        group: "danger",
      });
    return items;
  }, [
    onAssign,
    onLinkContact,
    onDiagnostics,
    onStar,
    onPin,
    onMarkUnread,
    onResolve,
    onPanelToggle,
    onMute,
    onArchive,
    onSpam,
    onTrash,
    starred,
    pinned,
    muted,
    conversation.is_archived,
    conversation.status,
    panel,
  ]);

  const groupedMenuActions = useMemo(
    () =>
      MENU_GROUP_ORDER.map((group) => ({
        group,
        items: menuActions.filter((action) => action.group === group),
      })).filter((section) => section.items.length > 0),
    [menuActions],
  );

  // --- Analytics: menu open / action / close (drop-off) -------------------
  const menuOpenedAt = useRef<number | null>(null);
  const actionTaken = useRef(false);

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpen(open);
      const base = {
        conversation_id: conversation.id,
        channel: conversation.channel,
        action_count: menuActions.length,
      };
      if (open) {
        menuOpenedAt.current = Date.now();
        actionTaken.current = false;
        trackUiEvent("inbox.conversation_menu.open", { ...base, loading: contactLoading });
      } else {
        trackUiEvent("inbox.conversation_menu.close", {
          ...base,
          action_taken: actionTaken.current,
          dropped_off: !actionTaken.current,
          duration_ms: menuOpenedAt.current ? Date.now() - menuOpenedAt.current : null,
        });
        menuOpenedAt.current = null;
        // Collapse back to the top level so the next open starts fresh.
        setActiveMenuGroup(null);
      }
    },
    [conversation.id, conversation.channel, menuActions.length, contactLoading],
  );

  const handleMenuAction = useCallback(
    (action: MenuAction) => {
      actionTaken.current = true;
      trackUiEvent("inbox.conversation_menu.action", {
        conversation_id: conversation.id,
        channel: conversation.channel,
        action: action.key,
        destructive: !!action.destructive,
        time_to_action_ms: menuOpenedAt.current ? Date.now() - menuOpenedAt.current : null,
      });
      action.onClick?.();
    },
    [conversation.id, conversation.channel],
  );

  const priorityColor =
    conversation.priority === "urgent"
      ? "bg-destructive text-destructive-foreground"
      : conversation.priority === "high"
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-muted-foreground";

  return (
    <>
      <header
        data-testid="inbox-conversation-header"
        style={{
          paddingTop: "max(0.5rem, env(safe-area-inset-top))",
          paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        }}
        className="@container flex items-center gap-2 py-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 min-h-header-safe z-20"
      >
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 min-[992px]:hidden"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        <HoverCard openDelay={150} closeDelay={100}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              onClick={onOpenContact}
              disabled={!onOpenContact}
              className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-control -mx-1 px-1 py-1.5 hover:bg-muted/50 disabled:hover:bg-transparent disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @lg:max-w-80"
              aria-label="View contact details"
            >
              <Avatar className="h-9 w-9 shrink-0">
                {contact?.avatar_url && (
                  <AvatarImage src={contact.avatar_url} alt={contact.name ?? ""} />
                )}
                <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-sm font-semibold truncate">{displayName}</h2>
                  {pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                  {starred && <Star className="h-3 w-3 fill-primary text-primary shrink-0" />}
                  {muted && <BellOff className="h-3 w-3 text-muted-foreground shrink-0" />}
                  {isUnknownContact && onLinkContact && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="inline-flex items-center h-6 px-2 text-[11px] rounded-control shrink-0 border border-border bg-background hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLinkContact();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onLinkContact();
                        }
                      }}
                    >
                      <Link2 className="h-3 w-3 " /> Link contact
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                  <BrandChannelIcon
                    channel={conversation.channel}
                    className="h-5 w-5"
                    iconClassName="h-4 w-4"
                  />
                  <span className="truncate">{channelLabel(conversation.channel)}</span>
                </div>
              </div>
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            align="start"
            className="w-80 text-zinc-900 shadow-lg text-sm"
            style={{ backgroundColor: "#ffffff", opacity: 1, animation: "none" }}
          >
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-10 w-10">
                {contact?.avatar_url && (
                  <AvatarImage src={contact.avatar_url} alt={contact.name ?? ""} />
                )}
                <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-semibold truncate">{displayName}</div>
                {contact?.job_title && (
                  <div className="text-xs text-muted-foreground truncate">
                    {contact.job_title}
                    {contact.company?.name ? ` · ${contact.company.name}` : ""}
                  </div>
                )}
              </div>
            </div>
            <dl className="space-y-1.5 text-xs">
              {phoneSubtitle && <DetailRow label="Phone" value={phoneSubtitle} />}
              {contact?.email && <DetailRow label="Email" value={contact.email} />}
              <DetailRow label="Channel" value={channelLabel(conversation.channel)} />
              {conversation.subject && <DetailRow label="Subject" value={conversation.subject} />}
              <DetailRow label="Status" value={conversation.status} capitalize />
              <DetailRow label="Priority" value={conversation.priority} capitalize />
              {contact?.last_seen_at && (
                <DetailRow
                  label="Last seen"
                  value={formatDistanceToNowStrict(new Date(contact.last_seen_at), {
                    addSuffix: true,
                  })}
                />
              )}
            </dl>
          </HoverCardContent>
        </HoverCard>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Popover open={controlsOpen} onOpenChange={setControlsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 border border-border @lg:hidden"
                aria-label="Conversation controls"
                title="Conversation controls"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))] space-y-3 p-3">
              <div className="text-xs font-medium text-muted-foreground">Conversation controls</div>
              <div className="flex flex-wrap items-center gap-2">
                <ChannelSwitcher
                  conversation={conversation}
                  align="end"
                  className="min-w-0 flex-wrap"
                />
                <HandoffToolbar
                  conversationId={conversation.id}
                  handoffState={
                    (conversation as unknown as { handoff_state?: "ai" | "human" | "queued" })
                      .handoff_state ?? "ai"
                  }
                  aiEnabled={
                    (conversation as unknown as { ai_enabled?: boolean }).ai_enabled ?? true
                  }
                  onAssign={onAssign}
                  onResolve={onResolve}
                  isResolved={conversation.status === "resolved"}
                />
              </div>
              {onPanelToggle && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setControlsOpen(false);
                    onPanelToggle("customer");
                  }}
                >
                  <User className="h-4 w-4" />
                  {panel === "customer" ? "Hide customer profile" : "Show customer profile"}
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <div className="hidden items-center gap-1.5 @lg:flex">
            {conversation.priority !== "normal" && (
              <span
                className={cn(
                  "text-[11px] font-medium px-2 py-0.5 capitalize rounded hidden @lg:inline-flex bg-muted text-muted-foreground",
                  priorityColor,
                )}
              >
                {conversation.priority}
              </span>
            )}
            <ChannelSwitcher conversation={conversation} align="end" />
            <HandoffToolbar
              conversationId={conversation.id}
              handoffState={
                (conversation as unknown as { handoff_state?: "ai" | "human" | "queued" })
                  .handoff_state ?? "ai"
              }
              aiEnabled={(conversation as unknown as { ai_enabled?: boolean }).ai_enabled ?? true}
              onAssign={onAssign}
              onResolve={onResolve}
              isResolved={conversation.status === "resolved"}
            />

            {conversation.contact_id && (
              <RequestPaymentButton
                prefill={{
                  contactId: conversation.contact_id,
                  customerName: displayName,
                  customerPhone: contact?.phone ?? undefined,
                  customerEmail: contact?.email ?? undefined,
                }}
                variant="outline"
                className="hidden @xl:inline-flex"
              />
            )}

            {onPanelToggle && (
              <Button
                variant={panel === "customer" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 border border-border"
                onClick={() => onPanelToggle("customer")}
                aria-label={
                  panel === "customer" ? "Hide customer profile" : "Show customer profile"
                }
                aria-pressed={panel === "customer"}
                title={panel === "customer" ? "Hide customer profile" : "Show customer profile"}
              >
                {panel === "customer" ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 border border-border"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 p-0 overflow-hidden shadow-lg">
              <MotionStagger className="p-1" gap={0.028} delay={0.02}>
                {activeMenuGroup === null ? (
                  <MotionItem
                    preset="row"
                    className="flex items-center gap-2 p-2 mb-1 border-b border-border min-[992px]:hidden"
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={onBack}
                      aria-label="Back to conversations"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    {contactLoading ? (
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <SkeletonCircle size={24} />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    ) : (
                      <span className="text-sm font-semibold truncate">{displayName}</span>
                    )}
                  </MotionItem>
                ) : (
                  // Second level: a dedicated back row swaps the contact header for the
                  // active group's name, keeping the drill-down inside the same panel
                  // width instead of a side-opening flyout.
                  <MotionItem
                    preset="row"
                    className="flex items-center gap-1 p-1 mb-1 border-b border-border"
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 gap-1 text-muted-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveMenuGroup(null);
                      }}
                    >
                      <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <span className="text-sm font-semibold truncate pl-1">
                      {MENU_GROUP_LABELS[activeMenuGroup]}
                    </span>
                  </MotionItem>
                )}

                {contactLoading ? (
                  <div className="space-y-1 p-1" role="status" aria-busy="true">
                    <span className="sr-only">Loading actions</span>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-3" style={{ width: `${70 - i * 8}%` }} />
                      </div>
                    ))}
                  </div>
                ) : menuActions.length === 0 ? (
                  <EmptyState
                    variant="compact"
                    icon={MoreHorizontal}
                    title="No actions available"
                    description="You don't have permission to act on this conversation."
                  />
                ) : activeMenuGroup === null ? (
                  // Top level: one row per group. Picking a group drills into its
                  // actions instead of rendering everything flat (which made the
                  // panel too tall).
                  groupedMenuActions.map((section) => {
                    const GroupIcon = MENU_GROUP_ICONS[section.group];
                    return (
                      <MotionItem preset="row" key={section.group}>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setActiveMenuGroup(section.group);
                          }}
                        >
                          <GroupIcon className="h-4 w-4 mr-2" />
                          <span className="flex-1">{MENU_GROUP_LABELS[section.group]}</span>
                          <span className="text-xs text-muted-foreground ">
                            {section.items.length}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </DropdownMenuItem>
                      </MotionItem>
                    );
                  })
                ) : (
                  (
                    groupedMenuActions.find((section) => section.group === activeMenuGroup)
                      ?.items ?? []
                  ).map((action) => (
                    <MotionItem preset="row" key={action.key}>
                      <DropdownMenuItem
                        onClick={() => handleMenuAction(action)}
                        className={
                          action.destructive ? "text-destructive focus:text-destructive" : undefined
                        }
                      >
                        <action.icon className="h-4 w-4 mr-2" /> {action.label}
                      </DropdownMenuItem>
                    </MotionItem>
                  ))
                )}
              </MotionStagger>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        conversation={conversation}
      />
      <ExportTranscriptDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        meta={{
          conversationId: conversation.id,
          channel: channelLabel(conversation.channel),
          contactName: displayName,
          subject: conversation.subject ?? null,
        }}
      />
    </>
  );
}

function DetailRow({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-zinc-500 shrink-0">{label}</dt>
      <dd className={cn("text-right font-medium min-w-0 break-all", capitalize && "capitalize")}>
        {value}
      </dd>
    </div>
  );
}
