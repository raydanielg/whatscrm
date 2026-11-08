import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getTicket,
  replyToTicket,
  updateTicket,
  escalateTicket,
  attachSla,
  pauseSla,
  listMacros,
  applyMacro,
  listCategories,
  listAgents,
  aiSuggestReply,
  aiTriageTicket,
} from "@/lib/helpdesk/helpdesk.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  AlertTriangle,
  Send,
  Sparkles,
  Timer,
  ChevronUp,
  PauseCircle,
  PlayCircle,
  Zap,
  MessageSquare,
  Bot,
  ArrowLeft,
} from "lucide-react";
import { CollaborationPanel } from "@/components/helpdesk/CollaborationPanel";
import { AiHelpdeskPanel } from "@/components/helpdesk/AiHelpdeskPanel";
import { TicketRelationshipsPanel } from "@/components/helpdesk/TicketRelationshipsPanel";

export const Route = createFileRoute("/_authenticated/helpdesk/$id")({
  component: TicketDetail,
});

function TicketDetail() {
  const fmtZoned = useZonedDateFormatter();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getTicket);
  const replyFn = useServerFn(replyToTicket);
  const updateFn = useServerFn(updateTicket);
  const escalateFn = useServerFn(escalateTicket);
  const attachFn = useServerFn(attachSla);
  const pauseFn = useServerFn(pauseSla);
  const macrosFn = useServerFn(listMacros);
  const applyMacroFn = useServerFn(applyMacro);
  const catsFn = useServerFn(listCategories);
  const agentsFn = useServerFn(listAgents);
  const suggestFn = useServerFn(aiSuggestReply);
  const triageFn = useServerFn(aiTriageTicket);

  const { data, isLoading } = useQuery({
    queryKey: ["helpdesk-ticket", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: 15_000,
  });
  const { data: macros = [] } = useQuery({
    queryKey: ["helpdesk-macros"],
    queryFn: () => macrosFn(),
  });
  const { data: cats = [] } = useQuery({ queryKey: ["helpdesk-cats"], queryFn: () => catsFn() });
  const { data: agents = [] } = useQuery({
    queryKey: ["helpdesk-agents"],
    queryFn: () => agentsFn(),
  });

  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [reason, setReason] = useState("");

  const reply = useMutation({
    mutationFn: () => replyFn({ data: { id, body, isInternal } }),
    onSuccess: () => {
      toast.success(isInternal ? "Internal note added" : "Reply sent");
      setBody("");
      qc.invalidateQueries({ queryKey: ["helpdesk-ticket", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => updateFn({ data: { id, ...patch } as never }),
    onSuccess: () => {
      toast.success("Ticket updated");
      qc.invalidateQueries({ queryKey: ["helpdesk-ticket", id] });
    },
  });
  const escalate = useMutation({
    mutationFn: () => escalateFn({ data: { ticketId: id, reason } }),
    onSuccess: () => {
      toast.success("Ticket escalated");
      setEscalateOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["helpdesk-ticket", id] });
    },
  });
  const attach = useMutation({
    mutationFn: () => attachFn({ data: { ticketId: id } }),
    onSuccess: () => {
      toast.success("SLA attached");
      qc.invalidateQueries({ queryKey: ["helpdesk-ticket", id] });
    },
  });
  const pause = useMutation({
    mutationFn: (pauseValue: boolean) => pauseFn({ data: { ticketId: id, pause: pauseValue } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["helpdesk-ticket", id] }),
  });
  const applyM = useMutation({
    mutationFn: (macroId: string) => applyMacroFn({ data: { ticketId: id, macroId } }),
    onSuccess: () => {
      toast.success("Macro applied");
      qc.invalidateQueries({ queryKey: ["helpdesk-ticket", id] });
    },
  });
  const triage = useMutation({
    mutationFn: () => triageFn({ data: { ticketId: id } }),
    onSuccess: () => {
      toast.success("AI triage applied");
      qc.invalidateQueries({ queryKey: ["helpdesk-ticket", id] });
    },
  });
  const suggest = useMutation({
    mutationFn: () => suggestFn({ data: { ticketId: id, tone: "friendly" } }),
    onSuccess: (r) => {
      if (r?.suggestion) setBody(r.suggestion);
      else toast.error("No suggestion available");
    },
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents as Array<{
      user_id: string;
      profiles?: { full_name?: string; email?: string } | null;
    }>) {
      m.set(a.user_id, a.profiles?.full_name || a.profiles?.email || "Agent");
    }
    return m;
  }, [agents]);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading ticket</div>;
  if (!data) return <div className="text-sm text-muted-foreground">Not found.</div>;
  const t = data.ticket as {
    id: string;
    subject: string | null;
    status: string;
    priority: string;
    assigned_to: string | null;
    ticket_category_id: string | null;
    escalation_level: number | null;
    created_at: string;
    first_response_at: string | null;
    resolved_at: string | null;
    ai_summary: string | null;
    channel: string;
  };
  const sla = data.sla as null | {
    first_response_due_at: string | null;
    resolution_due_at: string | null;
    first_response_breached: boolean;
    resolution_breached: boolean;
    paused: boolean;
  };

  const slaResIn = sla?.resolution_due_at
    ? Math.round((new Date(sla.resolution_due_at).getTime() - Date.now()) / 60_000)
    : null;
  const slaState = !sla
    ? "none"
    : sla.resolution_breached || (slaResIn !== null && slaResIn < 0)
      ? "breached"
      : slaResIn !== null && slaResIn < 60
        ? "at_risk"
        : "ok";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/helpdesk" })}>
          <ArrowLeft className="h-4 w-4 " /> Back to queue
        </Button>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-lg truncate">{t.subject || "(no subject)"}</CardTitle>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge>{t.status}</Badge>
                  <Badge variant="outline">{t.priority}</Badge>
                  <Badge variant="outline" className="uppercase">
                    {t.channel}
                  </Badge>
                  {t.escalation_level && t.escalation_level > 0 ? (
                    <Badge variant="destructive">L{t.escalation_level} escalation</Badge>
                  ) : null}
                  {slaState === "breached" && (
                    <Badge variant="destructive">
                      <AlertTriangle className="h-3 w-3 " />
                      SLA breached
                    </Badge>
                  )}
                  {slaState === "at_risk" && (
                    <Badge className="bg-orange-500/15 text-orange-600 border-orange-300">
                      <Timer className="h-3 w-3 " />
                      SLA at risk
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => triage.mutate()}
                  disabled={triage.isPending}
                >
                  <Sparkles className="h-4 w-4 " /> AI Triage
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEscalateOpen(true)}>
                  <ChevronUp className="h-4 w-4 " /> Escalate
                </Button>
              </div>
            </div>
            {t.ai_summary ? (
              <div className="mt-3 p-3 rounded-control bg-primary/5 border-primary/20 border text-sm">
                <div className="flex items-center gap-1 text-xs font-medium text-primary mb-1">
                  <Bot className="h-3 w-3" /> AI Summary
                </div>
                {t.ai_summary}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
              {(
                data.messages as Array<{
                  id: string;
                  body: string | null;
                  direction: string;
                  is_internal: boolean;
                  created_at: string;
                  sent_by: string | null;
                }>
              ).map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-control border ${m.is_internal ? "bg-yellow-50 border-yellow-200" : m.direction === "outbound" ? "bg-primary/5 border-primary/20" : "bg-background"}`}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span>
                      {m.direction === "outbound"
                        ? m.sent_by
                          ? (agentMap.get(m.sent_by) ?? "Agent")
                          : "Agent"
                        : "Customer"}
                    </span>
                    {m.is_internal && (
                      <Badge variant="outline" className="text-[11px]">
                        Internal note
                      </Badge>
                    )}
                    <span className="ml-auto">
                      {fmtZoned(new Date(m.created_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Reply
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder={
                isInternal ? "Internal note — visible only to your team" : "Reply to the customer"
              }
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch id="internal" checked={isInternal} onCheckedChange={setIsInternal} />
                <Label htmlFor="internal" className="text-sm">
                  Internal note
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Select onValueChange={(v) => applyM.mutate(v)}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Apply macro..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(macros as Array<{ id: string; name: string }>).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => suggest.mutate()}
                  disabled={suggest.isPending}
                >
                  <Sparkles className="h-4 w-4 " /> AI Suggest
                </Button>
                <Button
                  size="sm"
                  onClick={() => reply.mutate()}
                  disabled={!body.trim() || reply.isPending}
                >
                  <Send className="h-4 w-4 " /> Send
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <CollaborationPanel ticketId={id} />
      </div>

      <div className="space-y-4">
        <AiHelpdeskPanel
          ticketId={id}
          onApplied={() => qc.invalidateQueries({ queryKey: ["helpdesk-ticket", id] })}
        />
        <TicketRelationshipsPanel ticketId={id} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Properties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={t.status} onValueChange={(v) => update.mutate({ status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="snoozed">Snoozed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={t.priority} onValueChange={(v) => update.mutate({ priority: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Assignee</Label>
              <Select
                value={t.assigned_to ?? ""}
                onValueChange={(v) => update.mutate({ assigned_to: v || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {(
                    agents as Array<{
                      user_id: string;
                      profiles?: { full_name?: string; email?: string } | null;
                    }>
                  ).map((a) => (
                    <SelectItem key={a.user_id} value={a.user_id}>
                      {a.profiles?.full_name || a.profiles?.email || "Agent"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select
                value={t.ticket_category_id ?? ""}
                onValueChange={(v) => update.mutate({ ticket_category_id: v || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {(cats as Array<{ id: string; name: string }>).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="h-4 w-4" /> SLA
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {!sla ? (
              <>
                <p className="text-muted-foreground text-xs">No SLA attached to this ticket yet.</p>
                <Button size="sm" onClick={() => attach.mutate()} disabled={attach.isPending}>
                  Attach default SLA
                </Button>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">First response due</span>
                  <span>
                    {sla.first_response_due_at
                      ? fmtZoned(new Date(sla.first_response_due_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Resolution due</span>
                  <span>
                    {sla.resolution_due_at
                      ? fmtZoned(new Date(sla.resolution_due_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </span>
                </div>
                {slaResIn !== null && (
                  <div
                    className={`text-xs ${slaResIn < 0 ? "text-red-600" : slaResIn < 60 ? "text-orange-600" : "text-muted-foreground"}`}
                  >
                    {slaResIn < 0
                      ? `Overdue by ${Math.abs(slaResIn)}m`
                      : `${slaResIn} min remaining`}
                  </div>
                )}
                <Button size="sm" variant="outline" onClick={() => pause.mutate(!sla.paused)}>
                  {sla.paused ? (
                    <>
                      <PlayCircle className="h-4 w-4 " />
                      Resume
                    </>
                  ) : (
                    <>
                      <PauseCircle className="h-4 w-4 " />
                      Pause
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Escalations</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {(
              data.escalations as Array<{
                id: string;
                level: number;
                reason: string | null;
                created_at: string;
              }>
            ).length === 0 ? (
              <p className="text-xs text-muted-foreground">No escalations.</p>
            ) : (
              (
                data.escalations as Array<{
                  id: string;
                  level: number;
                  reason: string | null;
                  created_at: string;
                }>
              ).map((e) => (
                <div key={e.id} className="border-l-2 border-red-300 pl-2 py-1">
                  <div className="text-xs font-medium">Level {e.level}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.reason} · {formatDistanceToNow(new Date(e.created_at))} ago
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={escalateOpen} onOpenChange={setEscalateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Why is this being escalated?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => escalate.mutate()}
              disabled={!reason.trim() || escalate.isPending}
            >
              Escalate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
