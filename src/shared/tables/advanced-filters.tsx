"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { FilterState, FilterValue } from "./use-table-controls";

export type FilterFieldDef =
  | {
      id: string;
      label: string;
      type: "text";
      placeholder?: string;
    }
  | {
      id: string;
      label: string;
      type: "select";
      options: Array<{ label: string; value: string }>;
      placeholder?: string;
    }
  | {
      id: string;
      label: string;
      type: "multiselect";
      options: Array<{ label: string; value: string }>;
    }
  | {
      id: string;
      label: string;
      type: "number";
      min?: number;
      max?: number;
    };

export function AdvancedFilters({
  fields,
  values,
  onChange,
  onClear,
  trigger,
  className,
}: {
  fields: FilterFieldDef[];
  values: FilterState;
  onChange: (id: string, value: FilterValue) => void;
  onClear?: () => void;
  trigger: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className={cn("w-[min(24rem,90vw)] space-y-4", className)}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Filters</p>
          {onClear && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClear}>
              Clear all
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.id} className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{f.label}</Label>
              {f.type === "text" && (
                <Input
                  value={(values[f.id] as string) ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => onChange(f.id, e.target.value)}
                />
              )}
              {f.type === "number" && (
                <Input
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={values[f.id] === null || values[f.id] === undefined ? "" : String(values[f.id])}
                  onChange={(e) =>
                    onChange(f.id, e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              )}
              {f.type === "select" && (
                <Select
                  value={(values[f.id] as string) ?? ""}
                  onValueChange={(v) => onChange(f.id, v === "__all__" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={f.placeholder ?? "Any"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Any</SelectItem>
                    {f.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {f.type === "multiselect" && (
                <div className="flex flex-wrap gap-1.5">
                  {f.options.map((o) => {
                    const arr = ((values[f.id] as string[]) ?? []);
                    const active = arr.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() =>
                          onChange(
                            f.id,
                            active ? arr.filter((v) => v !== o.value) : [...arr, o.value],
                          )
                        }
                        className={cn(
                          "rounded-control border px-2.5 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border bg-surface text-muted-foreground",
                        )}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
