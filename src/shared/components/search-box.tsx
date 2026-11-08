import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * SearchBox — enterprise search input with icon, clear button, ⌘K badge.
 * Controlled: `value` + `onValueChange`. Debounce upstream if needed.
 */
export interface SearchBoxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size"> {
  value: string;
  onValueChange: (next: string) => void;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  showShortcut?: boolean;
  shortcut?: string;
}

export const SearchBox = React.forwardRef<HTMLInputElement, SearchBoxProps>(
  (
    {
      value,
      onValueChange,
      placeholder = "Search",
      size = "md",
      showShortcut = false,
      shortcut = "⌘K",
      className,
      ...rest
    },
    ref,
  ) => {
    const heights = { sm: "h-9 text-xs", md: "h-9 text-sm", lg: "h-11 text-base" } as const;
    const iconSize = size === "lg" ? "h-4 w-4" : "h-4 w-4";
    return (
      <div className={cn("relative flex items-center", className)}>
        <Search className={cn("absolute left-3 text-muted-foreground pointer-events-none", iconSize)} aria-hidden="true" />
        <Input
          ref={ref}
          type="search"
          role="searchbox"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          className={cn("pl-9", value ? "pr-16" : showShortcut ? "pr-14" : "pr-3", heights[size])}
          {...rest}
        />
        {value && (
          <button
            type="button"
            onClick={() => onValueChange("")}
            className="absolute right-2 grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {!value && showShortcut && (
          <kbd className="absolute right-2 pointer-events-none hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {shortcut}
          </kbd>
        )}
      </div>
    );
  },
);
SearchBox.displayName = "SearchBox";
