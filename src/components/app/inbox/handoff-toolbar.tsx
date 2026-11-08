/**
 * Compact handoff control for the conversation header.
 * One chip shows the current owner (AI / Queued / Human); its menu holds
 * Take Over, Resume AI and Transfer so the header stays uncluttered.
 */
import { useState } from "react";
import {
  Bot, Hand, ArrowRightLeft, Loader2, PlayCircle, Users, ChevronDown,
  UserPlus, CheckCircle2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HandoffDialog } from "./handoff-dialog";
import { useTakeOver, useResumeAi } from "@/hooks/use-handoff";
import { cn } from "@/lib/utils";

type HandoffState = "ai" | "human" | "queued";

type Props = {
  conversationId: string;
  handoffState: HandoffState;
  aiEnabled: boolean;
  className?: string;
  onAssign?: () => void;
  onResolve?: () => void;
  isResolved?: boolean;
};

const STATE_LABEL: Record<HandoffState, { text: string; Icon: typeof Bot }> = {
  ai: { text: "AI", Icon: Bot },
  queued: { text: "Queued", Icon: Users },
  human: { text: "Human", Icon: Hand },
};

export function HandoffToolbar({
  conversationId, handoffState, aiEnabled, className, onAssign, onResolve, isResolved,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const takeOver = useTakeOver(conversationId);
  const resume = useResumeAi(conversationId);
  const { text, Icon } = STATE_LABEL[handoffState];
  const busy = takeOver.isPending || resume.isPending;

  return (
    <div className={cn("flex items-center", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs" aria-label="Handoff options">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            {text}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {handoffState === "ai" && "AI is replying to this chat"}
            {handoffState === "queued" && "Waiting for a human agent"}
            {handoffState === "human" && "A human agent is handling this chat"}
          </div>
          <DropdownMenuSeparator />
          {handoffState !== "human" && (
            <DropdownMenuItem onClick={() => takeOver.mutate()} disabled={takeOver.isPending}>
              <Hand className="h-4 w-4 mr-2" /> Take over
            </DropdownMenuItem>
          )}
          {handoffState === "human" && aiEnabled && (
            <DropdownMenuItem onClick={() => resume.mutate(undefined)} disabled={resume.isPending}>
              <PlayCircle className="h-4 w-4 mr-2" /> Resume AI
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDialogOpen(true)}>
            <ArrowRightLeft className="h-4 w-4 mr-2" /> Transfer
          </DropdownMenuItem>
          {onAssign && (
            <DropdownMenuItem onClick={onAssign}>
              <UserPlus className="h-4 w-4 mr-2" /> Assign
            </DropdownMenuItem>
          )}
          {onResolve && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onResolve}>
                {isResolved ? <Clock className="h-4 w-4 mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {isResolved ? "Reopen" : "Resolve"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <HandoffDialog
        conversationId={conversationId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
