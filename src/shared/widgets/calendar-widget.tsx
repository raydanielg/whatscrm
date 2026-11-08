import { WidgetCard, type WidgetCardProps } from "./widget-card";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";

export type CalendarWidgetProps = Omit<WidgetCardProps, "children"> & {
  mode?: "single" | "range" | "multiple";
  selected?: Date | Date[] | DateRange;
  onSelect?: (v: unknown) => void;
  highlighted?: Date[];
};

/**
 * Compact calendar for dashboards — wraps the shadcn Calendar with widget chrome.
 * Consumers control selection; `highlighted` accents dates with events.
 */
export function CalendarWidget({
  mode = "single",
  selected,
  onSelect,
  highlighted,
  ...card
}: CalendarWidgetProps) {
  return (
    <WidgetCard {...card} bodyClassName="p-2">
      <Calendar
        mode={mode as never}
        selected={selected as never}
        onSelect={onSelect as never}
        modifiers={highlighted ? { highlighted } : undefined}
        modifiersClassNames={{
          highlighted:
            "relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-accent",
        }}
      />
    </WidgetCard>
  );
}
