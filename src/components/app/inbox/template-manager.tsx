import { useState } from "react";
import { Plus, Star, StarOff, Trash2, Pencil, Save, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  useMessageTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  type MessageTemplate,
} from "@/hooks/use-productivity";

type FormState = {
  id?: string;
  name: string;
  shortcut: string;
  body: string;
  category: string;
  is_shared: boolean;
  is_favorite: boolean;
};

const empty: FormState = {
  name: "",
  shortcut: "",
  body: "",
  category: "",
  is_shared: true,
  is_favorite: false,
};

export function TemplateManager({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = onOpenChange ?? setUncontrolled;
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);

  const { data: templates = [] } = useMessageTemplates(search);
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const del = useDeleteTemplate();

  const startNew = () => setForm({ ...empty });
  const startEdit = (t: MessageTemplate) =>
    setForm({
      id: t.id,
      name: t.name,
      shortcut: t.shortcut ?? "",
      body: t.body,
      category: t.category ?? "",
      is_shared: t.is_shared,
      is_favorite: t.is_favorite,
    });

  const save = async () => {
    if (!form) return;
    const payload = {
      name: form.name.trim(),
      shortcut: form.shortcut.trim() || null,
      body: form.body,
      category: form.category.trim() || null,
      is_shared: form.is_shared,
      is_favorite: form.is_favorite,
    };
    if (!payload.name || !payload.body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    try {
      if (form.id) {
        await update.mutateAsync({ id: form.id, ...payload });
        toast.success("Template updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Template created");
      }
      setForm(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle>Saved replies & templates</DialogTitle>
          <DialogDescription>
            Create, edit, and organize responses your team can reuse. Use{" "}
            <code className="text-xs bg-muted px-1 rounded">{"{{name}}"}</code>{" "}
            for variables.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[280px_1fr] min-h-[480px]">
          {/* List */}
          <div className="border-r border-border flex flex-col min-h-0">
            <div className="p-3 border-b border-border flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="h-9"
              />
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 shrink-0"
                onClick={startNew}
                aria-label="New template"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <ul className="p-2 space-y-1">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      className={
                        "w-full text-left rounded-control px-2 py-1.5 hover:bg-muted transition-colors " +
                        (form?.id === t.id ? "bg-muted" : "")
                      }
                    >
                      <div className="flex items-center gap-1.5">
                        {t.is_favorite && (
                          <Star className="h-3 w-3 text-amber-500 shrink-0" />
                        )}
                        <span className="text-sm font-medium truncate">
                          {t.name}
                        </span>
                        {t.shortcut && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[11px] font-mono ml-auto"
                          >
                            /{t.shortcut}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {t.body.replace(/\s+/g, " ")}
                      </div>
                    </button>
                  </li>
                ))}
                {templates.length === 0 && (
                  <li className="text-xs text-muted-foreground p-3 text-center">
                    No templates yet.
                  </li>
                )}
              </ul>
            </ScrollArea>
          </div>

          {/* Editor */}
          <div className="flex flex-col min-h-0">
            {form ? (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Order confirmation"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        Shortcut{" "}
                        <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          /
                        </span>
                        <Input
                          value={form.shortcut}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              shortcut: e.target.value.replace(/[^a-z0-9-_]/gi, ""),
                            })
                          }
                          className="pl-6 font-mono text-sm"
                          placeholder="hello"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Input
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="e.g. Onboarding, Support"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Body</Label>
                    <Textarea
                      value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      placeholder="Hi {{customer_name}}, thanks for reaching out"
                      rows={8}
                      className="font-mono text-sm resize-y"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Variables:{" "}
                      <code className="bg-muted px-1 rounded">{"{{customer_name}}"}</code>{" "}
                      <code className="bg-muted px-1 rounded">{"{{agent_name}}"}</code>{" "}
                      <code className="bg-muted px-1 rounded">{"{{company}}"}</code>
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={form.is_shared}
                        onCheckedChange={(v) => setForm({ ...form, is_shared: v })}
                        id="tpl-shared"
                      />
                      <Label htmlFor="tpl-shared" className="cursor-pointer">
                        Share with team
                      </Label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        setForm({ ...form, is_favorite: !form.is_favorite })
                      }
                    >
                      {form.is_favorite ? (
                        <>
                          <StarOff className="h-3.5 w-3.5" />
                          Unfavorite
                        </>
                      ) : (
                        <>
                          <Star className="h-3.5 w-3.5" />
                          Add to favorites
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <div className="border-t border-border p-3 flex items-center justify-between gap-2">
                  <div>
                    {form.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={async () => {
                          if (!form.id) return;
                          await del.mutateAsync(form.id);
                          toast.success("Template deleted");
                          setForm(null);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setForm(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={save}
                      disabled={create.isPending || update.isPending}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {form.id ? "Save changes" : "Create template"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 grid place-items-center text-center p-8">
                <div>
                  <div className="mx-auto h-12 w-12 rounded-control bg-muted grid place-items-center mb-3">
                    <Pencil className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium mb-1">
                    Pick a template to edit
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    or create a new saved reply for your team.
                  </p>
                  <Button size="sm" onClick={startNew} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    New template
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
