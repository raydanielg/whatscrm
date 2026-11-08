import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareText, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listSystemTemplates,
  upsertSystemTemplate,
  deleteSystemTemplate,
} from "@/lib/admin/communications.functions";
import { TranslationsEditor } from "./translations-editor";
import type { Translations } from "@/lib/i18n/languages";

interface Template {
  id: string;
  code: string;
  channel: "email" | "in_app" | "sms";
  subject: string | null;
  body: string;
  variables: string[];
  translations: Translations;
  enabled: boolean;
  updated_at: string;
}

export function SystemTemplatesManager() {
  const qc = useQueryClient();
  const list = useServerFn(listSystemTemplates);
  const upsert = useServerFn(upsertSystemTemplate);
  const remove = useServerFn(deleteSystemTemplate);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["system_templates"],
    queryFn: () => list(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);

  const mUpsert = useMutation({
    mutationFn: async (t: Record<string, unknown>) => upsert({ data: t as never }),
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["system_templates"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mDelete = useMutation({
    mutationFn: async (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["system_templates"] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold">System messages</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Transactional templates (welcome, password reset, invoice, etc.). Multi-language,
            versioned.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing({
              code: "",
              channel: "email",
              subject: "",
              body: "",
              variables: [],
              translations: {},
              enabled: true,
            });
            setOpen(true);
          }}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" /> New template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isLoading ? (
          <div className="col-span-full p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 inline animate-spin" /> Loading
          </div>
        ) : (rows as Template[]).length === 0 ? (
          <div className="col-span-full p-10 text-center text-sm text-muted-foreground rounded-control border border-dashed border-border">
            No templates yet.
          </div>
        ) : (
          (rows as Template[]).map((t) => (
            <div key={t.id} className="rounded-control border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center shrink-0">
                    <MessageSquareText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-xs truncate">{t.code}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {t.channel.replace("_", " ")}
                      </Badge>
                      <Badge variant={t.enabled ? "default" : "secondary"} className="text-[11px]">
                        {t.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(t);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => confirm("Delete template?") && mDelete.mutate(t.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {t.subject && <div className="text-xs font-medium truncate">{t.subject}</div>}
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</div>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit" : "New"} system template</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Code</Label>
                  <Input
                    placeholder="welcome_email"
                    className="font-mono text-xs"
                    value={editing.code ?? ""}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Channel</Label>
                  <select
                    className="w-full h-9 rounded-control border border-input bg-transparent px-3 text-sm"
                    value={editing.channel ?? "email"}
                    onChange={(e) =>
                      setEditing({ ...editing, channel: e.target.value as Template["channel"] })
                    }
                  >
                    <option value="email">Email</option>
                    <option value="in_app">In-app</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>
              </div>
              {editing.channel === "email" && (
                <div>
                  <Label className="text-xs">Subject (English)</Label>
                  <Input
                    value={editing.subject ?? ""}
                    onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">
                  Body (English) — use {"{{variable}}"} placeholders
                </Label>
                <RichTextarea
                  rows={6}
                  value={editing.body ?? ""}
                  onChange={(v) => setEditing({ ...editing, body: v })}
                />
              </div>
              <TranslationsEditor
                translations={editing.translations ?? {}}
                onChange={(t) => setEditing({ ...editing, translations: t })}
                showSubject={editing.channel === "email"}
              />
              <div className="flex items-center gap-2 text-sm">
                <Checkbox
                  id="template-enabled"
                  checked={editing.enabled ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, enabled: v === true })}
                />
                <Label htmlFor="template-enabled" className="font-normal">
                  Enabled
                </Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => editing && mUpsert.mutate(editing as Record<string, unknown>)}
              disabled={mUpsert.isPending}
            >
              {mUpsert.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
