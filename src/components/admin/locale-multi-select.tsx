import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LocaleOption = { value: string; label: string; hint?: string; group?: string };

/**
 * Searchable multi-select for large reference lists (currencies, timezones,
 * languages). Selected values are shown as removable chips above a filtered,
 * scrollable option list so hundreds of entries stay usable.
 */
export function LocaleMultiSelect({
  label,
  description,
  options,
  selected,
  onChange,
  emptyHint = "Nothing selected — everything is available.",
}: {
  label: string;
  description?: string;
  options: LocaleOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? options.filter(
          (o) =>
            o.value.toLowerCase().includes(q) ||
            o.label.toLowerCase().includes(q) ||
            (o.hint ?? "").toLowerCase().includes(q),
        )
      : options;
    return base.slice(0, 300);
  }, [options, query]);

  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(Array.from(next));
  };

  const optionLabel = (value: string) =>
    options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0">
          <Label className="truncate">{label}</Label>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="secondary" className="">
            {selected.length} selected
          </Badge>
          {selected.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-control border border-border/60 bg-muted/30 p-2">
          {selected.map((v) => (
            <Badge key={v} variant="default" className="gap-1 pr-1">
              <span className="max-w-[14rem] truncate">{optionLabel(v)}</span>
              <button
                type="button"
                aria-label={`Remove ${optionLabel(v)}`}
                onClick={() => toggle(v)}
                className="rounded-control opacity-70 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}`}
          className="h-9 pl-8"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-control border border-border">
        {filtered.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">No matches.</p>
        )}
        {filtered.map((o) => {
          const active = selectedSet.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={cn(
                "flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted",
                active && "bg-accent/10",
              )}
            >
              <span
                className={cn(
                  "grid h-4 w-4 shrink-0 place-items-center rounded border",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {active && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.hint && (
                <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>
              )}
            </button>
          );
        })}
        {!query && options.length > filtered.length && (
          <p className="p-2 text-center text-[11px] text-muted-foreground">
            Showing first {filtered.length} of {options.length} — search to narrow.
          </p>
        )}
      </div>
    </div>
  );
}
