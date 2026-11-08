import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCategories, saveCategory, deleteCategory } from "@/lib/helpdesk/helpdesk.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/helpdesk/categories")({
  component: CategoriesPage,
});

type Category = { id: string; name: string; description: string | null; color: string | null; default_priority: string | null };

function CategoriesPage() {
  const listFn = useServerFn(listCategories);
  const saveFn = useServerFn(saveCategory);
  const delFn = useServerFn(deleteCategory);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["helpdesk-cats"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Category> | null>(null);

  const save = useMutation({
    mutationFn: () => saveFn({ data: {
      id: editing?.id, name: editing?.name ?? "", description: editing?.description ?? undefined,
      color: editing?.color ?? "#075E54", default_priority: editing?.default_priority ?? "normal",
    } as never }),
    onSuccess: () => { toast.success("Saved"); setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["helpdesk-cats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["helpdesk-cats"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Ticket categories</h2>
          <p className="text-sm text-muted-foreground">Organize tickets and drive AI triage classification.</p>
        </div>
        <Button onClick={() => { setEditing({ name: "", color: "#075E54", default_priority: "normal" }); setOpen(true); }}><Plus className="h-4 w-4 " /> New category</Button>
      </div>
      <Card>
        <CardContent className="p-0 divide-y">
          {(data as Category[]).length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">No categories yet.</div>
          ) : (data as Category[]).map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-4">
              <span className="h-10 w-10 rounded-full border" style={{ background: c.color ?? "#075E54" }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center gap-2"><TagIcon className="h-4 w-4" />{c.name}</div>
                {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
              </div>
              <div className="text-xs text-muted-foreground">Default: {c.default_priority}</div>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setOpen(true); }}>Edit</Button>
              <Button variant="ghost" size="sm" onClick={() => del.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit category" : "New category"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={editing?.name ?? ""} onChange={(e) => setEditing((v) => ({ ...v, name: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea rows={2} value={editing?.description ?? ""} onChange={(e) => setEditing((v) => ({ ...v, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Color</Label><Input type="color" value={editing?.color ?? "#075E54"} onChange={(e) => setEditing((v) => ({ ...v, color: e.target.value }))} /></div>
              <div>
                <Label>Default priority</Label>
                <Select value={editing?.default_priority ?? "normal"} onValueChange={(v) => setEditing((s) => ({ ...s, default_priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !editing?.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
