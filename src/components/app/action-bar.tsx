import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  /** Buttons kept inline, right-aligned. Only the first `maxVisible` are shown inline. */
  primary: ReactNode[];
  /** Extra actions always collapsed into the overflow menu — render as <DropdownMenuItem>. */
  overflow?: ReactNode[];
  /** How many `primary` actions stay inline before the rest spill into the overflow menu. */
  maxVisible?: number;
};

/**
 * Right-aligned action row for page headers: keeps at most `maxVisible` buttons
 * inline and collapses everything past that (plus any explicit `overflow` items)
 * into a single "More actions" dropdown, so headers never sprawl past two buttons.
 */
export function ActionBar({ primary, overflow, maxVisible = 2 }: Props) {
  const visible = primary.slice(0, maxVisible);
  const extra = [...primary.slice(maxVisible), ...(overflow ?? [])];

  return (
    <div className="flex items-center justify-end gap-2">
      {visible}
      {extra.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-control" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            {extra}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
