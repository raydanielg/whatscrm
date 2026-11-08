import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  listTicketTasks,
  createTicketTask,
  toggleTicketTask,
  listTicketLinks,
  linkTickets,
  unlinkTickets,
  listCrmLinks,
  addCrmLink,
  removeCrmLink,
  listMentionableAgents,
  listTicketActivity,
  suggestKbArticles,
  suggestNextActions,
} from "@/lib/helpdesk/collaboration.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Input } from "@/components/ui/input";
import {
  DateTimePicker,
  toLocalDateTimeString,
  fromLocalDateTimeString,
} from "@/shared/components";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Pin,
  PinOff,
  Trash2,
  AtSign,
  ListChecks,
  LinkIcon,
  Users,
  BookOpen,
  Sparkles,
  History,
  Plus,
  Lock,
  ChevronRight,
} from "lucide-react";

type Agent = {
  user_id: string;
  profiles: { full_name?: string; email?: string; avatar_url?: string } | null;
};
type Note = {
  id: string;
  body: string;
  author_id: string;
  mentions: string[] | null;
  is_pinned: boolean;
  pinned_at: string | null;
  created_at: string;
};
type Task = {
  id: string;
  parent_task_id: string | null;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  assigned_to: string | null;
  completed_at: string | null;
};
type Link = {
  id: string;
  ticket_id: string;
  linked_ticket_id: string;
  link_type: string;
  linked: { id: string; subject: string | null; status: string; ticket_number: number } | null;
};
type CrmLink = { id: string; entity_type: string; entity_id: string; label: string };
type Activity = {
  id: string;
  action: string;
  actor_id: string | null;
  from_value: string | null;
  to_value: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};
type KbHit = { id: string; title: string; slug: string; summary: string | null };
type NextAction = { label: string; kind: string };

export function CollaborationPanel({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const notesFn = useServerFn(listNotes);
  const createNoteFn = useServerFn(createNote);
  const updateNoteFn = useServerFn(updateNote);
  const deleteNoteFn = useServerFn(deleteNote);
  const tasksFn = useServerFn(listTicketTasks);
  const createTaskFn = useServerFn(createTicketTask);
  const toggleTaskFn = useServerFn(toggleTicketTask);
  const linksFn = useServerFn(listTicketLinks);
  const linkFn = useServerFn(linkTickets);
  const unlinkFn = useServerFn(unlinkTickets);
  const crmFn = useServerFn(listCrmLinks);
  const addCrmFn = useServerFn(addCrmLink);
  const rmCrmFn = useServerFn(removeCrmLink);
  const agentsFn = useServerFn(listMentionableAgents);
  const activityFn = useServerFn(listTicketActivity);
  const kbFn = useServerFn(suggestKbArticles);
  const nbaFn = useServerFn(suggestNextActions);

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["collab", ticketId] });
  };

  const { data: notes = [] } = useQuery({
    queryKey: ["collab", ticketId, "notes"],
    queryFn: () => notesFn({ data: { ticketId } }) as Promise<Note[]>,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["collab", ticketId, "tasks"],
    queryFn: () => tasksFn({ data: { ticketId } }) as Promise<Task[]>,
  });
  const { data: links = [] } = useQuery({
    queryKey: ["collab", ticketId, "links"],
    queryFn: () => linksFn({ data: { ticketId } }) as unknown as Promise<Link[]>,
  });
  const { data: crm = [] } = useQuery({
    queryKey: ["collab", ticketId, "crm"],
    queryFn: () => crmFn({ data: { ticketId } }) as Promise<CrmLink[]>,
  });
  const { data: agents = [] } = useQuery({
    queryKey: ["collab", "agents"],
    queryFn: () => agentsFn() as Promise<Agent[]>,
  });
  const { data: activity = [] } = useQuery({
    queryKey: ["collab", ticketId, "activity"],
    queryFn: () => activityFn({ data: { ticketId, limit: 100 } }) as Promise<Activity[]>,
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.user_id, a.profiles?.full_name || a.profiles?.email || "Agent");
    return m;
  }, [agents]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="h-4 w-4" /> Internal Collaboration
          <Badge variant="outline" className="ml-auto text-[11px]">
            Not visible to customer
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="notes">
          <TabsList className="flex-wrap  ">
            <TabsTrigger value="notes">
              <AtSign className="h-3.5 w-3.5 " />
              Notes
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <ListChecks className="h-3.5 w-3.5 " />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="links">
              <LinkIcon className="h-3.5 w-3.5 " />
              Links
            </TabsTrigger>
            <TabsTrigger value="crm">
              <Users className="h-3.5 w-3.5 " />
              CRM
            </TabsTrigger>
            <TabsTrigger value="kb">
              <BookOpen className="h-3.5 w-3.5 " />
              KB & AI
            </TabsTrigger>
            <TabsTrigger value="audit">
              <History className="h-3.5 w-3.5 " />
              Audit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notes" className="space-y-3 mt-3">
            <NoteComposer
              agents={agents}
              onSubmit={(body, isPinned) =>
                createNoteFn({ data: { ticketId, body, isPinned } }).then(() => {
                  inv();
                  toast.success("Note added");
                })
              }
            />
            <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
              {notes.length === 0 && (
                <p className="text-xs text-muted-foreground">No private notes yet.</p>
              )}
              {notes.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 rounded-control border text-sm ${n.is_pinned ? "bg-yellow-50 border-yellow-200" : "bg-muted/30"}`}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span className="font-medium">{agentMap.get(n.author_id) ?? "Agent"}</span>
                    {n.is_pinned && (
                      <Badge variant="outline" className="text-[11px]">
                        <Pin className="h-3 w-3 " />
                        Pinned
                      </Badge>
                    )}
                    <span className="ml-auto">
                      {formatDistanceToNow(new Date(n.created_at))} ago
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap">{renderMentions(n.body, agentMap)}</div>
                  <div className="flex gap-1 mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() =>
                        updateNoteFn({ data: { id: n.id, isPinned: !n.is_pinned } }).then(() =>
                          inv(),
                        )
                      }
                    >
                      {n.is_pinned ? (
                        <>
                          <PinOff className="h-3 w-3 " />
                          Unpin
                        </>
                      ) : (
                        <>
                          <Pin className="h-3 w-3 " />
                          Pin
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive"
                      onClick={() =>
                        deleteNoteFn({ data: { id: n.id } }).then(() => {
                          inv();
                          toast.success("Deleted");
                        })
                      }
                    >
                      <Trash2 className="h-3 w-3 " />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-3 mt-3">
            <TaskComposer
              agents={agents}
              onSubmit={(t) =>
                createTaskFn({ data: { ticketId, ...t } }).then(() => {
                  inv();
                  toast.success("Task created");
                })
              }
            />
            <div className="space-y-1">
              {tasks.filter((t) => !t.parent_task_id).length === 0 && (
                <p className="text-xs text-muted-foreground">No tasks yet.</p>
              )}
              {tasks
                .filter((t) => !t.parent_task_id)
                .map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    subtasks={tasks.filter((s) => s.parent_task_id === t.id)}
                    agentMap={agentMap}
                    agents={agents}
                    onToggle={(id, done) => toggleTaskFn({ data: { id, done } }).then(() => inv())}
                    onAddSub={(title) =>
                      createTaskFn({
                        data: { ticketId, title, parentTaskId: t.id, priority: "normal" },
                      }).then(() => inv())
                    }
                  />
                ))}
            </div>
          </TabsContent>

          <TabsContent value="links" className="space-y-3 mt-3">
            <LinkTicketRow
              ticketId={ticketId}
              onAdd={(id, type) =>
                linkFn({ data: { ticketId, linkedTicketId: id, linkType: type } }).then(() => {
                  inv();
                  toast.success("Linked");
                })
              }
            />
            <div className="space-y-2">
              {links.length === 0 && (
                <p className="text-xs text-muted-foreground">No linked tickets.</p>
              )}
              {links.map((l) => {
                const other = l.linked;
                return (
                  <div
                    key={l.id}
                    className="flex items-center gap-2 p-2 rounded-control border bg-muted/30 text-sm"
                  >
                    <Badge variant="outline" className="text-[11px]">
                      {l.link_type.replace("_", " ")}
                    </Badge>
                    <a
                      href={`/helpdesk/${other?.id}`}
                      className="text-primary hover:underline flex-1 truncate"
                    >
                      #{other?.ticket_number} {other?.subject || "(no subject)"}
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive"
                      onClick={() => unlinkFn({ data: { id: l.id } }).then(() => inv())}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="crm" className="space-y-3 mt-3">
            <CrmLinkForm
              onAdd={(entityType, entityId) =>
                addCrmFn({ data: { ticketId, entityType, entityId } }).then(() => {
                  inv();
                  toast.success("Linked");
                })
              }
            />
            <div className="space-y-2">
              {crm.length === 0 && (
                <p className="text-xs text-muted-foreground">No CRM records linked.</p>
              )}
              {crm.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 p-2 rounded-control border bg-muted/30 text-sm"
                >
                  <Badge variant="outline" className="text-[11px] capitalize">
                    {c.entity_type}
                  </Badge>
                  <span className="flex-1 truncate">{c.label}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive"
                    onClick={() => rmCrmFn({ data: { id: c.id } }).then(() => inv())}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="kb" className="space-y-3 mt-3">
            <AiSuggestions
              ticketId={ticketId}
              onKb={() => kbFn({ data: { ticketId } }) as Promise<KbHit[]>}
              onNba={() => nbaFn({ data: { ticketId } }) as Promise<{ actions: NextAction[] }>}
            />
          </TabsContent>

          <TabsContent value="audit" className="mt-3">
            <div className="space-y-2 max-h-[400px] overflow-auto pr-1">
              {activity.length === 0 && (
                <p className="text-xs text-muted-foreground">No activity yet.</p>
              )}
              {activity.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-2 text-xs border-l-2 border-muted pl-2 py-1"
                >
                  <div className="flex-1">
                    <div>
                      <span className="font-medium">
                        {a.actor_id ? (agentMap.get(a.actor_id) ?? "System") : "System"}
                      </span>{" "}
                      · {a.action.replace(/_/g, " ")}
                    </div>
                    {a.meta && Object.keys(a.meta).length > 0 && (
                      <div className="text-muted-foreground truncate">{JSON.stringify(a.meta)}</div>
                    )}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(a.created_at))} ago
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function renderMentions(body: string, agentMap: Map<string, string>) {
  const parts: React.ReactNode[] = [];
  const re = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(
      <span key={m.index} className="bg-primary/10 text-primary rounded px-1">
        @{agentMap.get(m[2]) ?? m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

function NoteComposer({
  agents,
  onSubmit,
}: {
  agents: Agent[];
  onSubmit: (body: string, pinned: boolean) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const insertMention = (a: Agent) => {
    const label = a.profiles?.full_name || a.profiles?.email || "Agent";
    setBody((b) => b + `@[${label}](${a.user_id}) `);
    setShowMentions(false);
  };
  return (
    <div className="space-y-2">
      <RichTextarea
        value={body}
        onChange={(v) => setBody(v)}
        rows={3}
        placeholder="Add a private note — visible only to your team. Type @ to mention."
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => setShowMentions((s) => !s)}>
          <AtSign className="h-3.5 w-3.5 " />
          Mention
        </Button>
        <label className="flex items-center gap-1 text-xs">
          <Checkbox checked={pinned} onCheckedChange={(v) => setPinned(!!v)} /> Pin
        </label>
        <Button
          size="sm"
          className="ml-auto"
          disabled={!body.trim()}
          onClick={() =>
            onSubmit(body, pinned).then(() => {
              setBody("");
              setPinned(false);
            })
          }
        >
          Add note
        </Button>
      </div>
      {showMentions && (
        <div className="border rounded-control p-2 bg-popover max-h-40 overflow-auto">
          {agents.map((a) => (
            <button
              key={a.user_id}
              className="block w-full text-left text-sm px-2 py-1 hover:bg-muted rounded"
              onClick={() => insertMention(a)}
            >
              {a.profiles?.full_name || a.profiles?.email || a.user_id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskComposer({
  agents,
  onSubmit,
}: {
  agents: Agent[];
  onSubmit: (t: {
    title: string;
    assignedTo?: string;
    priority: "low" | "normal" | "high" | "urgent";
    dueAt?: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [dueAt, setDueAt] = useState("");
  return (
    <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
      <div className="sm:col-span-2">
        <Label className="text-xs">Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
      </div>
      <div>
        <Label className="text-xs">Assignee</Label>
        <Select value={assignedTo} onValueChange={setAssignedTo}>
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.user_id} value={a.user_id}>
                {a.profiles?.full_name || a.profiles?.email || "Agent"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Priority</Label>
        <Select
          value={priority}
          onValueChange={(v) => setPriority(v as "low" | "normal" | "high" | "urgent")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Due</Label>
        <DateTimePicker
          value={fromLocalDateTimeString(dueAt)}
          onChange={(d) => setDueAt(toLocalDateTimeString(d))}
        />
      </div>
      <Button
        size="sm"
        disabled={!title.trim()}
        onClick={() =>
          onSubmit({
            title,
            priority,
            assignedTo: assignedTo || undefined,
            dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          }).then(() => {
            setTitle("");
            setAssignedTo("");
            setDueAt("");
          })
        }
      >
        <Plus className="h-4 w-4 " />
        Add
      </Button>
    </div>
  );
}

function TaskRow({
  task,
  subtasks,
  agentMap,
  agents,
  onToggle,
  onAddSub,
}: {
  task: Task;
  subtasks: Task[];
  agentMap: Map<string, string>;
  agents: Agent[];
  onToggle: (id: string, done: boolean) => void;
  onAddSub: (title: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState("");
  return (
    <div className="border rounded-control">
      <div className="flex items-center gap-2 p-2 text-sm">
        <Checkbox
          checked={task.status === "completed"}
          onCheckedChange={(v) => onToggle(task.id, !!v)}
        />
        <span
          className={`flex-1 ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}
        >
          {task.title}
        </span>
        <Badge variant="outline" className="text-[11px]">
          {task.priority}
        </Badge>
        {task.assigned_to && (
          <span className="text-xs text-muted-foreground">{agentMap.get(task.assigned_to)}</span>
        )}
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setOpen((o) => !o)}>
          <ChevronRight className={`h-3 w-3 transition ${open ? "rotate-90" : ""}`} />
        </Button>
      </div>
      {open && (
        <div className="border-t p-2 space-y-1 bg-muted/20">
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs pl-4">
              <Checkbox
                checked={s.status === "completed"}
                onCheckedChange={(v) => onToggle(s.id, !!v)}
              />
              <span
                className={s.status === "completed" ? "line-through text-muted-foreground" : ""}
              >
                {s.title}
              </span>
            </div>
          ))}
          <div className="flex gap-2 pl-4">
            <Input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              placeholder="Add subtask..."
              className="h-9 text-xs"
            />
            <Button
              size="sm"
              className="h-9"
              disabled={!sub.trim()}
              onClick={() => {
                onAddSub(sub).then(() => setSub(""));
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
      {/* silence unused prop warning */}
      <span className="hidden">{agents.length}</span>
    </div>
  );
}

function LinkTicketRow({
  ticketId,
  onAdd,
}: {
  ticketId: string;
  onAdd: (
    id: string,
    type: "related" | "duplicate" | "blocks" | "blocked_by" | "causes" | "caused_by",
  ) => Promise<void>;
}) {
  const [id, setId] = useState("");
  const [type, setType] = useState<
    "related" | "duplicate" | "blocks" | "blocked_by" | "causes" | "caused_by"
  >("related");
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <Label className="text-xs">Linked ticket ID</Label>
        <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="uuid" />
      </div>
      <div>
        <Label className="text-xs">Type</Label>
        <Select
          value={type}
          onValueChange={(v) =>
            setType(v as "related" | "duplicate" | "blocks" | "blocked_by" | "causes" | "caused_by")
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["related", "duplicate", "blocks", "blocked_by", "causes", "caused_by"].map((k) => (
              <SelectItem key={k} value={k}>
                {k.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        size="sm"
        disabled={!id.trim() || id === ticketId}
        onClick={() => onAdd(id.trim(), type).then(() => setId(""))}
      >
        Link
      </Button>
    </div>
  );
}

function CrmLinkForm({
  onAdd,
}: {
  onAdd: (
    entityType: "deal" | "company" | "contact" | "order" | "invoice" | "quote",
    entityId: string,
  ) => Promise<void>;
}) {
  const [entityType, setEntityType] = useState<
    "deal" | "company" | "contact" | "order" | "invoice" | "quote"
  >("deal");
  const [entityId, setEntityId] = useState("");
  return (
    <div className="flex gap-2 items-end">
      <div>
        <Label className="text-xs">Type</Label>
        <Select
          value={entityType}
          onValueChange={(v) =>
            setEntityType(v as "deal" | "company" | "contact" | "order" | "invoice" | "quote")
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["deal", "company", "contact", "order", "invoice", "quote"].map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1">
        <Label className="text-xs">Record ID</Label>
        <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="uuid" />
      </div>
      <Button
        size="sm"
        disabled={!entityId.trim()}
        onClick={() => onAdd(entityType, entityId.trim()).then(() => setEntityId(""))}
      >
        Link
      </Button>
    </div>
  );
}

function AiSuggestions({
  ticketId: _ticketId,
  onKb,
  onNba,
}: {
  ticketId: string;
  onKb: () => Promise<KbHit[]>;
  onNba: () => Promise<{ actions: NextAction[] }>;
}) {
  const [kb, setKb] = useState<KbHit[]>([]);
  const [nba, setNba] = useState<NextAction[]>([]);
  const kbM = useMutation({
    mutationFn: onKb,
    onSuccess: (r) => setKb(r),
    onError: (e: Error) => toast.error(e.message),
  });
  const nbaM = useMutation({
    mutationFn: onNba,
    onSuccess: (r) => setNba(r.actions),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => kbM.mutate()} disabled={kbM.isPending}>
          <BookOpen className="h-3.5 w-3.5 " />
          Suggest KB articles
        </Button>
        <Button size="sm" variant="outline" onClick={() => nbaM.mutate()} disabled={nbaM.isPending}>
          <Sparkles className="h-3.5 w-3.5 " />
          Next best actions
        </Button>
      </div>
      {kb.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Suggested KB Articles</div>
          {kb.map((a) => (
            <a
              key={a.id}
              href={`/knowledge-base/${a.slug}`}
              className="block p-2 rounded-control border hover:bg-muted/50 text-sm"
            >
              <div className="font-medium">{a.title}</div>
              {a.summary && (
                <div className="text-xs text-muted-foreground line-clamp-2">{a.summary}</div>
              )}
            </a>
          ))}
        </div>
      )}
      {nba.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">AI Recommendations</div>
          {nba.map((n, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-control border text-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="flex-1">{n.label}</span>
              <Badge variant="outline" className="text-[11px]">
                {n.kind}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
