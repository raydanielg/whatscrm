/**
 * Merge-field picker — insert {{numbered}} tokens into a text field at the caret.
 *
 * WhatsApp Cloud API only accepts positional placeholders ({{1}}, {{2}}, ).
 * The picker still shows named fields (Customer, Order, etc.) as a guide for
 * what data belongs at each position, but it inserts the next sequential number
 * when `getNextIndex` is supplied.
 */

import { useRef, useState } from "react";
import { Braces, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { MERGE_FIELDS, MERGE_GROUP_LABELS, type MergeField } from "./merge-fields";

export interface MergeFieldPickerProps {
  onInsert: (token: string) => void;
  size?: "sm" | "default";
  label?: string;
  className?: string;
  /** When provided, the picker inserts `{{nextIndex}}` instead of `{{fieldKey}}`. */
  getNextIndex?: () => number;
}

export function MergeFieldPicker({ onInsert, size = "sm", label = "Merge field", className, getNextIndex }: MergeFieldPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const nextToken = getNextIndex ? `{{${getNextIndex()}}}` : undefined;

  const filtered = MERGE_FIELDS.filter(
    (f) =>
      !query ||
      f.label.toLowerCase().includes(query.toLowerCase()) ||
      f.key.toLowerCase().includes(query.toLowerCase()),
  );

  const grouped = filtered.reduce<Record<MergeField["group"], MergeField[]>>((acc, f) => {
    (acc[f.group] ||= []).push(f);
    return acc;
  }, {} as Record<MergeField["group"], MergeField[]>);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setTimeout(() => searchRef.current?.focus(), 30); }}>
      <PopoverTrigger asChild>
        <Button type="button" size={size} variant="outline" className={className}>
          <Braces className="w-3.5 h-3.5 mr-1.5" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-2 border-b border-border">
          <Input
            ref={searchRef}
            className="h-9"
            placeholder="Search merge fields"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {(Object.keys(grouped) as MergeField["group"][]).map((g) => (
            <div key={g} className="py-1">
              <div className="px-3 pt-1.5 pb-1 text-[11px]  text-muted-foreground">
                {MERGE_GROUP_LABELS[g]}
              </div>
              {grouped[g].map((f) => {
                const token = nextToken ?? `{{${f.key}}}`;
                return (
                  <button
                    type="button"
                    key={f.key}
                    onClick={() => { onInsert(token); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted text-sm group"
                  >
                    <f.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{f.label}</span>
                    <code className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                      {token}
                    </code>
                    <Plus className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No fields match.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
