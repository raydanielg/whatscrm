import { useState } from "react";
import { Tags, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TagBadge } from "./tag-badge";
import { useTags, useBulkAssignTag, type TagEntity } from "@/hooks/use-tags";
import { toast } from "sonner";

interface Props {
  entityType: TagEntity;
  entityIds: string[];
  disabled?: boolean;
}

/** Bulk-tag button for list toolbars. Applies a tag to N rows at once. */
export function BulkTagButton({ entityType, entityIds, disabled }: Props) {
  const { data: tags = [] } = useTags();
  const bulk = useBulkAssignTag();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = tags.filter((t) =>
    t.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const apply = async (tagId: string) => {
    try {
      await bulk.mutateAsync({ tagId, entityType, entityIds });
      toast.success(`Tagged ${entityIds.length} record(s)`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || entityIds.length === 0}>
          <Tags className="h-4 w-4 " />
          Tag
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags..."
          className="h-9 text-sm mb-2"
        />
        <ScrollArea className="max-h-64">
          <div className="space-y-1">
            {filtered.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => apply(t.id)}
                className="flex w-full items-center justify-between rounded-control px-1.5 py-1 hover:bg-muted text-left"
              >
                <TagBadge tag={t} />
                <Check className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground py-2 px-1">No tags found.</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
