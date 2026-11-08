import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { BookText, Plus, Pencil, Trash2, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { sbAny } from "@/lib/supabase/untyped";

/**
 * Reusable WA Chatbot reply templates.
 * Stored in `message_templates` with category = "wa_chatbot".
 */
export const WA_TEMPLATE_CATEGORY = "wa_chatbot";

export type WaTemplate = {
  id: string;
  workspace_id: string;
  name: string;
  body: string;
  shortcut: string | null;
  category: string | null;
  usage_count: number;
  updated_at: string;
};

export function useWaTemplates(workspaceId: string | null) {
  return useQuery<WaTemplate[]>({
    enabled: !!workspaceId,
    queryKey: ["wa-chatbot-templates", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("id, workspace_id, name, body, shortcut, category, usage_count, updated_at")
        .eq("workspace_id", workspaceId!)
        .eq("category", WA_TEMPLATE_CATEGORY)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WaTemplate[];
    },
  });
}

/** Dialog to manage the reusable template library. */
export function TemplatesLibraryDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string | null;
}) {
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useWaTemplates(workspaceId);
  const [editing, setEditing] = useState<Partial<WaTemplate> | null>(null);
  const [search, setSearch] = useState("");

  const upsert = useMutation({
    mutationFn: async (t: Partial<WaTemplate>) => {
      if (!workspaceId) throw new Error("No workspace");
      if (!t.name?.trim() || !t.body?.trim()) throw new Error("Name and body required");
      const row = {
        workspace_id: workspaceId,
        name: t.name.trim(),
        body: t.body,
        shortcut: t.shortcut?.trim() || null,
        category: WA_TEMPLATE_CATEGORY,
      };
      if (t.id) {
        const { error } = await supabase.from("message_templates").update(row).eq("id", t.id);
        if (error) throw error;
      } else {
        // RLS (message_templates INSERT) requires created_by = auth.uid();
        // the column has no default, so it must be sent explicitly.
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error("Not authenticated");
        const { error } = await sbAny(supabase)
          .from("message_templates")
          .insert({ ...row, created_by: u.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-chatbot-templates"] });
      setEditing(null);
      toast.success("Template saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("message_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-chatbot-templates"] });
      toast.success("Template deleted");
    },
  });

  const filtered = templates.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q) ||
      (t.shortcut ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookText className="h-5 w-5" /> Message Templates Library
          </DialogTitle>
          <DialogDescription>
            Reusable replies for your WA Chatbot rules. Update once — every rule using it stays in
            sync.
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Greeting"
              />
            </div>
            <div>
              <Label>Shortcut (optional)</Label>
              <Input
                value={editing.shortcut ?? ""}
                onChange={(e) => setEditing({ ...editing, shortcut: e.target.value })}
                placeholder="/hi"
              />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea
                rows={6}
                value={editing.body ?? ""}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                placeholder="Hi {{name}}, thanks for reaching out!"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Variables: {"{{name}}"}, {"{{phone}}"}, {"{{time}}"}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={() => upsert.mutate(editing)} disabled={upsert.isPending}>
                {upsert.isPending ? "Saving" : "Save Template"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates"
                  className="pl-8"
                />
              </div>
              <Button size="sm" onClick={() => setEditing({ name: "", body: "", shortcut: "" })}>
                <Plus className="h-4 w-4 " /> New Template
              </Button>
            </div>

            <div className="max-h-[420px] overflow-auto divide-y rounded-control border">
              {isLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading</div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {templates.length === 0
                    ? "No templates yet. Create your first reusable reply."
                    : "No matches."}
                </div>
              ) : (
                filtered.map((t) => (
                  <div key={t.id} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{t.name}</span>
                        {t.shortcut && (
                          <Badge variant="outline" className="rounded-control font-mono text-xs">
                            {t.shortcut}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="rounded-control">
                          {t.usage_count} uses
                        </Badge>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                        {t.body}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => confirm("Delete this template?") && del.mutate(t.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Inline picker: shows templates as chips; clicking one inserts its body. */
export function TemplatePicker({
  workspaceId,
  onPick,
}: {
  workspaceId: string | null;
  onPick: (body: string) => void;
}) {
  const { data: templates = [] } = useWaTemplates(workspaceId);
  if (templates.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {templates.slice(0, 12).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t.body)}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-control border bg-muted/40 hover:bg-muted transition"
          title={t.body}
        >
          <Check className="h-3 w-3 opacity-60" />
          {t.name}
        </button>
      ))}
    </div>
  );
}
