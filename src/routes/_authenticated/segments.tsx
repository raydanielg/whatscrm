import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Users, Plus, Pencil, Trash2, Copy, Search, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  useSegments,
  useUpsertSegment,
  useDeleteSegment,
  useMarketingRealtime,
  type SegmentRow,
} from "@/hooks/use-marketing";
import { SegmentEditorDialog } from "@/components/app/segments/segment-editor-dialog";
import {
  countSegmentMembers,
  describeCondition,
  type SegmentCondition,
  type SegmentFilterDefinition,
} from "@/lib/marketing/segment-filters";

export const Route = createFileRoute("/_authenticated/segments")({
  component: SegmentsPage,
});

function normalizeDef(def: unknown): SegmentFilterDefinition {
  if (!def || typeof def !== "object") return { logic: "AND", conditions: [] };
  const raw = def as { logic?: string; conditions?: unknown };
  return {
    logic: raw.logic === "OR" ? "OR" : "AND",
    conditions: Array.isArray(raw.conditions) ? (raw.conditions as SegmentCondition[]) : [],
  };
}

function SegmentsPage() {
  useMarketingRealtime();
  const formatZonedDate = useZonedDateFormatter();
  const { active } = useCurrentWorkspace();
  const { data: segments, isLoading } = useSegments();
  const upsert = useUpsertSegment();
  const del = useDeleteSegment();

  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SegmentRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SegmentRow | null>(null);
  const [recomputingId, setRecomputingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = segments ?? [];
    if (!q) return list;
    return list.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q),
    );
  }, [segments, search]);

  function openNew() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(s: SegmentRow) {
    setEditing(s);
    setEditorOpen(true);
  }

  async function handleDuplicate(s: SegmentRow) {
    if (!active) return;
    try {
      await upsert.mutateAsync({
        workspace_id: active.id,
        name: `${s.name} (copy)`,
        description: s.description,
        color: s.color,
        icon: s.icon,
        filter_definition: s.filter_definition,
        is_dynamic: s.is_dynamic,
        member_count: s.member_count,
      });
      toast.success("Segment duplicated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate");
    }
  }

  async function handleRecompute(s: SegmentRow) {
    if (!active) return;
    setRecomputingId(s.id);
    try {
      const def = normalizeDef(s.filter_definition);
      const count = await countSegmentMembers(supabase, active.id, def);
      // Plain UPDATE, not upsert: an upsert builds an INSERT row first and fails the
      // NOT NULL check on `name` even though the segment already exists.
      const { error: updErr } = await supabase
        .from("customer_segments")
        .update({ member_count: count, last_computed_at: new Date().toISOString() })
        .eq("id", s.id)
        .eq("workspace_id", active.id);
      if (updErr) throw updErr;
      toast.success(`Recomputed — ${count.toLocaleString()} contacts`);
    } catch (e) {
      // Supabase errors are plain objects, not Error instances, so read .message directly.
      const msg =
        e instanceof Error
          ? e.message
          : typeof (e as { message?: unknown })?.message === "string"
            ? (e as { message: string }).message
            : "";
      toast.error(msg ? `Recompute failed: ${msg}` : "Recompute failed");
    } finally {
      setRecomputingId(null);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await del.mutateAsync(confirmDelete.id);
      toast.success("Segment deleted");
      setConfirmDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <>
      <AppTopbar
        title="Segments"
        subtitle="Reusable audiences for targeted campaigns"
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" /> New segment
          </Button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search segments"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading segments</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-control border border-dashed border-border bg-surface p-10 text-center">
            <Users className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-medium">{search ? "No matching segments" : "No segments yet"}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Build reusable audiences by tags, activity, and custom fields.
            </div>
            {!search && (
              <Button className="mt-4" size="sm" onClick={openNew}>
                <Plus className="h-4 w-4" /> Create your first segment
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((s) => {
              const def = normalizeDef(s.filter_definition);
              const preview = def.conditions.slice(0, 3).map(describeCondition);
              const extra = def.conditions.length - preview.length;
              return (
                <div
                  key={s.id}
                  className="rounded-control border border-border bg-surface p-4 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-control grid place-items-center text-sm font-medium"
                      style={{
                        background: s.color ? `${s.color}22` : "hsl(var(--accent) / 0.1)",
                        color: s.color ?? "hsl(var(--accent))",
                      }}
                    >
                      {s.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.member_count.toLocaleString()} members
                      </div>
                    </div>
                    <Badge variant={s.is_dynamic ? "default" : "secondary"} className="text-[11px]">
                      {s.is_dynamic ? "Dynamic" : "Static"}
                    </Badge>
                  </div>

                  {s.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {s.description}
                    </div>
                  )}

                  <div className="space-y-1 text-xs text-muted-foreground">
                    {preview.length === 0 ? (
                      <div className="italic">No filters — matches every eligible contact</div>
                    ) : (
                      preview.map((line, i) => (
                        <div key={i} className="truncate">
                          • {line}
                        </div>
                      ))
                    )}
                    {extra > 0 && (
                      <div>
                        + {extra} more rule{extra === 1 ? "" : "s"}
                      </div>
                    )}
                    {def.conditions.length > 1 && (
                      <div className="text-[11px] uppercase tracking-wide">
                        Match {def.logic === "OR" ? "any (OR)" : "all (AND)"}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex items-center justify-between border-t pt-3">
                    <div className="text-xs text-muted-foreground">
                      {s.last_computed_at
                        ? `Updated ${formatZonedDate(s.last_computed_at, {})}`
                        : "Not computed"}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Recompute count"
                        disabled={recomputingId === s.id}
                        onClick={() => handleRecompute(s)}
                      >
                        {recomputingId === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Duplicate"
                        onClick={() => handleDuplicate(s)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Edit"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        title="Delete"
                        onClick={() => setConfirmDelete(s)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <SegmentEditorDialog open={editorOpen} onOpenChange={setEditorOpen} segment={editing} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete segment?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" will be permanently removed. Campaigns that referenced it will
              keep their audience snapshot but lose the live segment link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
