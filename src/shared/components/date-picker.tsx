import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * DatePicker — single-date input wrapping shadcn Calendar in a Popover.
 * Controlled: `value` + `onChange`. Set `format` to override display format.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  clearable = true,
  fromDate,
  toDate,
  dateFormat = "PPP",
  className,
}: {
  value: Date | undefined;
  onChange: (next: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  fromDate?: Date;
  toDate?: Date;
  dateFormat?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
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
              aria-label="Clear date"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            onChange(d);
            setOpen(false);
          }}
          initialFocus
          fromDate={fromDate}
          toDate={toDate}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * DateRangePicker — from/to range built on Calendar `mode="range"`.
 */
export function DateRangePicker({
  value,
  onChange,
  placeholder = "Pick a date range",
  disabled,
  clearable = true,
  dateFormat = "LLL d, y",
  className,
}: {
  value: DateRange | undefined;
  onChange: (next: DateRange | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  dateFormat?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const label =
    value?.from && value?.to
      ? `${format(value.from, dateFormat)} – ${format(value.to, dateFormat)}`
      : value?.from
        ? format(value.from, dateFormat)
        : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value?.from && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1 truncate">{label}</span>
          {clearable && value?.from && (
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
              aria-label="Clear range"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Convert a Date to a "YYYY-MM-DD" local-tz string suitable for `<input type="date">`. */
export function toDateString(d: Date | undefined | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a "YYYY-MM-DD" string as a local-tz Date. */
export function fromDateString(s: string | undefined | null): Date | undefined {
  if (!s) return undefined;
  const [y, m, day] = s.split("-").map(Number);
  if (!y || !m || !day) return undefined;
  const d = new Date(y, m - 1, day);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
