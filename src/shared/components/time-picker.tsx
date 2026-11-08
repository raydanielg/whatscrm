import * as React from "react";
import { Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * TimePicker — HH:mm 24-hour picker rendered in a Popover with hour/minute columns.
 * Controlled via `value` (string like "14:30") + `onChange`.
 */
export function TimePicker({
  value,
  onChange,
  placeholder = "Pick a time",
  disabled,
  clearable = true,
  minuteStep = 5,
  className,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  minuteStep?: number;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [hh, mm] = React.useMemo(() => {
    if (!value) return ["", ""] as const;
    const [h, m] = value.split(":");
    return [h ?? "", (m ?? "").slice(0, 2)] as const;
  }, [value]);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) =>
    String(i * minuteStep).padStart(2, "0"),
  );

  const set = (h: string, m: string) => {
    onChange(`${h.padStart(2, "0")}:${m.padStart(2, "0")}`);
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
          <Clock className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1 truncate">{value || placeholder}</span>
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
              aria-label="Clear time"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <div className="flex divide-x">
          <ScrollArea className="h-56 w-16">
            <div className="flex flex-col p-1">
              {hours.map((h) => (
                <Button
                  key={h}
                  type="button"
                  variant={hh === h ? "default" : "ghost"}
                  size="sm"
                  className="justify-center rounded-control px-2"
                  onClick={() => set(h, mm || "00")}
                >
                  {h}
                </Button>
              ))}
            </div>
          </ScrollArea>
          <ScrollArea className="h-56 w-16">
            <div className="flex flex-col p-1">
              {minutes.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={mm === m ? "default" : "ghost"}
                  size="sm"
                  className="justify-center rounded-control px-2"
                  onClick={() => set(hh || "00", m)}
                >
                  {m}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
