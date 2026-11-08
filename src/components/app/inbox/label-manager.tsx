import { useState } from "react";
import { Loader2, Plus, Tag, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  useDeleteLabel,
  useLabels,
  useUpsertLabel,
  type Label as LabelRow,
} from "@/hooks/use-inbox-organization";

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
];

export function LabelManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: labels = [] } = useLabels();
  const upsert = useUpsertLabel();
  const del = useDeleteLabel();
  const [draft, setDraft] = useState<{ name: string; color: string }>({
    name: "",
    color: COLORS[5],
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const startEdit = (l: LabelRow) => {
    setEditingId(l.id);
    setDraft({ name: l.name, color: l.color ?? COLORS[5] });
  };
  const clear = () => {
    setEditingId(null);
    setDraft({ name: "", color: COLORS[5] });
  };
  const submit = async () => {
    if (!draft.name.trim()) return;
    await upsert.mutateAsync({
      id: editingId ?? undefined,
      name: draft.name.trim(),
      color: draft.color,
    });
    clear();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" /> Manage labels
          </DialogTitle>
          <DialogDescription>
            Create color-coded labels to organize conversations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-control border border-border p-3 space-y-2">
            <Input
              placeholder="Label name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Pick color ${c}`}
                  onClick={() => setDraft((d) => ({ ...d, color: c }))}
                  className={cn(
                    "h-10 w-10 rounded-full border-2 transition-transform",
                    draft.color === c ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex justify-end gap-2">
              {editingId && (
                <Button variant="ghost" size="sm" onClick={clear}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              )}
              <Button size="sm" onClick={submit} disabled={upsert.isPending || !draft.name.trim()}>
                {upsert.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {editingId ? "Save" : "Create"}
              </Button>
            </div>
          </div>

          <ScrollArea className="max-h-80">
            <div className="space-y-1">
              {labels.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-muted group"
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: l.color ?? "#64748b" }}
                  />
                  <button
                    type="button"
                    className="flex-1 text-left text-sm truncate"
                    onClick={() => startEdit(l)}
                  >
                    {l.name}
                  </button>
                  {l.is_system && (
                    <Badge variant="outline" className="text-[11px] h-4 px-1">
                      System
                    </Badge>
                  )}
                  {!l.is_system && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => del.mutate(l.id)}
                      aria-label="Delete label"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              {labels.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No labels yet. Create your first one above.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LabelChip({ label }: { label: Pick<LabelRow, "name" | "color"> }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-[11px] font-medium border"
      style={{
        borderColor: (label.color ?? "#64748b") + "40",
        backgroundColor: (label.color ?? "#64748b") + "18",
        color: label.color ?? "#64748b",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: label.color ?? "#64748b" }}
      />
      {label.name}
    </span>
  );
}
