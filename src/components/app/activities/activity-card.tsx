import { useMemo } from "react";
import { Phone, Users, CheckSquare, Mail, MessageCircle, StickyNote, Monitor, CornerUpRight, Clock, MapPin, Video, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SalesActivity, ActivityType } from "@/hooks/use-sales-activities";
import { ACTIVITY_TYPE_META, ACTIVITY_STATUS_META, useCompleteActivity, useDeleteActivity } from "@/hooks/use-sales-activities";

const ICONS: Record<ActivityType, typeof Phone> = {
  call: Phone, meeting: Users, task: CheckSquare, email: Mail,
  whatsapp: MessageCircle, note: StickyNote, demo: Monitor, follow_up: CornerUpRight,
};

function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

type Props = {
  activity: SalesActivity;
  onClick?: (a: SalesActivity) => void;
  compact?: boolean;
};

export function ActivityCard({ activity, onClick, compact }: Props) {
  const Icon = ICONS[activity.type];
  const typeMeta = ACTIVITY_TYPE_META[activity.type];
  const statusMeta = ACTIVITY_STATUS_META[activity.status];
  const complete = useCompleteActivity();
  const del = useDeleteActivity();

  const isOverdue = useMemo(() => {
    if (activity.status === "completed" || activity.status === "cancelled") return false;
    if (!activity.start_at) return false;
    return new Date(activity.start_at) < new Date();
  }, [activity.start_at, activity.status]);

  return (
    <Card
      className={cn(
        "group p-3 hover:shadow-md transition-all cursor-pointer border-l-4",
        activity.priority === "urgent" && "border-l-red-500",
        activity.priority === "high" && "border-l-orange-500",
        activity.priority === "normal" && "border-l-primary/40",
        activity.priority === "low" && "border-l-muted",
        activity.status === "completed" && "opacity-70"
      )}
      onClick={() => onClick?.(activity)}
    >
      <div className="flex items-start gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-control", typeMeta.tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={cn("font-medium leading-tight truncate", activity.status === "completed" && "line-through")}>
              {activity.title}
            </p>
            <Badge variant="secondary" className={cn("text-[11px] shrink-0", statusMeta.tone)}>
              {isOverdue && activity.status === "planned" ? "Overdue" : statusMeta.label}
            </Badge>
          </div>
          {!compact && activity.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{activity.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
            {activity.start_at && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {fmtDate(activity.start_at)} {activity.all_day ? "· all day" : fmtTime(activity.start_at)}
              </span>
            )}
            {activity.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />{activity.location}
              </span>
            )}
            {activity.meeting_url && (
              <a href={activity.meeting_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                 className="inline-flex items-center gap-1 text-primary hover:underline">
                <Video className="h-3 w-3" />Join
              </a>
            )}
            {activity.entity_type && (
              <span className="inline-flex items-center gap-1">
                <Link2 className="h-3 w-3" />{activity.entity_type}
              </span>
            )}
            {activity.recurrence && (
              <Badge variant="outline" className="text-[11px]">recurring</Badge>
            )}
          </div>
          {!compact && activity.status !== "completed" && activity.status !== "cancelled" && (
            <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={(e) => { e.stopPropagation(); complete(activity.id); }}>
                Mark complete
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                onClick={(e) => { e.stopPropagation(); if (confirm("Delete this activity?")) del.mutate(activity.id); }}>
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
