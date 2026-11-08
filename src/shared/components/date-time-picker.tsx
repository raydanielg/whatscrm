import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * DateTimePicker — combined date + time (HH:mm 24-h) picker.
 * Controlled: `value` is a Date | undefined. Emits new Date via `onChange`.
 *
 * Replaces `<input type="datetime-local" />` throughout the app. When integrating
 * with a `datetime-local` value string, use the helpers below.
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  disabled,
  clearable = true,
  fromDate,
  toDate,
  minuteStep = 5,
  dateFormat = "PPP p",
  className,
}: {
  value: Date | undefined;
  onChange: (next: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  fromDate?: Date;
  toDate?: Date;
  minuteStep?: number;
  dateFormat?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);

  const setDate = (d: Date | undefined) => {
    if (!d) return onChange(undefined);
    const base = value ?? new Date();
    const next = new Date(d);
    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onChange(next);
  };

  const setPart = (part: "h" | "m", n: number) => {
    const base = value ? new Date(value) : new Date();
    if (part === "h") base.setHours(n);
    else base.setMinutes(n);
    base.setSeconds(0, 0);
    onChange(base);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1 truncate">{value ? format(value, dateFormat) : placeholder}</span>
          {clearable && value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange(undefined);
                }
              }}
              className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <div className="flex flex-col sm:flex-row">
          <Calendar
            mode="single"
            selected={value}
            onSelect={setDate}
            initialFocus
            fromDate={fromDate}
            toDate={toDate}
            className={cn("p-3 pointer-events-auto")}
          />
          <div className="flex divide-x border-t sm:border-t-0 sm:border-l">
            <ScrollArea className="h-64 w-16">
              <div className="flex flex-col p-1">
                {hours.map((h) => {
                  const active = value?.getHours() === h;
                  return (
                    <Button
                      key={h}
                      type="button"
                      variant={active ? "default" : "ghost"}
                      size="sm"
                      className="justify-center rounded-control px-2"
                      onClick={() => setPart("h", h)}
                    >
                      {String(h).padStart(2, "0")}
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
            <ScrollArea className="h-64 w-16">
              <div className="flex flex-col p-1">
                {minutes.map((m) => {
                  const active = value?.getMinutes() === m;
                  return (
                    <Button
                      key={m}
                      type="button"
                      variant={active ? "default" : "ghost"}
                      size="sm"
                      className="justify-center rounded-control px-2"
                      onClick={() => setPart("m", m)}
                    >
                      {String(m).padStart(2, "0")}
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Convert a Date to a `datetime-local`-style string ("YYYY-MM-DDTHH:mm") in local tz. */
export function toLocalDateTimeString(d: Date | undefined | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a `datetime-local` string ("YYYY-MM-DDTHH:mm") as a local-tz Date. */
export function fromLocalDateTimeString(s: string | undefined | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
