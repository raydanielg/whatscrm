import { useMemo, useState } from "react";
import { Plus, Search, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TagBadge } from "./tag-badge";
import {
  useTags,
  useEntityTags,
  useAssignTag,
  useUnassignTag,
  useCreateTag,
  type TagEntity,
  type TagRow,
} from "@/hooks/use-tags";
import { toast } from "sonner";

interface Props {
  entityType: TagEntity;
  entityId: string;
  compact?: boolean;
}

/** Interactive tag selector used across contact/company/lead/customer pages. */
export function TagSelector({ entityType, entityId, compact }: Props) {
  const { data: tags = [] } = useTags();
  const { data: assigns = [] } = useEntityTags(entityType, entityId);
  const assign = useAssignTag();
  const unassign = useUnassignTag();
  const create = useCreateTag();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const assignedIds = useMemo(() => new Set(assigns.map((a) => a.tag_id)), [assigns]);
  const assigned = useMemo(
    () => tags.filter((t) => assignedIds.has(t.id)),
    [tags, assignedIds]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, search]);

  const toggle = async (tag: TagRow) => {
    try {
      if (assignedIds.has(tag.id)) {
        await unassign.mutateAsync({ tagId: tag.id, entityType, entityId });
      } else {
        await assign.mutateAsync({ tagId: tag.id, entityType, entityId });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const canCreate =
    search.trim().length > 0 &&
    !tags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  const doCreate = async () => {
    try {
      const tag = await create.mutateAsync({ name: search.trim() });
      await assign.mutateAsync({ tagId: tag.id, entityType, entityId });
      setSearch("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {assigned.map((t) => (
        <TagBadge
          key={t.id}
          tag={t}
          onRemove={() =>
            unassign.mutate({ tagId: t.id, entityType, entityId })
          }
        />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size={compact ? "sm" : "sm"}
            className="h-6 gap-1 px-2 text-xs"
          >
            <Plus className="h-3 w-3" />
            Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="flex items-center gap-1 border-b pb-2">
            <Search className="h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or create..."
              className="h-7 border-0 focus-visible:ring-0 shadow-none px-1 text-sm"
            />
          </div>
          <ScrollArea className="max-h-64 mt-2">
            <div className="space-y-1">
              {filtered.map((t) => {
                const on = assignedIds.has(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggle(t)}
                    className="flex w-full items-center justify-between rounded-control px-1.5 py-1 hover:bg-muted text-left"
                  >
                    <TagBadge tag={t} />
                    {on && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                );
              })}
              {filtered.length === 0 && !canCreate && (
                <p className="text-xs text-muted-foreground py-2 px-1">No tags found.</p>
              )}
            </div>
          </ScrollArea>
          {canCreate && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start mt-2"
              onClick={doCreate}
            >
              <Plus className="h-3.5 w-3.5 " />
              Create &quot;{search.trim()}&quot;
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
