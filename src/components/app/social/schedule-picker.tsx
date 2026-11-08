import { useState } from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const DEFAULT_TIME = "09:00";

/**
 * Date and time picker for scheduling. The value uses the same
 * `YYYY-MM-DDTHH:mm` string as a datetime-local input, so callers keep
 * their existing validation and submit logic.
 */
export function SchedulePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [datePart, timePart] = value ? value.split("T") : ["", ""];
  const parsed = datePart ? parse(datePart, "yyyy-MM-dd", new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const time = (timePart || DEFAULT_TIME).slice(0, 5);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("flex-1 justify-start font-normal", !selected && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selected ? format(selected, "PPP") : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? new Date()}
            disabled={{ before: startOfToday }}
            onSelect={(d) => {
              if (!d) return;
              onChange(`${format(d, "yyyy-MM-dd")}T${time}`);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        className="w-32"
        value={time}
        disabled={disabled}
        onChange={(e) => {
          const day = datePart || format(new Date(), "yyyy-MM-dd");
          onChange(`${day}T${e.target.value}`);
        }}
      />
    </div>
  );
}
