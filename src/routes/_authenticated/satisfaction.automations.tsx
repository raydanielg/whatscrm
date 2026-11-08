import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAutomations, saveAutomation, toggleAutomation, deleteAutomation, listSurveys } from "@/lib/satisfaction/satisfaction.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/satisfaction/automations")({
  component: AutomationsPage,
});

type Automation = {
  id?: string; survey_id: string; name: string;
  trigger_type: "event" | "schedule" | "workflow" | "manual";
  trigger_event: string | null; channel: string; delay_minutes: number;
  is_active: boolean;
};

const EVENTS = [
  { value: "ticket.resolved", label: "Ticket resolved" },
  { value: "ticket.closed", label: "Ticket closed" },
  { value: "appointment.completed", label: "Appointment completed" },
  { value: "order.delivered", label: "Order delivered" },
  { value: "invoice.paid", label: "Invoice paid" },
  { value: "deal.won", label: "Deal won" },
  { value: "contact.created", label: "New customer" },
  { value: "conversation.closed", label: "Conversation closed" },
];

function AutomationsPage() {
  const listFn = useServerFn(listAutomations);
  const saveFn = useServerFn(saveAutomation);
  const toggleFn = useServerFn(toggleAutomation);
  const delFn = useServerFn(deleteAutomation);
  const surveysFn = useServerFn(listSurveys);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["satisfaction-automations"], queryFn: () => listFn() });
  const { data: surveys = [] } = useQuery({ queryKey: ["satisfaction-surveys"], queryFn: () => surveysFn({ data: { active: true } }) });
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Automation | null>(null);

  const save = useMutation({
    mutationFn: () => saveFn({ data: edit as never }),
    onSuccess: () => { toast.success("Saved"); setOpen(false); setEdit(null); qc.invalidateQueries({ queryKey: ["satisfaction-automations"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const list = data as unknown as Array<Automation & { id: string; run_count: number; last_run_at: string | null; csat_surveys: { name: string; survey_type: string } | null }>;
  const surveyList = surveys as unknown as Array<{ id: string; name: string; survey_type: string }>;

  const create = () => { setEdit({ survey_id: surveyList[0]?.id ?? "", name: "", trigger_type: "event", trigger_event: "ticket.resolved", channel: "email", delay_minutes: 30, is_active: true }); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Survey automations</h2>
          <p className="text-sm text-muted-foreground">Trigger surveys from events, schedules or workflows.</p>
        </div>
        <Button className="h-9" onClick={create} disabled={surveyList.length === 0}><Plus className="w-4 h-4 " />New automation</Button>
      </div>

      <div className="grid gap-3">
        {list.map((a) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <Zap className="w-5 h-5 text-primary shrink-0 mt-1" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{a.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="outline" className="text-xs">{a.trigger_type}</Badge>
                    {a.trigger_event && <Badge variant="outline" className="text-xs">{a.trigger_event}</Badge>}
                    <Badge variant="outline" className="text-xs">{a.channel}</Badge>
                    <Badge variant="outline" className="text-xs">+{a.delay_minutes}m</Badge>
                    {a.csat_surveys && <Badge variant="secondary" className="text-xs">→ {a.csat_surveys.name}</Badge>}
                    <span className="text-xs text-muted-foreground">Ran {a.run_count}×</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={a.is_active} onCheckedChange={(v) => { toggleFn({ data: { id: a.id, is_active: v } }); qc.invalidateQueries({ queryKey: ["satisfaction-automations"] }); }} />
                <Button size="sm" variant="ghost" onClick={() => { setEdit(a); setOpen(true); }}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete?")) { delFn({ data: { id: a.id } }).then(() => qc.invalidateQueries({ queryKey: ["satisfaction-automations"] })); } }}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && <Card><CardContent className="p-10 text-center text-muted-foreground">No automations yet.</CardContent></Card>}
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEdit(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit automation" : "New automation"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><Label>Survey</Label>
                <Select value={edit.survey_id} onValueChange={(v) => setEdit({ ...edit, survey_id: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{surveyList.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.survey_type.toUpperCase()})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div><Label>Trigger type</Label>
                  <Select value={edit.trigger_type} onValueChange={(v) => setEdit({ ...edit, trigger_type: v as Automation["trigger_type"] })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="schedule">Schedule</SelectItem>
                      <SelectItem value="workflow">Workflow</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Event</Label>
                  <Select value={edit.trigger_event ?? ""} onValueChange={(v) => setEdit({ ...edit, trigger_event: v })} disabled={edit.trigger_type !== "event"}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{EVENTS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div><Label>Channel</Label>
                  <Select value={edit.channel} onValueChange={(v) => setEdit({ ...edit, channel: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{["email", "sms", "whatsapp", "in_app", "web"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Delay (minutes)</Label><Input type="number" min={0} value={edit.delay_minutes} onChange={(e) => setEdit({ ...edit, delay_minutes: Number(e.target.value) || 0 })} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={edit.is_active} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} /><Label>Active</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); setEdit(null); }}>Cancel</Button>
            <Button className="h-9" onClick={() => save.mutate()} disabled={save.isPending || !edit?.name || !edit?.survey_id}>{save.isPending ? "Saving" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
