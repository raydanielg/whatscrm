import { useMemo, useState } from "react";
import { Boxes, Plus, Trash2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  useKbArticles, useKbCollections, useUpsertKbCollection, useDeleteKbCollection,
  useKbCollectionArticles, useSetKbCollectionArticles,
} from "@/hooks/use-kb";

export function CollectionsPanel({ workspaceId }: { workspaceId: string }) {
  const collectionsQ = useKbCollections(workspaceId);
  const upsert = useUpsertKbCollection();
  const del = useDeleteKbCollection();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    await upsert.mutateAsync({ workspaceId, name: name.trim(), description: description.trim() || null });
    setName(""); setDescription(""); setCreating(false);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Boxes className="h-4 w-4" />
          <span>Group articles across categories — e.g. "Onboarding pack", "Product catalog 2026".</span>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New collection
        </Button>
      </div>

      {creating && (
        <Card className="p-3 space-y-2">
          <Input placeholder="Collection name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setCreating(false); setName(""); setDescription(""); }}>Cancel</Button>
            <Button size="sm" onClick={create} disabled={!name.trim() || upsert.isPending}>
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Create
            </Button>
          </div>
        </Card>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(collectionsQ.data ?? []).map((c) => (
            <Card key={c.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{c.name}</div>
                  {c.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2">{c.description}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(c.id)}>Manage</Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => { if (confirm(`Delete "${c.name}"?`)) del.mutate(c.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.is_public && <Badge variant="secondary">Public</Badge>}
                <Badge variant="outline">{new Date(c.updated_at).toLocaleDateString()}</Badge>
              </div>
            </Card>
          ))}
          {!collectionsQ.isLoading && !(collectionsQ.data ?? []).length && (
            <div className="col-span-full rounded-control border border-dashed p-8 text-center text-sm text-muted-foreground">
              No collections yet. Create your first one to group related articles.
            </div>
          )}
        </div>
      </ScrollArea>

      {editingId && (
        <ManageCollectionDialog
          workspaceId={workspaceId}
          collectionId={editingId}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function ManageCollectionDialog({
  workspaceId, collectionId, onClose,
}: {
  workspaceId: string;
  collectionId: string;
  onClose: () => void;
}) {
  const articlesQ = useKbArticles(workspaceId, {});
  const existingQ = useKbCollectionArticles(collectionId);
  const setArticles = useSetKbCollectionArticles();
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const currentSet = useMemo(
    () => selected ?? new Set(existingQ.data ?? []),
    [selected, existingQ.data],
  );

  const toggle = (id: string) => {
    const next = new Set(currentSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const save = async () => {
    await setArticles.mutateAsync({
      collectionId,
      workspaceId,
      articleIds: Array.from(currentSet),
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage articles</DialogTitle>
          <DialogDescription>Add or remove articles in this collection.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-1">
            {(articlesQ.data ?? []).map((a) => (
              <label
                key={a.id}
                className="flex items-center gap-3 rounded-control p-2 hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox checked={currentSet.has(a.id)} onCheckedChange={() => toggle(a.id)} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.status} · v{a.version}
                  </div>
                </div>
              </label>
            ))}
            {!(articlesQ.data ?? []).length && (
              <div className="p-6 text-center text-sm text-muted-foreground">No articles yet.</div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={setArticles.isPending}>
            {setArticles.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
