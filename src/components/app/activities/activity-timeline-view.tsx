import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Users, CheckSquare, Mail, MessageCircle, StickyNote, Monitor, CornerUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SalesActivity, ActivityType } from "@/hooks/use-sales-activities";
import { ACTIVITY_TYPE_META } from "@/hooks/use-sales-activities";

const ICONS: Record<ActivityType, typeof Phone> = {
  call: Phone, meeting: Users, task: CheckSquare, email: Mail,
  whatsapp: MessageCircle, note: StickyNote, demo: Monitor, follow_up: CornerUpRight,
};

function fmt(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ActivityTimelineView({ activities, onSelect }: {
  activities: SalesActivity[]; onSelect: (a: SalesActivity) => void;
}) {
  const sorted = useMemo(() =>
    [...activities].sort((a, b) => new Date(b.start_at ?? b.created_at).getTime() - new Date(a.start_at ?? a.created_at).getTime()),
    [activities]
  );

  if (sorted.length === 0) {
    return <Card className="p-12 text-center text-muted-foreground">No activity yet.</Card>;
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
      <div className="space-y-4">
        {sorted.map(a => {
          const Icon = ICONS[a.type];
          const meta = ACTIVITY_TYPE_META[a.type];
          return (
            <div key={a.id} className="relative">
              <div className={cn("absolute -left-6 top-2 h-4 w-4 rounded-full ring-4 ring-background flex items-center justify-center", meta.tone)}>
                <Icon className="h-3 w-3" />
              </div>
              <button onClick={() => onSelect(a)}
                className="w-full rounded-control border p-3 text-left hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium", a.status === "completed" && "line-through opacity-60")}>{a.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {meta.label} · {fmt(a.start_at ?? a.created_at)}
                    </p>
                    {a.outcome && (
                      <p className="text-sm mt-2 italic text-muted-foreground">"{a.outcome}"</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[11px]">{a.status}</Badge>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
