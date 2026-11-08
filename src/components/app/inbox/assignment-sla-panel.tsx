import { useState } from "react";
import { useNow } from "@/hooks/use-inbox-utils";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flag,
  Gauge,
  Loader2,
  Shuffle,
  Timer,
  UserCheck,
  UserPlus,
  Users2,
  Wand2,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ConversationRow } from "@/hooks/use-conversations";
import { useWorkspaceMembers, useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  formatCountdown,
  useAgentPerformance,
  useApplySla,
  useAssignConversation,
  useAutoAssign,
  useConversationSla,
  useSetConversationPriority,
  type ConversationPriority,
} from "@/hooks/use-assignment-sla";

/* ---------------------------------- Utils --------------------------------- */

const PRIORITY_META: Record<
  ConversationPriority,
  { label: string; className: string; dot: string }
> = {
  urgent: {
    label: "Urgent",
    className: "bg-red-500/10 text-red-600 border-red-500/20",
    dot: "bg-red-500",
  },
  high: {
    label: "High",
    className: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    dot: "bg-orange-500",
  },
  normal: {
    label: "Normal",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    dot: "bg-blue-500",
  },
  low: {
    label: "Low",
    className: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
};

/* --------------------------------- SLA Row -------------------------------- */

function SlaRow({
  icon: Icon,
  label,
  target,
  completedAt,
}: {
  icon: typeof Clock;
  label: string;
  target: string | null | undefined;
  completedAt?: string | null;
}) {
  useNow(); // subscribe to the single shared 1Hz clock
  if (completedAt) {
    return (
      <div className="flex items-center justify-between rounded-control border border-border/60 bg-muted/30 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" /> Met
        </span>
      </div>
    );
  }
  if (!target) {
    return (
      <div className="flex items-center justify-between rounded-control border border-border/60 bg-muted/30 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <span className="text-xs text-muted-foreground">No target</span>
      </div>
    );
  }
  const c = formatCountdown(target);
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-control border px-3 py-2 text-sm transition-colors",
        c.overdue ? "border-red-500/30 bg-red-500/10" : "border-border/60 bg-muted/30",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5", c.overdue ? "text-red-600" : "text-muted-foreground")} />
        <span className={c.overdue ? "text-red-700 font-medium" : ""}>{label}</span>
      </div>
      <span
        className={cn(
          "font-mono text-xs ",
          c.overdue ? "text-red-600 font-semibold" : "text-foreground",
        )}
      >
        {c.label}
      </span>
    </div>
  );
}

/* ------------------------------- Main panel ------------------------------- */

type AssignmentSlaPanelProps = {
  conversation: ConversationRow;
  onClose?: () => void;
};

export function AssignmentSlaPanel({ conversation, onClose }: AssignmentSlaPanelProps) {
  const { active: workspace } = useCurrentWorkspace();
  const { data: members = [] } = useWorkspaceMembers(workspace?.id);
  const { data: sla } = useConversationSla(conversation.id);
  const { data: performance = [] } = useAgentPerformance();

  const formatZoned = useZonedDateFormatter();
  const assign = useAssignConversation();
  const autoAssign = useAutoAssign();
  const setPriority = useSetConversationPriority();
  const applySla = useApplySla();

  const priority = (conversation.priority ?? "normal") as ConversationPriority;
  const meta = PRIORITY_META[priority];

  return (
    <div className="w-[320px] shrink-0 border-l border-border bg-background flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Assignment &amp; SLA</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add, Manage or view Tasks set for the agent
            </p>
          </div>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onClose}
              aria-label="Close Assignment & SLA panel"
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="ownership" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-3 grid grid-cols-3">
          <TabsTrigger value="ownership" className="text-xs">
            Ownership
          </TabsTrigger>
          <TabsTrigger value="sla" className="text-xs">
            SLA
          </TabsTrigger>
          <TabsTrigger value="team" className="text-xs">
            Team
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------ OWNERSHIP ------------------------------ */}
        <TabsContent value="ownership" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <UserCheck className="h-3.5 w-3.5" /> Assigned agent
                </div>
                <Select
                  value={conversation.assigned_to ?? "unassigned"}
                  onValueChange={(v) =>
                    assign.mutate({
                      conversationId: conversation.id,
                      userId: v === "unassigned" ? null : v,
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={m.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[11px]">
                              {(m.display_name ?? m.email ?? "?").slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{m.display_name ?? m.email ?? "Unnamed"}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1 h-9"
                    disabled={autoAssign.isPending}
                    onClick={() => autoAssign.mutate(conversation.id)}
                  >
                    {autoAssign.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Shuffle className="h-3.5 w-3.5" />
                    )}
                    Auto-assign
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-9"
                    onClick={() =>
                      assign.mutate({
                        conversationId: conversation.id,
                        userId: null,
                      })
                    }
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Queue
                  </Button>
                </div>
              </section>

              <Separator />

              <section className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <Flag className="h-3.5 w-3.5" /> Priority
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["low", "normal", "high", "urgent"] as ConversationPriority[]).map((p) => {
                    const m = PRIORITY_META[p];
                    const active = priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          setPriority.mutate({
                            conversationId: conversation.id,
                            priority: p,
                          })
                        }
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-control border px-2 py-2 text-[11px] font-medium transition-all",
                          active
                            ? `${m.className} border-current shadow-sm`
                            : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                <Badge variant="outline" className={cn("gap-1.5", meta.className)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                  Current: {meta.label}
                </Badge>
              </section>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* --------------------------------- SLA --------------------------------- */}
        <TabsContent value="sla" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {!sla ? (
                <div className="rounded-control border border-dashed border-border p-4 text-center">
                  <Timer className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">No SLA active</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Apply the matching workspace policy to start timers.
                  </p>
                  <Button
                    size="sm"
                    className="mt-3 h-9"
                    disabled={applySla.isPending}
                    onClick={() => applySla.mutate(conversation.id)}
                  >
                    {applySla.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    Apply SLA policy
                  </Button>
                </div>
              ) : (
                <>
                  <div className="rounded-control bg-muted/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Started
                    </div>
                    <div className="text-xs font-medium mt-0.5">
                      {formatZoned(new Date(sla.started_at), {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>

                  <SlaRow
                    icon={Clock}
                    label="First response"
                    target={sla.first_response_due_at}
                    completedAt={sla.first_response_at}
                  />
                  <SlaRow icon={Timer} label="Next response" target={sla.next_response_due_at} />
                  <SlaRow
                    icon={CheckCircle2}
                    label="Resolution"
                    target={sla.resolution_due_at}
                    completedAt={sla.is_paused && !sla.resolution_due_at ? sla.paused_at : null}
                  />

                  {(sla.first_response_breached_at ||
                    sla.response_breached_at ||
                    sla.resolution_breached_at) && (
                    <div className="flex items-start gap-2 rounded-control border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold">SLA breached</div>
                        <div className="text-red-600/80">Escalation rules have been notified.</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* -------------------------------- TEAM --------------------------------- */}
        <TabsContent value="team" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Users2 className="h-3.5 w-3.5" /> Agent load
              </div>
              {performance
                .slice()
                .sort((a, b) => a.open_count - b.open_count)
                .map((a) => (
                  <div
                    key={a.user_id}
                    className="flex items-center gap-2 rounded-control border border-border/60 px-2.5 py-2"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={a.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[11px]">
                        {(a.display_name ?? "?").slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {a.display_name ?? "Unnamed"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {a.open_count} open · {a.resolved_today} resolved today
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        assign.mutate({
                          conversationId: conversation.id,
                          userId: a.user_id,
                        })
                      }
                    >
                      Assign
                    </Button>
                  </div>
                ))}
              {performance.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No workspace members yet.
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
