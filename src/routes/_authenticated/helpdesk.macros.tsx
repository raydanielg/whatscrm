import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMacros, saveMacro, deleteMacro } from "@/lib/helpdesk/helpdesk.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Zap, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/helpdesk/macros")({
  component: MacrosPage,
});

type Macro = { id: string; name: string; description: string | null; body: string; actions: Array<{ type: string; value?: unknown }>; usage_count: number | null };

function MacrosPage() {
  const listFn = useServerFn(listMacros);
  const saveFn = useServerFn(saveMacro);
  const delFn = useServerFn(deleteMacro);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["helpdesk-macros"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Macro> | null>(null);
  const [statusAction, setStatusAction] = useState<string>("none");

  const save = useMutation({
    mutationFn: () => {
      const actions: Array<{ type: string; value?: unknown }> = [];
      if (statusAction !== "none") actions.push({ type: "set_status", value: statusAction });
      return saveFn({ data: {
        id: editing?.id,
        name: editing?.name ?? "",
        description: editing?.description ?? undefined,
        body: editing?.body ?? "",
        actions,
      } as never });
    },
    onSuccess: () => { toast.success("Macro saved"); setOpen(false); setEditing(null); setStatusAction("none"); qc.invalidateQueries({ queryKey: ["helpdesk-macros"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["helpdesk-macros"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Macros</h2>
          <p className="text-sm text-muted-foreground">Canned responses with bulk actions — apply from a ticket in one click.</p>
        </div>
        <Button onClick={() => { setEditing({ name: "", body: "" }); setStatusAction("none"); setOpen(true); }}><Plus className="h-4 w-4 " /> New macro</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(data as Macro[]).map((m) => (
          <Card key={m.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-primary" />{m.name}</CardTitle>
                  {m.description && <p className="text-xs text-muted-foreground mt-1">{m.description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(m); setStatusAction((m.actions ?? []).find((a) => a.type === "set_status")?.value as string ?? "none"); setOpen(true); }}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => del.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm line-clamp-3 text-muted-foreground">{m.body}</div>
              <div className="flex gap-2 mt-2">
                {(m.actions ?? []).map((a, i) => <Badge key={i} variant="outline" className="text-xs">{a.type}: {String(a.value)}</Badge>)}
                <Badge variant="secondary" className="ml-auto text-xs">Used {m.usage_count ?? 0}×</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {(data as Macro[]).length === 0 && (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No macros yet. Create one to speed up repetitive replies.</CardContent></Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit macro" : "New macro"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={editing?.name ?? ""} onChange={(e) => setEditing((v) => ({ ...v, name: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={editing?.description ?? ""} onChange={(e) => setEditing((v) => ({ ...v, description: e.target.value }))} />
            </div>
            <div>
              <Label>Reply body</Label>
              <Textarea rows={6} value={editing?.body ?? ""} onChange={(e) => setEditing((v) => ({ ...v, body: e.target.value }))} />
            </div>
            <div>
              <Label>Also set status</Label>
              <Select value={statusAction} onValueChange={setStatusAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Don't change status</SelectItem>
                  <SelectItem value="pending">Set to pending</SelectItem>
                  <SelectItem value="resolved">Set to resolved</SelectItem>
                  <SelectItem value="snoozed">Snooze</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !editing?.name || !editing?.body}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
