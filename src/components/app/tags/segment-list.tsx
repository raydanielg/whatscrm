import { useState } from "react";
import { Bookmark, Plus, Star, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  useSegments,
  useCreateSegment,
  useUpdateSegment,
  useDeleteSegment,
  type SegmentRow,
  type SegmentRules,
  type TagEntity,
} from "@/hooks/use-tags";
import { SegmentBuilder } from "./segment-builder";

interface Props {
  entityType: TagEntity;
  activeId?: string | null;
  onSelect?: (segment: SegmentRow | null) => void;
  showAllRecords?: boolean;
}

/** Vertical list of saved segments for a given entity, with a create/edit dialog. */
export function SegmentList({ entityType, activeId, onSelect, showAllRecords = true }: Props) {
  const { data: segments = [], isLoading, error } = useSegments(entityType);
  const [editing, setEditing] = useState<SegmentRow | null>(null);
  const [creating, setCreating] = useState(false);
  const update = useUpdateSegment();
  const del = useDeleteSegment();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          Segments
        </p>
        <Button variant="ghost" size="icon" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-1">
        {showAllRecords && (
          <button
            onClick={() => onSelect?.(null)}
            className={`w-full text-left rounded-control px-2 py-1.5 text-sm hover:bg-muted ${
              !activeId ? "bg-accent font-medium" : ""
            }`}
          >
            All records
          </button>
        )}
        {isLoading && <p className="text-xs text-muted-foreground px-2 py-1">Loading segments</p>}
        {error && <p className="text-xs text-destructive px-2 py-1">Could not load segments.</p>}
        {segments.map((s) => (
          <div
            key={s.id}
            className={`group flex items-center gap-1 rounded-control px-2 py-1.5 text-sm hover:bg-muted ${
              activeId === s.id ? "bg-accent font-medium" : ""
            }`}
          >
            <button
              onClick={() => (onSelect ? onSelect(s) : setEditing(s))}
              className="flex-1 text-left flex items-center gap-2"
            >
              <Bookmark className="h-3.5 w-3.5" style={{ color: s.color || undefined }} />
              <span className="truncate">{s.name}</span>
              {s.is_favorite && <Star className="h-3 w-3 fill-current text-amber-500" />}
            </button>
            <button
              className="opacity-0 group-hover:opacity-100"
              onClick={() =>
                update.mutate(
                  { id: s.id, patch: { is_favorite: !s.is_favorite } },
                  {
                    onError: (e) =>
                      toast.error(e instanceof Error ? e.message : "Failed to update segment"),
                  },
                )
              }
              title="Favorite"
            >
              <Star
                className={`h-3.5 w-3.5 ${
                  s.is_favorite ? "fill-current text-amber-500" : "text-muted-foreground"
                }`}
              />
            </button>
            <button
              className="opacity-0 group-hover:opacity-100"
              onClick={() => setEditing(s)}
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button
              className="opacity-0 group-hover:opacity-100"
              onClick={() => {
                if (confirm(`Delete segment "${s.name}"?`)) {
                  del.mutate(s.id, {
                    onSuccess: () => toast.success("Segment deleted"),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete segment"),
                  });
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
        {!isLoading && !error && segments.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-1">
            No saved segments yet.
          </p>
        )}
      </div>

      {(creating || editing) && (
        <SegmentEditor
          entityType={entityType}
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SegmentEditor({
  entityType,
  existing,
  onClose,
}: {
  entityType: TagEntity;
  existing: SegmentRow | null;
  onClose: () => void;
}) {
  const create = useCreateSegment();
  const update = useUpdateSegment();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [color, setColor] = useState(existing?.color ?? "#6366f1");
  const [isFavorite, setIsFavorite] = useState(existing?.is_favorite ?? false);
  const [isShared, setIsShared] = useState(existing?.is_shared ?? true);
  const [rules, setRules] = useState<SegmentRules>(
    existing?.rules ?? { operator: "AND", conditions: [] }
  );

  const submit = async () => {
    if (!name.trim()) return toast.error("Name required");
    const payload = {
      entity_type: entityType,
      name: name.trim(),
      description: description || null,
      color,
      rules,
      is_favorite: isFavorite,
      is_shared: isShared,
    };
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, patch: payload });
        toast.success("Segment updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Segment created");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit segment" : "New segment"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Color</Label>
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-24 p-1"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isFavorite} onCheckedChange={setIsFavorite} /> Favorite
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isShared} onCheckedChange={setIsShared} /> Shared with workspace
            </label>
          </div>
          <Card>
            <CardContent className="pt-4">
              <SegmentBuilder entityType={entityType} value={rules} onChange={setRules} />
            </CardContent>
          </Card>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {existing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
