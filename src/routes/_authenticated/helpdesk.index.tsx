import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTickets, listCategories, listAgents } from "@/lib/helpdesk/helpdesk.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, User2, Clock, Tag as TagIcon, ChevronRight, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/helpdesk/")({
  component: HelpdeskQueue,
});

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-500/10 text-red-600 border-red-200",
  high: "bg-orange-500/10 text-orange-600 border-orange-200",
  normal: "bg-blue-500/10 text-blue-600 border-blue-200",
  low: "bg-muted text-muted-foreground",
};

function HelpdeskQueue() {
  const [status, setStatus] = useState<string>("open");
  const [priority, setPriority] = useState<string>("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [search, setSearch] = useState("");
  const listFn = useServerFn(listTickets);
  const catsFn = useServerFn(listCategories);
  const agentsFn = useServerFn(listAgents);

  const filters = useMemo(() => ({
    status: status === "all" ? undefined : status,
    priority: priority === "all" ? undefined : priority,
    assignee: assignee === "all" ? undefined : assignee,
    search: search.trim() || undefined,
    limit: 100,
  }), [status, priority, assignee, search]);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["helpdesk-tickets", filters],
    queryFn: () => listFn({ data: filters }),
  });
  const { data: cats = [] } = useQuery({ queryKey: ["helpdesk-cats"], queryFn: () => catsFn() });
  const { data: agents = [] } = useQuery({ queryKey: ["helpdesk-agents"], queryFn: () => agentsFn() });

  const catMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null }>();
    for (const c of cats as Array<{ id: string; name: string; color: string | null }>) m.set(c.id, { name: c.name, color: c.color });
    return m;
  }, [cats]);
  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents as Array<{ user_id: string; profiles?: { full_name?: string; email?: string } | null }>) {
      m.set(a.user_id, a.profiles?.full_name || a.profiles?.email || "Agent");
    }
    return m;
  }, [agents]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets..." className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="snoozed">Snoozed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Assignee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading tickets</div>
      ) : (tickets as unknown[]).length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No tickets match these filters.</CardContent></Card>
      ) : (
        <Card>
          <div className="divide-y">
            {(tickets as Array<{
              id: string; subject: string | null; status: string; priority: string;
              assigned_to: string | null; ticket_category_id: string | null; escalation_level: number | null;
              first_response_at: string | null; resolved_at: string | null; last_message_at: string | null;
              created_at: string; last_message_preview: string | null; ai_summary: string | null; channel: string;
            }>).map((t) => {
              const cat = t.ticket_category_id ? catMap.get(t.ticket_category_id) : null;
              return (
                <Link key={t.id} to="/helpdesk/$id" params={{ id: t.id }}
                  className="flex items-start gap-3 p-4 hover:bg-muted transition-colors">
                  <div className="mt-1"><AlertCircle className={`h-4 w-4 ${t.priority === "urgent" ? "text-red-500" : "text-muted-foreground"}`} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{t.subject || "(no subject)"}</div>
                      <Badge variant="outline" className={`text-xs ${PRIORITY_COLOR[t.priority] ?? ""}`}>{t.priority}</Badge>
                      <Badge variant="secondary" className="text-xs">{t.status}</Badge>
                      {t.escalation_level && t.escalation_level > 0 ? (
                        <Badge variant="destructive" className="text-xs">Escalated · L{t.escalation_level}</Badge>
                      ) : null}
                      {cat ? <Badge variant="outline" className="text-xs" style={{ borderColor: cat.color ?? undefined }}><TagIcon className="h-3 w-3 " />{cat.name}</Badge> : null}
                      <Badge variant="outline" className="text-xs uppercase">{t.channel}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground truncate mt-1">{t.last_message_preview || t.ai_summary || "—"}</div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User2 className="h-3 w-3" /> {t.assigned_to ? agentMap.get(t.assigned_to) ?? "Assigned" : "Unassigned"}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDistanceToNow(new Date(t.last_message_at || t.created_at))} ago</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground mt-2" />
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
