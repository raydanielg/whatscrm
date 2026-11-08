import { WidgetCard, type WidgetCardProps } from "./widget-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type TaskItem = {
  id: string;
  title: string;
  done?: boolean;
  dueLabel?: string;
  priority?: "low" | "med" | "high";
  assignee?: string;
};

export type TaskListWidgetProps = Omit<WidgetCardProps, "children"> & {
  tasks: TaskItem[];
  onToggle?: (id: string, done: boolean) => void;
  emptyLabel?: string;
};

const priorityTone: Record<NonNullable<TaskItem["priority"]>, string> = {
  low: "bg-muted text-muted-foreground",
  med: "bg-info-muted text-info",
  high: "bg-danger-muted text-danger",
};

export function TaskListWidget({
  tasks,
  onToggle,
  emptyLabel = "You're all caught up",
  ...card
}: TaskListWidgetProps) {
  return (
    <WidgetCard {...card} bodyClassName="p-0">
      {tasks.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-5 py-3">
              <Checkbox
                checked={!!t.done}
                onCheckedChange={(v) => onToggle?.(t.id, !!v)}
                aria-label={t.title}
              />
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "truncate text-sm",
                    t.done ? "text-muted-foreground line-through" : "text-foreground",
                  )}
                >
                  {t.title}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {t.dueLabel && <span>{t.dueLabel}</span>}
                  {t.assignee && <span>· {t.assignee}</span>}
                </div>
              </div>
              {t.priority && (
                <Badge variant="secondary" className={cn("shrink-0 border-0", priorityTone[t.priority])}>
                  {t.priority}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
