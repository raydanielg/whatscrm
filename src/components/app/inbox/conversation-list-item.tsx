import { Fragment } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  CheckCheck,
  Pin,
  Star,
  AlertCircle,
  ListTodo,
  MoreHorizontal,
  MailOpen,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  RotateCcw,
  MessageSquare,
  MoreVertical,
} from "lucide-react";
import type { ConversationRow } from "@/hooks/use-conversations";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  resolveContactDisplayName,
  resolveContactInitials,
  resolveContactPhoneSubtitle,
} from "@/lib/inbox/contact-display";
import { cn } from "@/lib/utils";
import { ChannelIcon } from "./channel-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ConversationListAction = "open" | "unread" | "star" | "pin" | "resolve" | "archive";

type Props = {
  conversation: ConversationRow;
  isActive?: boolean;
  onSelect: (id: string) => void;
  onAction?: (conversation: ConversationRow, action: ConversationListAction) => void;
  typingUserIds?: string[];
  /** Open (not completed or cancelled) tasks linked to this conversation. */
  openTaskCount?: number;
};

const priorityStyles: Record<string, string> = {
  urgent: "text-red-500",
  high: "text-orange-500",
  normal: "text-transparent",
  low: "text-transparent",
};

export function ConversationListItem({
  conversation: c,
  isActive,
  onSelect,
  onAction,
  typingUserIds,
  openTaskCount = 0,
}: Props) {
  const name = resolveContactDisplayName(c.contact);
  const initials = resolveContactInitials(c.contact);
  const phoneSubtitle = resolveContactPhoneSubtitle(c.contact);
  const unread = c.unread_count > 0;
  const pinnedMeta = (c.metadata ?? {}) as Record<string, unknown>;
  const starred = pinnedMeta.starred === true || pinnedMeta.starred === "true";
  const pinned = pinnedMeta.pinned === true || pinnedMeta.pinned === "true";
  const online =
    c.contact?.last_seen_at &&
    Date.now() - new Date(c.contact.last_seen_at).getTime() < 5 * 60 * 1000;
  const isTyping = (typingUserIds?.length ?? 0) > 0;
  const preview = isTyping ? "typing" : (c.last_message_preview ?? "No messages yet");
  const lastMessageTime = c.last_message_at
    ? formatDistanceToNowStrict(new Date(c.last_message_at), { addSuffix: false })
        .replace(" seconds", "s")
        .replace(" second", "s")
        .replace(" minutes", "m")
        .replace(" minute", "m")
        .replace(" hours", "h")
        .replace(" hour", "h")
        .replace(" days", "d")
        .replace(" day", "d")
        .replace(" months", "mo")
        .replace(" month", "mo")
        .replace(" years", "y")
        .replace(" year", "y")
    : "";
  const actions: Array<{ id: ConversationListAction; label: string; icon: LucideIcon }> = [
    { id: "open", label: "Open conversation", icon: MessageSquare },
    ...(!unread ? [{ id: "unread" as const, label: "Mark as unread", icon: MailOpen }] : []),
    { id: "star", label: starred ? "Remove star" : "Star", icon: Star },
    { id: "pin", label: pinned ? "Unpin" : "Pin to top", icon: Pin },
    {
      id: "resolve",
      label: c.status === "resolved" ? "Reopen" : "Mark as resolved",
      icon: c.status === "resolved" ? RotateCcw : CheckCircle2,
    },
    {
      id: "archive",
      label: c.is_archived ? "Unarchive" : "Archive",
      icon: c.is_archived ? ArchiveRestore : Archive,
    },
  ];
  const runAction = (action: ConversationListAction) => {
    if (action === "open") onSelect(c.id);
    else onAction?.(c, action);
  };

  return (
    <div className="relative w-full min-w-0">
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        aria-current={isActive ? "true" : undefined}
        className={cn(
          "w-full min-w-0 m-0 text-left flex items-start gap-2.5 pl-4 pr-4 py-2.5 rounded-none transition-colors relative overflow-hidden sm:gap-3 sm:pl-4 sm:pr-4 sm:py-3",
          "border-b border-border bg-transparent hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive && "bg-muted/90",
        )}
      >
        <div className="relative shrink-0">
          <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
            <AvatarImage src={c.contact?.avatar_url ?? undefined} alt={name} />
            <AvatarFallback className="text-xs font-medium">{initials || "?"}</AvatarFallback>
          </Avatar>
          {online && (
            <span
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background"
              aria-label="Online"
            />
          )}
          <ChannelIcon
            channel={c.channel}
            boxed
            className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full ring-2 ring-background bg-card"
            iconClassName="h-full w-full"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 pr-20 sm:gap-2">
            <span
              className={cn(
                "min-w-0 truncate text-base sm:text-sm",
                unread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
              )}
            >
              {name}
            </span>
            {phoneSubtitle && (
              <span className="hidden sm:inline text-[11px] text-muted-foreground shrink-0  truncate max-w-[110px]">
                {phoneSubtitle}
              </span>
            )}

            {pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
            {starred && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />}
            {c.priority === "urgent" && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
            {openTaskCount > 0 && (
              <span
                title={`${openTaskCount} open task${openTaskCount > 1 ? "s" : ""}`}
                className="inline-flex items-center gap-0.5 rounded-control bg-primary/10 px-1 text-[11px] font-medium text-primary shrink-0"
              >
                <ListTodo className="h-2.5 w-2.5" />
                {openTaskCount}
              </span>
            )}
          </div>

          <div className="flex min-w-0 items-center gap-1 mt-0.5">
            {c.last_message_from === "agent" && (
              <CheckCheck className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-xs",
                isTyping && "text-primary italic",
                !isTyping && unread ? "text-foreground/90 font-medium" : "text-muted-foreground",
              )}
            >
              {preview}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mt-1.5 min-h-[18px]">
            {c.labels?.slice(0, 3).map((label) => (
              <span
                key={label.id}
                className="inline-flex max-w-[90px] items-center truncate text-[11px] sm:text-[11px] px-1.5 py-0.25 rounded font-medium"
                style={{
                  backgroundColor: label.color ? `${label.color}20` : undefined,
                  color: label.color ?? undefined,
                  border: label.color ? `1px solid ${label.color}40` : undefined,
                }}
              >
                {label.name}
              </span>
            ))}
            {c.assignee && (
              <span className="flex shrink-0 items-center gap-1 text-[11px] sm:text-[11px] text-muted-foreground">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={c.assignee.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[8px]">
                    {(c.assignee.display_name ?? "?")[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline truncate max-w-[80px]">
                  {c.assignee.display_name}
                </span>
              </span>
            )}
            {unread && (
              <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1.5 grid place-items-center rounded-control bg-primary text-primary-foreground text-[11px] sm:text-[11px] font-semibold ">
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </span>
            )}
          </div>
        </div>
      </button>
      {onAction && (
        <div className="absolute right-2 top-2 flex items-center gap-1 text-muted-foreground sm:top-2.5">
          {lastMessageTime && (
            <>
              <span className="shrink-0 text-[11px]">{lastMessageTime}</span>
              <span aria-hidden="true" className="text-[12px]">
                ·
              </span>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${name}`}
                className="grid h-4 w-4 shrink-0 place-items-center rounded-control cursor-pointer"
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {actions.map(({ id, label, icon: Icon }, index) => (
                <Fragment key={id}>
                  {index === 1 && <DropdownMenuSeparator />}
                  <DropdownMenuItem onSelect={() => runAction(id)} className="gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                  </DropdownMenuItem>
                </Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

export function ConversationListItemSkeleton() {
  return (
    <div className="flex items-start gap-3 mx-2 my-1.5 px-3 py-3 rounded-control bg-muted/35 animate-pulse">
      <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/3 bg-muted rounded" />
        <div className="h-3 w-4/5 bg-muted rounded" />
        <div className="h-2 w-1/4 bg-muted rounded" />
      </div>
    </div>
  );
}
