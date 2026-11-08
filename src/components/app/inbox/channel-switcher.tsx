import {
  ChevronDown,
  Check,
  Star,
  Flag,
  Shield,
  Clock,
  AlertTriangle,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useChannelSwitcher, type ChannelOption } from "@/hooks/use-channel-switcher";
import type { ConversationRow } from "@/hooks/use-conversations";
import { ChannelIcon } from "./channel-icon";

function StatusDot({ status }: { status: ChannelOption["status"] }) {
  const cls =
    status === "active"
      ? "bg-emerald-500"
      : status === "degraded"
        ? "bg-amber-500"
        : status === "unavailable"
          ? "bg-destructive"
          : "bg-muted-foreground/50";
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", cls)} aria-hidden />;
}

type Props = {
  conversation: ConversationRow;
  align?: "start" | "end";
  className?: string;
};

/**
 * Channel Switcher — lets an agent reply via any linked channel for the contact,
 * all inside the same conversation. Displays availability, verified state,
 * last-used, preferred / primary / fallback markers, and suggests a fallback
 * automatically when the current channel is failing.
 */
export function ChannelSwitcher({ conversation, align = "start", className }: Props) {
  const {
    options,
    currentChannel,
    hasFailure,
    suggestedFallback,
    switchChannel,
    setChannelRole,
    isLoading,
  } = useChannelSwitcher(conversation);

  const current = options.find((o) => o.isCurrent);

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex items-center gap-1.5", className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 rounded-control px-2.5"
              aria-label="Switch channel"
              disabled={isLoading}
            >
              {currentChannel ? (
                <>
                  <ChannelIcon
                    channel={currentChannel}
                    boxed
                    className="h-4 w-4 rounded-full"
                    iconClassName="h-full w-full"
                  />
                  <span className="text-xs font-medium">{current?.label ?? currentChannel}</span>
                  {current && <StatusDot status={current.status} />}
                </>
              ) : (
                <span className="text-xs">Channel</span>
              )}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align={align} className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Reply via</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                {options.filter((o) => o.canReply).length} available
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {options.length === 0 && (
              <div className="px-2 py-4 text-xs text-muted-foreground">No linked channels yet.</div>
            )}

            {options.map((opt) => (
              <ChannelRow
                key={opt.channel}
                opt={opt}
                onSelect={() => !opt.isCurrent && opt.canReply && switchChannel.mutate(opt)}
                onRole={(role, enabled) =>
                  setChannelRole.mutate({ role, channel: opt.channel, enabled })
                }
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {hasFailure && suggestedFallback && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="h-9 gap-1.5 rounded-control px-2.5 animate-fade-in"
                onClick={() => switchChannel.mutate(suggestedFallback)}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs">Try {suggestedFallback.label}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[220px]">
              Current channel is failing. Retry the message on {suggestedFallback.label}.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

function ChannelRow({
  opt,
  onSelect,
  onRole,
}: {
  opt: ChannelOption;
  onSelect: () => void;
  onRole: (role: "preferred" | "primary" | "fallback", enabled: boolean) => void;
}) {
  const disabled = !opt.canReply && !opt.isCurrent;

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 px-2 py-2 rounded-control transition-colors",
        !disabled && "hover:bg-muted cursor-pointer",
        opt.isCurrent && "bg-muted/60",
      )}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <ChannelIcon
        channel={opt.channel}
        boxed
        className={cn(
          "mt-0.5 h-5 w-5 rounded-full ring-1 ring-inset ring-border/60",
          opt.isCurrent && "ring-2 ring-accent/50",
          disabled && "opacity-50",
        )}
        iconClassName="h-full w-full"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{opt.label}</span>
          <StatusDot status={opt.status} />
          {opt.isCurrent && (
            <Badge variant="secondary" className="h-5 px-1 text-[11px] gap-0.5 leading-[normal]">
              Active
            </Badge>
          )}
          {opt.isPreferred && (
            <Badge variant="outline" className="h-5 px-1 text-[11px] gap-0.5 leading-[normal]">
              <Star className="h-3 w-3" /> Preferred
            </Badge>
          )}
          {opt.isPrimary && !opt.isCurrent && (
            <Badge variant="outline" className="h-5 px-1 text-[11px] gap-0.5 leading-[normal]">
              <Shield className="h-3 w-3" /> Primary
            </Badge>
          )}
          {opt.isFallback && (
            <Badge variant="outline" className="h-5 px-1 text-[11px] gap-0.5 leading-[normal]">
              <Flag className="h-3 w-3" /> Fallback
            </Badge>
          )}
          {opt.isLastUsed && !opt.isCurrent && (
            <Badge variant="outline" className="h-5 px-1 text-[11px] gap-0.5 leading-[normal]">
              <Clock className="h-3 w-3" /> Last used
            </Badge>
          )}
          {opt.verified && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Check className="h-3 w-3 text-emerald-500" aria-label="Verified identity" />
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Verified identity
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
          {opt.externalId && <span className="mr-2">{opt.externalId}</span>}
          {opt.lastUsedAt && (
            <span>
              Last reply {formatDistanceToNow(new Date(opt.lastUsedAt), { addSuffix: true })}
            </span>
          )}
          {!opt.canReply && !opt.hasAccount && <span>No connected account</span>}
          {opt.statusReason && opt.status !== "active" && (
            <span className="ml-1 text-amber-600">· {opt.statusReason}</span>
          )}
        </div>
      </div>

      <DropdownMenuSub>
        {/*
         * The shared SubTrigger always appends a trailing ChevronRight
         * ("opens a submenu to the right") after its children. That's meant
         * for full-width rows where `ml-auto` pushes it to the far edge; in
         * this icon-only 24px box it had nowhere to go and overlapped the
         * "..." dots. `[&>svg:last-child]:hidden` drops just that chevron
         * here — the three dots alone are enough to say "more options".
         */}
        <DropdownMenuSubTrigger
          className="h-7 w-7 shrink-0 p-0 flex items-center justify-center rounded hover:bg-muted [&>svg:last-child]:hidden"
          onClick={(e) => e.stopPropagation()}
          aria-label="More options"
        >
          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onSelect={() => onRole("preferred", !opt.isPreferred)}>
            <Star className="h-3.5 w-3.5" />
            {opt.isPreferred ? "Remove preferred" : "Mark as preferred"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onRole("primary", !opt.isPrimary)}>
            <Shield className="h-3.5 w-3.5" />
            {opt.isPrimary ? "Unset primary" : "Set as primary"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onRole("fallback", !opt.isFallback)}>
            <Flag className="h-3.5 w-3.5" />
            {opt.isFallback ? "Unset fallback" : "Set as fallback"}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </div>
  );
}
