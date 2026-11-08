import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type AutocompleteOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  group?: string;
};

/**
 * Autocomplete — single-select typeahead built on Command + Popover.
 * Groups items by their optional `group` field. Fully keyboard-navigable.
 * For multi-select, expose a version that keeps the popover open.
 */
export function Autocomplete({
  options,
  value,
  onValueChange,
  placeholder = "Select",
  searchPlaceholder = "Search",
  emptyText = "No results.",
  clearable = true,
  disabled,
  className,
  contentClassName,
}: {
  options: AutocompleteOption[];
  value: string | null;
  onValueChange: (next: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  const groups = React.useMemo(() => {
    const map = new Map<string, AutocompleteOption[]>();
    for (const o of options) {
      const key = o.group ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries());
  }, [options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate text-left">{selected?.label ?? placeholder}</span>
          <span className="ml-2 flex items-center gap-1 shrink-0">
            {clearable && selected && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onValueChange(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onValueChange(null);
                  }
                }}
                className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-60" aria-hidden="true" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0 w-[var(--radix-popover-trigger-width)]", contentClassName)} align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map(([groupName, items]) => (
              <CommandGroup key={groupName || "default"} heading={groupName || undefined}>
                {items.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    disabled={o.disabled}
                    onSelect={() => {
                      onValueChange(o.value === value ? null : o.value);
                      setOpen(false);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{o.label}</div>
                      {o.description && (
                        <div className="text-caption truncate">{o.description}</div>
                      )}
                    </div>
                    <Check
                      className={cn(
                        "ml-2 h-4 w-4 shrink-0",
                        o.value === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
