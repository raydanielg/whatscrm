/**
 * Handoff timeline panel — shows the transfer history for a conversation.
 * Rendered inside the customer profile / collaboration sidebar.
 */
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRightLeft, Bot, Hand, ListOrdered, PlayCircle,
  ShieldCheck, Users, XCircle, MoonStar,
} from "lucide-react";
import { useHandoffHistory } from "@/hooks/use-handoff";
import { useWorkspaceMembers, useCurrentWorkspace } from "@/hooks/use-workspace";
import { useDepartments } from "@/hooks/use-handoff";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { HandoffEvent } from "@/lib/handoff/handoff.functions";

const KIND_META: Record<HandoffEvent["kind"], { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  transfer_agent:     { icon: ArrowRightLeft, label: "Transferred to agent",      color: "text-blue-500" },
  transfer_department:{ icon: ListOrdered,     label: "Transferred to department", color: "text-blue-500" },
  takeover:           { icon: Hand,            label: "Human took over",           color: "text-amber-500" },
  resume_ai:          { icon: PlayCircle,      label: "AI resumed",                color: "text-emerald-500" },
  queue_enter:        { icon: Users,           label: "Added to queue",            color: "text-muted-foreground" },
  queue_leave:        { icon: XCircle,         label: "Left queue",                color: "text-muted-foreground" },
  queue_assigned:     { icon: ShieldCheck,     label: "Claimed from queue",        color: "text-emerald-500" },
  fallback_assigned:  { icon: ShieldCheck,     label: "Assigned to fallback",      color: "text-amber-500" },
  offline_bounced:    { icon: MoonStar,        label: "Outside business hours",    color: "text-muted-foreground" },
};

export function HandoffTimeline({ conversationId }: { conversationId: string }) {
  const { active } = useCurrentWorkspace();
  const historyQ = useHandoffHistory(conversationId);
  const membersQ = useWorkspaceMembers(active?.id);
  const deptQ = useDepartments();

  const memberName = (id: string | null) =>
    id ? (membersQ.data?.find((m) => m.user_id === id)?.display_name ?? "someone") : null;
  const deptName = (id: string | null) =>
    id ? (deptQ.data?.find((d) => d.id === id)?.name ?? "department") : null;

  return (
    <div className="border rounded-control bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Handoff timeline</h3>
      </div>
      <ScrollArea className="max-h-72">
        <ol className="p-2 space-y-1">
          {historyQ.isLoading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : (historyQ.data ?? []).length === 0 ? (
            <li className="py-6 text-center text-sm text-muted-foreground">No handoff activity yet.</li>
          ) : (
            (historyQ.data ?? []).map((e) => {
              const meta = KIND_META[e.kind];
              const Icon = meta.icon;
              const to = memberName(e.to_user_id) ?? deptName(e.to_department_id);
              const from = memberName(e.from_user_id) ?? deptName(e.from_department_id);
              return (
                <li key={e.id} className="flex gap-3 rounded-control px-2 py-2 hover:bg-muted/50">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{meta.label}</span>
                      {to ? <> → <span className="font-medium">{to}</span></> : null}
                      {from && !to ? <> (from {from})</> : null}
                    </p>
                    {e.reason ? <p className="text-xs text-muted-foreground truncate">{e.reason}</p> : null}
                    {e.note ? <p className="text-xs text-muted-foreground italic mt-0.5">"{e.note}"</p> : null}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </li>
              );
            })
          )}
        </ol>
      </ScrollArea>
    </div>
  );
}
