import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Plus, Trash2, Rocket, Sparkles, Bug, Shield, AlertOctagon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  listReleaseNotes,
  upsertReleaseNote,
  deleteReleaseNote,
} from "@/lib/admin/communications.functions";
import { TranslationsEditor } from "./translations-editor";
import type { Translations } from "@/lib/i18n/languages";

type Category = "feature" | "improvement" | "fix" | "security" | "breaking";
interface Row {
  id: string;
  version: string;
  title: string;
  body: string;
  category: Category;
  translations: Translations;
  published_at: string | null;
  created_at: string;
}

const catMeta: Record<Category, { icon: typeof Rocket; className: string; label: string }> = {
  feature: {
    icon: Rocket,
    className: "bg-accent/10 text-accent border-accent/20",
    label: "Feature",
  },
  improvement: {
    icon: Sparkles,
    className: "bg-sky-500/10 text-sky-600 border-sky-500/20",
    label: "Improvement",
  },
  fix: {
    icon: Bug,
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    label: "Fix",
  },
  security: {
    icon: Shield,
    className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    label: "Security",
  },
  breaking: {
    icon: AlertOctagon,
    className: "bg-red-500/10 text-red-600 border-red-500/20",
    label: "Breaking",
  },
};

export function ReleaseNotesManager() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listReleaseNotes);
  const upsert = useServerFn(upsertReleaseNote);
  const remove = useServerFn(deleteReleaseNote);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["release_notes"],
    queryFn: () => fetchAll(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Row> | null>(null);

  const mUpsert = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => upsert({ data: payload as never }),
    onSuccess: () => {
      toast.success(editing?.id ? "Updated" : "Created");
      qc.invalidateQueries({ queryKey: ["release_notes"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mDelete = useMutation({
    mutationFn: async (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["release_notes"] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold">Release notes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Public changelog. Multi-language content for every release.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing({
              version: "",
              title: "",
              body: "",
              category: "improvement",
              translations: {},
            });
            setOpen(true);
          }}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" /> New note
        </Button>
      </div>

      <div className="rounded-control border border-border bg-surface divide-y divide-border">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline" /> Loading
          </div>
        ) : (rows as Row[]).length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No release notes yet.
          </div>
        ) : (
          (rows as Row[]).map((r) => {
            const meta = catMeta[r.category];
            const Icon = meta.icon;
            return (
              <div key={r.id} className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 grid place-items-center shrink-0 border ${meta.className}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                        v{r.version}
                      </span>
                      <span className="font-medium">{r.title}</span>
                      <Badge
                        variant={r.published_at ? "default" : "secondary"}
                        className="text-[11px]"
                      >
                        {r.published_at ? "Published" : "Draft"}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.body}</div>
                    <div className="text-[11px] text-muted-foreground mt-1.5">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(r);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => confirm("Delete this note?") && mDelete.mutate(r.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit" : "New"} release note</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Version</Label>
                  <Input
                    placeholder="1.4.0"
                    value={editing.version ?? ""}
                    onChange={(e) => setEditing({ ...editing, version: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={editing.category ?? "improvement"}
                    onValueChange={(v) => setEditing({ ...editing, category: v as Category })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feature">Feature</SelectItem>
                      <SelectItem value="improvement">Improvement</SelectItem>
                      <SelectItem value="fix">Fix</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                      <SelectItem value="breaking">Breaking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Title (English)</Label>
                <Input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Body (English, Markdown supported)</Label>
                <RichTextarea
                  rows={5}
                  value={editing.body ?? ""}
                  onChange={(v) => setEditing({ ...editing, body: v })}
                />
              </div>
              <TranslationsEditor
                translations={editing.translations ?? {}}
                onChange={(t) => setEditing({ ...editing, translations: t })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => editing && mUpsert.mutate({ ...editing, publish: false })}
              disabled={mUpsert.isPending}
            >
              Save draft
            </Button>
            <Button
              onClick={() => editing && mUpsert.mutate({ ...editing, publish: true })}
              disabled={mUpsert.isPending}
            >
              {mUpsert.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
