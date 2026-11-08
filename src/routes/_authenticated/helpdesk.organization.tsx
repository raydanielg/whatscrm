import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  listQueues,
  upsertQueue,
  deleteQueue,
  listAgentSkills,
  upsertAgentSkill,
  listQueueTickets,
  listWorkspaceMembers,
  listMyMentions,
  markMentionRead,
  listTeamInboxes,
} from "@/lib/helpdesk/organization.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Trash2,
  Plus,
  Users,
  Inbox as InboxIcon,
  AtSign,
  Shuffle,
  Star,
  Languages,
  Wrench,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/helpdesk/organization")({
  head: () => ({ meta: [{ title: "Support Organization" }] }),
  component: OrganizationPage,
});

const STRATEGIES = [
  { value: "round_robin", label: "Round Robin", icon: Shuffle },
  { value: "least_busy", label: "Least Busy", icon: ListChecks },
  { value: "skill", label: "Skill-Based", icon: Wrench },
  { value: "vip", label: "VIP", icon: Star },
  { value: "language", label: "Language", icon: Languages },
  { value: "manual", label: "Manual", icon: Users },
];

function OrganizationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Support Organization</h1>
        <p className="text-sm text-muted-foreground">
          Queues, routing rules, team skills, watchers, mentions & team inboxes.
        </p>
      </div>
      <Tabs defaultValue="queues">
        <TabsList>
          <TabsTrigger value="queues">Queues</TabsTrigger>
          <TabsTrigger value="skills">Agent Skills</TabsTrigger>
          <TabsTrigger value="inbox">Team Inbox</TabsTrigger>
          <TabsTrigger value="mentions">My Mentions</TabsTrigger>
        </TabsList>
        <TabsContent value="queues">
          <QueuesTab />
        </TabsContent>
        <TabsContent value="skills">
          <SkillsTab />
        </TabsContent>
        <TabsContent value="inbox">
          <TeamInboxTab />
        </TabsContent>
        <TabsContent value="mentions">
          <MentionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------- QUEUES --------------------------- */
function QueuesTab() {
  const list = useServerFn(listQueues);
  const qc = useQueryClient();
  const { data: queues = [] } = useQuery({ queryKey: ["support-queues"], queryFn: () => list() });

  useEffect(() => {
    const ch = supabase
      .channel("support_queues_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_queues" }, () =>
        qc.invalidateQueries({ queryKey: ["support-queues"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets" }, () =>
        qc.invalidateQueries({ queryKey: ["queue-tickets"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <QueueDialog />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {queues.map((q: any) => (
          <QueueCard key={q.id} queue={q} />
        ))}
        {queues.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-12 border rounded-control">
            No queues yet. Create your first routing queue.
          </div>
        )}
      </div>
    </div>
  );
}

function QueueCard({ queue }: { queue: any }) {
  const listTickets = useServerFn(listQueueTickets);
  const del = useServerFn(deleteQueue);
  const qc = useQueryClient();
  const { data: tickets = [] } = useQuery({
    queryKey: ["queue-tickets", queue.id],
    queryFn: () => listTickets({ data: { queue_id: queue.id } }),
  });
  const waiting = tickets.filter((t: any) => t.status === "waiting").length;
  const assigned = tickets.filter((t: any) => t.status === "assigned").length;
  const Strategy = STRATEGIES.find((s) => s.value === queue.strategy);

  const removeMut = useMutation({
    mutationFn: () => del({ data: { id: queue.id } }),
    onSuccess: () => {
      toast.success("Queue deleted");
      qc.invalidateQueries({ queryKey: ["support-queues"] });
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex items-start gap-3">
          <div
            className="h-9 w-9 rounded-control flex items-center justify-center"
            style={{ background: queue.color ?? "#075E54", color: "white" }}
          >
            {Strategy?.icon ? (
              <Strategy.icon className="h-4 w-4" />
            ) : (
              <InboxIcon className="h-4 w-4" />
            )}
          </div>
          <div>
            <CardTitle className="text-base">{queue.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{Strategy?.label}</Badge>
              {queue.vip_only && <Badge className="bg-amber-500">VIP</Badge>}
              {!queue.is_active && <Badge variant="outline">Inactive</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <QueueDialog queue={queue} />
          <Button size="icon" variant="ghost" onClick={() => removeMut.mutate()}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        {queue.description && <p className="text-muted-foreground mb-3">{queue.description}</p>}
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-control border p-3">
            <div className="text-2xl font-semibold">{waiting}</div>
            <div className="text-xs text-muted-foreground">Waiting</div>
          </div>
          <div className="rounded-control border p-3">
            <div className="text-2xl font-semibold">{assigned}</div>
            <div className="text-xs text-muted-foreground">Assigned</div>
          </div>
        </div>
        {queue.required_skills?.length || queue.required_languages?.length ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {(queue.required_skills ?? []).map((s: string) => (
              <Badge key={s} variant="outline">
                <Wrench className="h-3 w-3 " />
                {s}
              </Badge>
            ))}
            {(queue.required_languages ?? []).map((l: string) => (
              <Badge key={l} variant="outline">
                <Languages className="h-3 w-3 " />
                {l}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function QueueDialog({ queue }: { queue?: any }) {
  const upsert = useServerFn(upsertQueue);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(
    queue ?? {
      name: "",
      description: "",
      color: "#075E54",
      strategy: "round_robin",
      required_skills: [],
      required_languages: [],
      vip_only: false,
      is_active: true,
      priority: 0,
      max_open_per_agent: 10,
    },
  );

  const save = useMutation({
    mutationFn: () => upsert({ data: form }),
    onSuccess: () => {
      toast.success(queue ? "Queue updated" : "Queue created");
      qc.invalidateQueries({ queryKey: ["support-queues"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={queue ? "icon" : "default"} variant={queue ? "ghost" : "default"}>
          {queue ? (
            <Wrench className="h-4 w-4" />
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" /> New Queue
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{queue ? "Edit Queue" : "New Queue"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Routing Strategy</Label>
              <Select
                value={form.strategy}
                onValueChange={(v) => setForm({ ...form, strategy: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Color</Label>
              <Input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Required Skills (comma-separated)</Label>
            <Input
              value={(form.required_skills ?? []).join(", ")}
              onChange={(e) =>
                setForm({
                  ...form,
                  required_skills: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div>
            <Label>Languages (comma-separated, e.g. en, es, no)</Label>
            <Input
              value={(form.required_languages ?? []).join(", ")}
              onChange={(e) =>
                setForm({
                  ...form,
                  required_languages: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>VIP only</Label>
            <Switch
              checked={!!form.vip_only}
              onCheckedChange={(v) => setForm({ ...form, vip_only: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch
              checked={form.is_active !== false}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- SKILLS --------------------------- */
function SkillsTab() {
  const list = useServerFn(listAgentSkills);
  const members = useServerFn(listWorkspaceMembers);
  const upsert = useServerFn(upsertAgentSkill);
  const qc = useQueryClient();

  const { data: skills = [] } = useQuery({ queryKey: ["agent-skills"], queryFn: () => list() });
  const { data: memberList = [] } = useQuery({
    queryKey: ["ws-members"],
    queryFn: () => members(),
  });

  const save = useMutation({
    mutationFn: (data: any) => upsert({ data }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });

  const byUser = new Map(skills.map((s: any) => [s.user_id, s]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Agent Skills, Languages & VIP</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {memberList.map((m: any) => {
          const row: any = byUser.get(m.user_id) ?? {
            user_id: m.user_id,
            skills: [],
            languages: [],
            handles_vip: false,
            is_available: true,
          };
          return (
            <div
              key={m.user_id}
              className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center border rounded-control p-3"
            >
              <div className="md:col-span-2 flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-muted grid place-items-center text-xs">
                  {(m.profile?.display_name ?? m.profile?.email ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium">
                    {m.profile?.display_name ?? m.profile?.email}
                  </div>
                  <div className="text-xs text-muted-foreground">{m.role}</div>
                </div>
              </div>
              <Input
                placeholder="skills"
                defaultValue={(row.skills ?? []).join(", ")}
                onBlur={(e) =>
                  save.mutate({
                    ...row,
                    skills: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
              <Input
                placeholder="languages"
                defaultValue={(row.languages ?? []).join(", ")}
                onBlur={(e) =>
                  save.mutate({
                    ...row,
                    languages: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={!!row.handles_vip}
                  onCheckedChange={(v) => save.mutate({ ...row, handles_vip: v })}
                />{" "}
                VIP
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={row.is_available !== false}
                  onCheckedChange={(v) => save.mutate({ ...row, is_available: v })}
                />{" "}
                Available
              </label>
            </div>
          );
        })}
        {memberList.length === 0 && (
          <div className="text-sm text-muted-foreground">No workspace members.</div>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------- TEAM INBOX --------------------------- */
function TeamInboxTab() {
  const list = useServerFn(listTeamInboxes);
  const { data: inboxes = [] } = useQuery({ queryKey: ["team-inboxes"], queryFn: () => list() });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {inboxes.map((ib: any) => (
        <Card key={ib.id}>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div
              className="h-9 w-9 rounded-control grid place-items-center"
              style={{ background: ib.color ?? "#075E54", color: "white" }}
            >
              <InboxIcon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{ib.name}</CardTitle>
              <div className="text-xs text-muted-foreground">
                {ib.channel} · {ib.auto_assignment_strategy ?? "manual"}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground mb-2">
              Team ({(ib.members ?? []).length})
            </div>
            <div className="flex flex-wrap gap-2">
              {(ib.members ?? []).map((m: any) => (
                <Badge key={m.user_id} variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  {m.profile?.display_name ?? "Member"} · {m.role}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      {inboxes.length === 0 && (
        <div className="col-span-full text-sm text-muted-foreground text-center py-12 border rounded-control">
          No team inboxes yet.
        </div>
      )}
    </div>
  );
}

/* --------------------------- MENTIONS --------------------------- */
function MentionsTab() {
  const fmtZoned = useZonedDateFormatter();
  const list = useServerFn(listMyMentions);
  const markRead = useServerFn(markMentionRead);
  const qc = useQueryClient();
  const { data: mentions = [] } = useQuery({ queryKey: ["my-mentions"], queryFn: () => list() });

  useEffect(() => {
    const ch = supabase
      .channel("mentions_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_mentions" }, () =>
        qc.invalidateQueries({ queryKey: ["my-mentions"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AtSign className="h-4 w-4" /> My Mentions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {mentions.map((m: any) => (
          <div
            key={m.id}
            className={`border rounded-control p-3 flex items-start justify-between gap-3 ${m.read_at ? "opacity-60" : ""}`}
          >
            <div>
              <div className="text-sm">
                {m.ticket?.ticket_number && (
                  <span className="font-mono text-xs mr-2">#{m.ticket.ticket_number}</span>
                )}
                <span className="font-medium">{m.ticket?.subject ?? "Ticket"}</span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">{m.content}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {fmtZoned(new Date(m.created_at), { dateStyle: "medium", timeStyle: "short" })}
              </div>
            </div>
            {!m.read_at && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await markRead({ data: { id: m.id } });
                  qc.invalidateQueries({ queryKey: ["my-mentions"] });
                }}
              >
                Mark read
              </Button>
            )}
          </div>
        ))}
        {mentions.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            You have no mentions.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
