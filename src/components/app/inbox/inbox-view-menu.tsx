import {
  AlertOctagon,
  Archive,
  AtSign,
  CheckCircle2,
  ChevronDown,
  Clock,
  Inbox,
  Pin,
  Star,
  Trash2,
  UserCheck,
  UserPlus,
  Users2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConversationCounts } from "@/hooks/use-conversations";
import { useHandoffQueue } from "@/hooks/use-handoff";
import type { InboxView } from "@/lib/inbox/inbox-views";
import { cn } from "@/lib/utils";

type ViewItem = { id: InboxView; label: string; icon: LucideIcon; countKey?: string };

const GROUPS: { title: string; items: ViewItem[] }[] = [
  {
    title: "Inbox",
    items: [
      { id: "all", label: "All conversations", icon: Inbox, countKey: "all" },
      { id: "unread", label: "Unread", icon: AtSign, countKey: "unread" },
      { id: "mine", label: "Assigned to me", icon: UserCheck, countKey: "mine" },
      { id: "unassigned", label: "Unassigned", icon: UserPlus, countKey: "unassigned" },
    ],
  },
  {
    title: "Status",
    items: [
      { id: "open", label: "Open", icon: Clock, countKey: "open" },
      { id: "pending", label: "Pending", icon: Clock, countKey: "pending" },
      { id: "resolved", label: "Resolved", icon: CheckCircle2, countKey: "resolved" },
      { id: "queue", label: "Handoff queue", icon: Users2, countKey: "queue" },
    ],
  },
  {
    title: "Saved",
    items: [
      { id: "pinned", label: "Pinned", icon: Pin },
      { id: "starred", label: "Starred", icon: Star },
      { id: "favorites", label: "Favorites", icon: Star },
    ],
  },
  {
    title: "More",
    items: [
      { id: "archived", label: "Archive", icon: Archive, countKey: "archived" },
      { id: "spam", label: "Spam", icon: AlertOctagon },
      { id: "trash", label: "Trash", icon: Trash2 },
    ],
  },
];

const VIEW_ITEMS = GROUPS.flatMap((group) => group.items);

export function InboxViewMenu({
  view,
  onChange,
  inboxId,
  className,
}: {
  view: InboxView;
  onChange: (view: InboxView) => void;
  inboxId?: string | null;
  className?: string;
}) {
  const { data: counts } = useConversationCounts(inboxId ?? undefined);
  const { data: queueItems } = useHandoffQueue("waiting");
  const countByView: Record<string, number> = {
    ...((counts?.badges as Record<string, number> | undefined) ?? {}),
    queue: queueItems?.length ?? 0,
  };
  const active = VIEW_ITEMS.find((item) => item.id === view) ?? VIEW_ITEMS[0];
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-14 w-full justify-start gap-2.5 px-3 text-left", className)}
          aria-label={`Inbox view: ${active.label}`}
        >
          <ActiveIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-normal text-muted-foreground">Inbox view</span>
            <span className="block truncate text-sm font-medium">{active.label}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="max-h-[min(70vh,34rem)] w-[--radix-dropdown-menu-trigger-width] min-w-64 max-w-[calc(100vw-1.5rem)]"
      >
        <DropdownMenuRadioGroup
          value={view}
          onValueChange={(value) => onChange(value as InboxView)}
        >
          {GROUPS.map((group, index) => (
            <div key={group.title}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-muted-foreground">{group.title}</DropdownMenuLabel>
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = item.countKey ? countByView[item.countKey] : undefined;
                return (
                  <DropdownMenuRadioItem key={item.id} value={item.id} className="min-h-9 gap-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {typeof count === "number" && count > 0 && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </DropdownMenuRadioItem>
                );
              })}
            </div>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
