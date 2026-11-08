/**
 * Handoff queue panel — lists conversations waiting for a human agent.
 * Shows priority, wait time, required skills, target department, and a
 * one-click "Claim" button. Realtime-driven via useHandoffQueue().
 */
import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Users, Clock, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useHandoffQueue, useClaimFromQueue, useDepartments } from "@/hooks/use-handoff";
import type { HandoffPriority } from "@/lib/handoff/handoff.functions";

const PRIORITY_BADGE: Record<HandoffPriority, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-red-500/15 text-red-600 border-red-500/30" },
  high:   { label: "High",   className: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
  normal: { label: "Normal", className: "bg-muted text-foreground border-transparent" },
  low:    { label: "Low",    className: "bg-muted/60 text-muted-foreground border-transparent" },
};

export function HandoffQueuePanel({ onOpenConversation }: { onOpenConversation?: (id: string) => void }) {
  const queueQ = useHandoffQueue("waiting");
  const claim = useClaimFromQueue();
  const deptQ = useDepartments();

  const deptById = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    for (const d of deptQ.data ?? []) m.set(d.id, { name: d.name, color: d.color });
    return m;
  }, [deptQ.data]);

  const items = queueQ.data ?? [];

  return (
    <div className="border rounded-control bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Handoff queue</h3>
        </div>
        <Badge variant="outline">{items.length} waiting</Badge>
      </div>

      <ScrollArea className="max-h-[70vh]">
        <ol className="p-2 space-y-1">
          {queueQ.isLoading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : items.length === 0 ? (
            <li className="py-10 text-center text-sm text-muted-foreground">
              🎉 No one is waiting.
            </li>
          ) : (
            items.map((q) => {
              const dept = q.target_department_id ? deptById.get(q.target_department_id) : null;
              const p = PRIORITY_BADGE[q.priority];
              return (
                <li key={q.id} className="rounded-control border p-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={p.className}>{p.label}</Badge>
                        {dept ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <span className="h-2 w-2 rounded-full" style={{ background: dept.color }} />
                            {dept.name}
                          </span>
                        ) : null}
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(q.entered_at), { addSuffix: true })}
                        </span>
                      </div>
                      {q.required_skills.length ? (
                        <p className="mt-1.5 text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          {q.required_skills.join(", ")}
                        </p>
                      ) : null}
                      {q.reason ? (
                        <p className="mt-1 text-sm truncate">{q.reason}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        className="h-9"
                        onClick={() => claim.mutate(q.id)}
                        disabled={claim.isPending}
                      >
                        {claim.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Claim"}
                      </Button>
                      {onOpenConversation ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9"
                          onClick={() => onOpenConversation(q.conversation_id)}
                        >
                          Open
                        </Button>
                      ) : null}
                    </div>
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
