import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Save, Star, Wand2, Sparkles, BarChart3 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card as StatCard } from "@/components/ui/card";
import { AppTopbar } from "@/components/app/app-topbar";

import {
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  useTagsRealtime,
  useTagAnalytics,
  TAG_ENTITIES,
  type TagRow,
  type SegmentRules,
  type TagEntity,
} from "@/hooks/use-tags";
import { TagBadge } from "@/components/app/tags/tag-badge";
import { SegmentBuilder } from "@/components/app/tags/segment-builder";
import { SegmentList } from "@/components/app/tags/segment-list";

export const Route = createFileRoute("/_authenticated/tags")({
  component: TagsPage,
});

const DEFAULT_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#0ea5e9",
  "#8b5cf6",
  "#64748b",
];

function TagsPage() {
  useTagsRealtime();
  const { data: tags = [], isLoading } = useTags();
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState("all");
  const [segmentEntity, setSegmentEntity] = useState<TagEntity>("contact");

  const view = useMemo(() => {
    let list = tags;
    if (tab === "favorites") list = list.filter((t) => t.is_favorite);
    if (tab === "smart") list = list.filter((t) => t.is_smart);
    if (tab === "ai") list = list.filter((t) => t.is_ai_generated);
    const q = filter.trim().toLowerCase();
    if (q) list = list.filter((t) => t.name.toLowerCase().includes(q));
    return list;
  }, [tags, tab, filter]);

  return (
    <>
      <AppTopbar
        title="Tags & Segments"
        subtitle="Organize records with color-coded tags and reusable segments"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 " /> New tag
          </Button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <TagStats />

        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="favorites">
                <Star className="h-3.5 w-3.5 " /> Favorites
              </TabsTrigger>
              <TabsTrigger value="smart">
                <Wand2 className="h-3.5 w-3.5 " /> Smart
              </TabsTrigger>
              <TabsTrigger value="ai">
                <Sparkles className="h-3.5 w-3.5 " /> AI-generated
              </TabsTrigger>
              <TabsTrigger value="segments">Segments</TabsTrigger>
            </TabsList>
            {tab !== "segments" && (
              <Input
                placeholder="Search tags..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="max-w-xs"
              />
            )}
          </div>

          <TabsContent value={tab === "segments" ? "all" : tab} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading</p>
                ) : view.length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    No tags to show.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tag</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Favorite</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {view.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell>
                              <TagBadge tag={t} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-md">
                              {t.description || "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {t.is_smart ? "Smart" : t.is_ai_generated ? "AI" : "Manual"}
                            </TableCell>
                            <TableCell>{t.is_favorite ? "★" : "—"}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <DeleteBtn id={t.id} name={t.name} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="segments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Saved segments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Label htmlFor="segment-entity">Record type</Label>
                  <Select
                    value={segmentEntity}
                    onValueChange={(value) => setSegmentEntity(value as TagEntity)}
                  >
                    <SelectTrigger id="segment-entity" className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAG_ENTITIES.map((entity) => (
                        <SelectItem key={entity.value} value={entity.value}>
                          {entity.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <SegmentList
                  key={segmentEntity}
                  entityType={segmentEntity}
                  showAllRecords={false}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {(creating || editing) && (
          <TagEditor
            existing={editing}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        )}
      </main>
    </>
  );
}

function DeleteBtn({ id, name }: { id: string; name: string }) {
  const del = useDeleteTag();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        if (!confirm(`Delete tag "${name}"?`)) return;
        del.mutate(id, {
          onSuccess: () => toast.success("Tag deleted"),
          onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
        });
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

function TagStats() {
  const { data = [], isLoading } = useTagAnalytics();
  if (isLoading || data.length === 0) return null;
  const totalTags = data.length;
  const totalAssigns = data.reduce((s: number, t: any) => s + (t.counts?.total ?? 0), 0);
  const smart = data.filter((t: any) => t.is_smart).length;
  const ai = data.filter((t: any) => t.is_ai_generated).length;
  const top = [...data]
    .sort((a: any, b: any) => (b.counts?.total ?? 0) - (a.counts?.total ?? 0))
    .slice(0, 5);
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      <StatCard className="p-4">
        <p className="text-xs text-muted-foreground">Total tags</p>
        <p className="text-2xl font-bold">{totalTags}</p>
      </StatCard>
      <StatCard className="p-4">
        <p className="text-xs text-muted-foreground">Assignments</p>
        <p className="text-2xl font-bold">{totalAssigns}</p>
      </StatCard>
      <StatCard className="p-4">
        <p className="text-xs text-muted-foreground">Smart tags</p>
        <p className="text-2xl font-bold">{smart}</p>
      </StatCard>
      <StatCard className="p-4">
        <p className="text-xs text-muted-foreground">AI-generated</p>
        <p className="text-2xl font-bold">{ai}</p>
      </StatCard>
      <Card className="col-span-2 md:col-span-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Top tags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {top.map((t: any) => (
            <div key={t.id} className="flex items-center gap-3">
              <div className="w-40 truncate">
                <TagBadge tag={t as TagRow} />
              </div>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${totalAssigns ? ((t.counts?.total ?? 0) / totalAssigns) * 100 : 0}%`,
                    backgroundColor: t.color || "#6366f1",
                  }}
                />
              </div>
              <span className="text-xs w-10 text-right text-muted-foreground">
                {t.counts?.total ?? 0}
              </span>
            </div>
          ))}
          {top.length === 0 && <p className="text-xs text-muted-foreground">No assignments yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function TagEditor({ existing, onClose }: { existing: TagRow | null; onClose: () => void }) {
  const { data: allTags = [] } = useTags();
  const create = useCreateTag();
  const update = useUpdateTag();

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [color, setColor] = useState(existing?.color ?? DEFAULT_COLORS[0]);
  const [parentId, setParentId] = useState<string | "none">(existing?.parent_id ?? "none");
  const [isFavorite, setIsFavorite] = useState(existing?.is_favorite ?? false);
  const [isSmart, setIsSmart] = useState(existing?.is_smart ?? false);
  const [smartEntity, setSmartEntity] = useState<TagEntity>(existing?.rules?.entity_type ?? "contact");
  const [rules, setRules] = useState<SegmentRules>(
    existing?.rules && (existing.rules as SegmentRules).conditions
      ? (existing.rules as SegmentRules)
      : { operator: "AND", conditions: [] },
  );

  const submit = async () => {
    if (!name.trim()) return toast.error("Name required");
    const payload = {
      name: name.trim(),
      description: description || null,
      color,
      parent_id: parentId === "none" ? null : parentId,
      is_favorite: isFavorite,
      is_smart: isSmart,
      rules: isSmart
        ? { ...rules, entity_type: smartEntity }
        : ({ operator: "AND", conditions: [] } as SegmentRules),
    };
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, patch: payload });
        toast.success("Tag updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Tag created");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit tag" : "New tag"}</DialogTitle>
          <DialogDescription>
            Reusable across contacts, companies, leads, customers, deals, and tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-10 w-10 rounded-full border-2 ${
                    color === c ? "border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 p-1"
              />
            </div>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Parent tag (nested)</Label>
            <Select value={parentId} onValueChange={(v) => setParentId(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {allTags
                  .filter((t) => t.id !== existing?.id)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-6 md:col-span-2 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isFavorite} onCheckedChange={setIsFavorite} />
              Favorite
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isSmart} onCheckedChange={setIsSmart} />
              Smart tag (saved rule set)
            </label>
          </div>

          {isSmart && (
            <div className="space-y-3 md:col-span-2 border rounded-control p-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Applies to</Label>
                <Select value={smartEntity} onValueChange={(v) => setSmartEntity(v as TagEntity)}>
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAG_ENTITIES.map((e) => (
                      <SelectItem key={e.value} value={e.value}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <SegmentBuilder entityType={smartEntity} value={rules} onChange={setRules} />
              <p className="text-xs text-muted-foreground">
                Save matching conditions for this record type.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            <Save className="h-4 w-4 " />
            {existing ? "Save changes" : "Create tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
