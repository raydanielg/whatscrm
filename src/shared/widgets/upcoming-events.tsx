import { WidgetCard, type WidgetCardProps } from "./widget-card";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar as CalendarIcon } from "lucide-react";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export type EventItem = {
  id: string;
  title: string;
  start: Date | string;
  end?: Date | string;
  location?: string;
  attendees?: Array<{ name: string; avatarUrl?: string }>;
  tone?: "primary" | "accent" | "success" | "warning" | "danger";
};

const toneBar: Record<NonNullable<EventItem["tone"]>, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export type UpcomingEventsProps = Omit<WidgetCardProps, "children"> & {
  events: EventItem[];
  emptyLabel?: string;
};

export function UpcomingEvents({
  events,
  emptyLabel = "No upcoming events",
  ...card
}: UpcomingEventsProps) {
  const fmtZoned = useZonedDateFormatter();
  const fmt = (d: Date | string) => {
    const date = typeof d === "object" ? d : new Date(d);
    return fmtZoned(date, { weekday: "short", hour: "numeric", minute: "2-digit" });
  };
  return (
    <WidgetCard icon={<CalendarIcon className="h-4 w-4" />} {...card} bodyClassName="p-0">
      {events.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-5 py-3.5">
              <span
                className={cn("mt-1.5 h-9 w-1 shrink-0 rounded-full", toneBar[e.tone ?? "accent"])}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{e.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {fmt(e.start)}
                  {e.end && (
                    <>
                      {" "}
                      –{" "}
                      {fmtZoned(new Date(e.end), {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </>
                  )}
                  {e.location && <> · {e.location}</>}
                </div>
              </div>
              {e.attendees && e.attendees.length > 0 && (
                <div className="flex -space-x-2 shrink-0">
                  {e.attendees.slice(0, 3).map((a, i) => (
                    <Avatar key={i} className="h-6 w-6 border-2 border-surface">
                      <AvatarImage src={a.avatarUrl} alt="" />
                      <AvatarFallback className="text-[11px]">
                        {a.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
