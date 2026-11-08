import * as React from "react";
import { format, setMonth, setYear } from "date-fns";
import { CalendarIcon, X, Cake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * BirthdayPicker — date picker tuned for birthdays.
 * - Month + year dropdown navigation (fast decade jumps)
 * - Clamped to a sensible birth-year window (default 1900 → current year)
 * - Opens on ~30 years ago when empty so users don't scroll from today
 * - Blocks future dates
 */
export function BirthdayPicker({
  value,
  onChange,
  placeholder = "Select birthday",
  disabled,
  clearable = true,
  dateFormat = "PPP",
  minYear,
  maxYear,
  className,
}: {
  value: Date | undefined;
  onChange: (next: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  dateFormat?: string;
  minYear?: number;
  maxYear?: number;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const today = React.useMemo(() => new Date(), []);
  const toYear = maxYear ?? today.getFullYear();
  const fromYear = minYear ?? 1900;

  const defaultMonth = React.useMemo(() => {
    if (value) return value;
    const d = new Date(today);
    d.setFullYear(today.getFullYear() - 30);
    d.setDate(1);
    return d;
  }, [value, today]);

  const [month, setViewMonth] = React.useState<Date>(defaultMonth);
  React.useEffect(() => {
    if (open) setViewMonth(value ?? defaultMonth);
  }, [open, value, defaultMonth]);

  const label = value ? format(value, dateFormat) : placeholder;

  const years = React.useMemo(() => {
    const out: number[] = [];
    for (let y = toYear; y >= fromYear; y--) out.push(y);
    return out;
  }, [fromYear, toYear]);

  const months = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        new Date(2000, i, 1).toLocaleString("default", { month: "long" }),
      ),
    [],
  );

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
          <Cake className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1 truncate">{label}</span>
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
              aria-label="Clear birthday"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          {!value && <CalendarIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <div className="flex items-center gap-2 border-b p-2">
          <select
            aria-label="Month"
            className="h-8 flex-1 rounded-control border bg-background px-2 text-sm"
            value={month.getMonth()}
            onChange={(e) => setViewMonth(setMonth(month, Number(e.target.value)))}
          >
            {months.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <select
            aria-label="Year"
            className="h-8 w-24 rounded-control border bg-background px-2 text-sm"
            value={month.getFullYear()}
            onChange={(e) => setViewMonth(setYear(month, Number(e.target.value)))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <Calendar
          mode="single"
          selected={value}
          month={month}
          onMonthChange={setViewMonth}
          onSelect={(d) => {
            onChange(d);
            setOpen(false);
          }}
          disabled={{ after: today }}
          startMonth={new Date(fromYear, 0, 1)}
          endMonth={new Date(toYear, 11, 31)}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        {value && (
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            Age {computeAge(value, today)} · {format(value, "EEEE")}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function computeAge(dob: Date, ref: Date): number {
  let age = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}
