import { createFileRoute, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listVisitors,
  listRoutingRules,
  upsertRoutingRule,
  deleteRoutingRule,
} from "@/lib/livechat/livechat.functions";
import {
  listAgentPresence,
  setMyPresence,
  listQueue,
  claimFromQueue,
  previewRouting,
} from "@/lib/livechat/routing.functions";
import {
  Users,
  Route as RouteIcon,
  Plus,
  Trash2,
  Loader2,
  Globe,
  Headphones,
  ListOrdered,
  Sparkles,
  Crown,
  CircleDot,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState } from "react";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/livechat/")({
  head: () => ({
    meta: [
      { title: "Live Chat" },
      {
        name: "description",
        content: "Visitors, intelligent routing, agent presence and the live-chat queue.",
      },
    ],
  }),
  component: LiveChatPage,
});

interface RuleRow {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  route_to: string;
  strategy: string;
  match_pages: string[];
  match_keywords: string[];
  match_country: string[];
  match_language: string[];
  match_business_hours: boolean | null;
  match_vip: boolean | null;
  match_priority: string[];
  required_skills: string[];
  department_id: string | null;
  agent_id: string | null;
  auto_message: string | null;
}

interface VisitorRow {
  id: string;
  visitor_key: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  last_seen_at: string;
  visits_count: number;
  page_views: number;
  contact_id?: string | null;
  utm_source?: string | null;
}

function LiveChatPage() {
  const ws = useCurrentWorkspace();
  const workspaceId = ws.data?.id;

  return (
    <div>
      <AppTopbar title="Live Chat" subtitle="Widget, visitors, routing & queue" />
      <div className="p-6 max-w-7xl mx-auto w-full">
        <Tabs defaultValue="visitors">
          <TabsList>
            <TabsTrigger value="visitors">
              <Users className="mr-2 h-4 w-4" />
              Visitors
            </TabsTrigger>
            <TabsTrigger value="agents">
              <Headphones className="mr-2 h-4 w-4" />
              Agents
            </TabsTrigger>
            <TabsTrigger value="queue">
              <ListOrdered className="mr-2 h-4 w-4" />
              Queue
            </TabsTrigger>
            <TabsTrigger value="routing">
              <RouteIcon className="mr-2 h-4 w-4" />
              Routing Rules
            </TabsTrigger>
            <TabsTrigger value="simulator">
              <Sparkles className="mr-2 h-4 w-4" />
              Simulator
            </TabsTrigger>
          </TabsList>
          <TabsContent value="visitors" className="mt-4">
            {workspaceId ? <VisitorsTab workspaceId={workspaceId} /> : <Loader />}
          </TabsContent>
          <TabsContent value="agents" className="mt-4">
            {workspaceId ? <AgentsTab workspaceId={workspaceId} /> : <Loader />}
          </TabsContent>
          <TabsContent value="queue" className="mt-4">
            {workspaceId ? <QueueTab workspaceId={workspaceId} /> : <Loader />}
          </TabsContent>
          <TabsContent value="routing" className="mt-4">
            {workspaceId ? <RulesTab workspaceId={workspaceId} /> : <Loader />}
          </TabsContent>
          <TabsContent value="simulator" className="mt-4">
            {workspaceId ? <SimulatorTab workspaceId={workspaceId} /> : <Loader />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function VisitorsTab({ workspaceId }: { workspaceId: string }) {
  const q = useQuery({
    queryKey: ["livechat-visitors", workspaceId],
    queryFn: () => listVisitors({ data: { workspaceId } }),
    refetchInterval: 15_000,
  });
  const rows = (q.data ?? []) as VisitorRow[];
  if (q.isLoading) return <Loader />;
  if (!rows.length) {
    return (
      <div className="rounded-control border border-border p-12 text-center">
        <Globe className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-medium">No visitors yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Install the widget on your site and visitors will show up here in real time.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-control border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Visitor</th>
            <th className="px-4 py-2">Contact</th>
            <th className="px-4 py-2">Location</th>
            <th className="px-4 py-2">Device</th>
            <th className="px-4 py-2">Source</th>
            <th className="px-4 py-2">Visits</th>
            <th className="px-4 py-2">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const returning = v.visits_count > 1;
            return (
              <tr key={v.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">
                  <Link
                    to="/livechat/visitors/$visitorId"
                    params={{ visitorId: v.id }}
                    className="hover:underline"
                  >
                    {v.display_name ?? `Visitor ${v.visitor_key.slice(0, 6)}`}
                  </Link>
                  {returning && (
                    <Badge variant="secondary" className="ml-2">
                      Returning
                    </Badge>
                  )}
                  {v.contact_id && <Badge className="ml-2">Known</Badge>}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{v.email ?? v.phone ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {[v.city, v.country].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {[v.browser, v.device].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {(v as VisitorRow & { utm_source?: string | null }).utm_source ?? "—"}
                </td>
                <td className="px-4 py-2">{v.visits_count}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {formatDistanceToNow(new Date(v.last_seen_at), { addSuffix: true })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface AgentRow {
  user_id: string;
  presence: "online" | "away" | "busy" | "offline" | string;
  status_message: string | null;
  skills: string[];
  languages: string[];
  departments: string[];
  max_concurrent: number;
  current_load: number;
  last_active_at: string | null;
  last_assigned_at: string | null;
  display_name: string;
  avatar_url: string | null;
}

const PRESENCE_STYLES: Record<string, string> = {
  online: "bg-emerald-500",
  away: "bg-amber-500",
  busy: "bg-destructive",
  offline: "bg-muted-foreground/40",
};

function AgentsTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["livechat-agents", workspaceId],
    queryFn: () => listAgentPresence({ data: { workspaceId } }),
    refetchInterval: 10_000,
  });
  const agents = (q.data ?? []) as AgentRow[];

  const setPresence = useMutation({
    mutationFn: (presence: "online" | "away" | "busy" | "offline") =>
      setMyPresence({ data: { workspaceId, presence } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["livechat-agents", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Loader />;

  const total = agents.length;
  const online = agents.filter((a) => a.presence === "online").length;
  const busy = agents.filter((a) => a.presence === "busy").length;
  const away = agents.filter((a) => a.presence === "away").length;
  const totalLoad = agents.reduce((s, a) => s + (a.current_load ?? 0), 0);
  const capacity = agents.reduce((s, a) => s + (a.max_concurrent ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Agents" value={String(total)} />
        <StatCard label="Online" value={String(online)} tone="success" />
        <StatCard label="Busy / Away" value={`${busy} / ${away}`} />
        <StatCard label="Load" value={`${totalLoad} / ${capacity || "∞"}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-control border border-border p-3">
        <span className="text-sm font-medium">My status</span>
        {(["online", "away", "busy", "offline"] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant="outline"
            onClick={() => setPresence.mutate(p)}
            className="capitalize"
          >
            <span className={`mr-2 h-2 w-2 rounded-full ${PRESENCE_STYLES[p]}`} />
            {p}
          </Button>
        ))}
      </div>

      <div className="overflow-hidden rounded-control border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Agent</th>
              <th className="px-4 py-2">Presence</th>
              <th className="px-4 py-2">Load</th>
              <th className="px-4 py-2">Skills</th>
              <th className="px-4 py-2">Languages</th>
              <th className="px-4 py-2">Last active</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.user_id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{a.display_name}</td>
                <td className="px-4 py-2 capitalize">
                  <span
                    className={`mr-2 inline-block h-2 w-2 rounded-full ${PRESENCE_STYLES[a.presence] ?? PRESENCE_STYLES.offline}`}
                  />
                  {a.presence}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">
                      {a.current_load}/{a.max_concurrent || "∞"}
                    </span>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${Math.min(100, (a.current_load / Math.max(1, a.max_concurrent)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(a.skills ?? []).slice(0, 4).map((s) => (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                    {a.skills?.includes("vip") && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {a.languages?.join(", ") || "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {a.last_active_at
                    ? formatDistanceToNow(new Date(a.last_active_at), { addSuffix: true })
                    : "—"}
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  No agents yet. Set your status above to appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warn";
}) {
  return (
    <div className="rounded-control border border-border p-3">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${tone === "success" ? "text-emerald-600" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

interface QueueRow {
  id: string;
  conversation_id: string;
  target_department_id: string | null;
  priority: string;
  required_skills: string[];
  reason: string | null;
  status: string;
  entered_at: string;
  assigned_to: string | null;
}

function QueueTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["livechat-queue", workspaceId],
    queryFn: () => listQueue({ data: { workspaceId } }),
    refetchInterval: 5_000,
  });
  const rows = (q.data ?? []) as QueueRow[];

  const claim = useMutation({
    mutationFn: (queueId: string) => claimFromQueue({ data: { workspaceId, queueId } }),
    onSuccess: () => {
      toast.success("Conversation claimed");
      qc.invalidateQueries({ queryKey: ["livechat-queue", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Loader />;
  if (!rows.length) {
    return (
      <div className="rounded-control border border-border p-8 text-center text-sm text-muted-foreground">
        The queue is empty. New handoffs will appear here in real time.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-control border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">#</th>
            <th className="px-4 py-2">Priority</th>
            <th className="px-4 py-2">Skills</th>
            <th className="px-4 py-2">Reason</th>
            <th className="px-4 py-2">Waiting</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-4 py-2 font-mono text-xs">{idx + 1}</td>
              <td className="px-4 py-2 capitalize">
                <PriorityBadge value={r.priority} />
              </td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap gap-1">
                  {(r.required_skills ?? []).map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              </td>
              <td className="px-4 py-2 text-muted-foreground">{r.reason ?? "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">
                <Timer className="mr-1 inline h-3 w-3" />
                {formatDistanceToNow(new Date(r.entered_at), { addSuffix: false })}
              </td>
              <td className="px-4 py-2">
                <Badge variant={r.status === "waiting" ? "outline" : "default"}>{r.status}</Badge>
              </td>
              <td className="px-4 py-2 text-right">
                {r.status === "waiting" && (
                  <Button size="sm" onClick={() => claim.mutate(r.id)} disabled={claim.isPending}>
                    Claim
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriorityBadge({ value }: { value: string }) {
  const styles: Record<string, string> = {
    urgent: "border-destructive text-destructive",
    high: "border-orange-500 text-orange-600",
    normal: "border-border text-muted-foreground",
    low: "border-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex rounded-control border px-2 py-0.5 text-[11px] capitalize ${styles[value] ?? styles.normal}`}
    >
      {value}
    </span>
  );
}

function RulesTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["livechat-rules", workspaceId],
    queryFn: () => listRoutingRules({ data: { workspaceId } }),
  });
  const rules = (q.data ?? []) as RuleRow[];

  const create = useMutation({
    mutationFn: () =>
      upsertRoutingRule({
        data: {
          workspaceId,
          name: "New rule",
          priority: 100,
          enabled: true,
          matchPages: [],
          matchKeywords: [],
          matchCountry: [],
          matchLanguage: [],
          matchBusinessHours: null,
          matchVip: null,
          matchPriority: [],
          requiredSkills: [],
          strategy: "auto",
          customConditions: {},
          routeTo: "ai",
        },
      }),
    onSuccess: () => {
      toast.success("Rule created");
      qc.invalidateQueries({ queryKey: ["livechat-rules", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteRoutingRule({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["livechat-rules", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Rules run in ascending priority order. First match wins; otherwise AI handles the chat.
        </p>
        <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="mr-2 h-4 w-4" />
          New rule
        </Button>
      </div>
      {q.isLoading ? (
        <Loader />
      ) : rules.length === 0 ? (
        <div className="rounded-control border border-border p-8 text-center text-sm text-muted-foreground">
          No routing rules yet. All widget conversations route to AI by default.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              workspaceId={workspaceId}
              onDelete={() => remove.mutate(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function joinList(v: string[]): string {
  return v.join(", ");
}
function splitList(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function RuleCard({
  rule,
  workspaceId,
  onDelete,
}: {
  rule: RuleRow;
  workspaceId: string;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [local, setLocal] = useState({
    name: rule.name,
    priority: rule.priority,
    enabled: rule.enabled,
    routeTo: rule.route_to as "ai" | "department" | "agent" | "queue",
    strategy: (rule.strategy ?? "auto") as
      "auto" | "round_robin" | "least_busy" | "department" | "skill",
    pages: joinList(rule.match_pages ?? []),
    keywords: joinList(rule.match_keywords ?? []),
    country: joinList(rule.match_country ?? []),
    language: joinList(rule.match_language ?? []),
    priorityMatch: joinList(rule.match_priority ?? []),
    skills: joinList(rule.required_skills ?? []),
    hours: rule.match_business_hours,
    vip: rule.match_vip,
    autoMessage: rule.auto_message ?? "",
  });

  const save = useMutation({
    mutationFn: () =>
      upsertRoutingRule({
        data: {
          id: rule.id,
          workspaceId,
          name: local.name,
          priority: Number(local.priority) || 100,
          enabled: local.enabled,
          routeTo: local.routeTo,
          strategy: local.strategy,
          matchPages: splitList(local.pages),
          matchKeywords: splitList(local.keywords),
          matchCountry: splitList(local.country).map((x) => x.toUpperCase()),
          matchLanguage: splitList(local.language).map((x) => x.toLowerCase()),
          matchPriority: splitList(local.priorityMatch)
            .filter((x) => ["low", "normal", "high", "urgent"].includes(x.toLowerCase()))
            .map((x) => x.toLowerCase()) as ("low" | "normal" | "high" | "urgent")[],
          requiredSkills: splitList(local.skills),
          matchBusinessHours: local.hours,
          matchVip: local.vip,
          customConditions: {},
          autoMessage: local.autoMessage || null,
        },
      }),
    onSuccess: () => {
      toast.success("Rule saved");
      qc.invalidateQueries({ queryKey: ["livechat-rules", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-control border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Input
            className="w-56 font-medium"
            value={local.name}
            onChange={(e) => setLocal({ ...local, name: e.target.value })}
          />
          <Badge variant="outline">{rule.route_to}</Badge>
          <Badge variant="secondary">{rule.strategy}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={local.enabled}
            onCheckedChange={(v) => setLocal({ ...local, enabled: v })}
          />
          <span className="text-xs text-muted-foreground">Enabled</span>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <FieldNum
          label="Priority"
          value={local.priority}
          onChange={(v) => setLocal({ ...local, priority: v })}
        />
        <FieldSelect
          label="Route to"
          value={local.routeTo}
          onChange={(v) => setLocal({ ...local, routeTo: v as typeof local.routeTo })}
          options={[
            { v: "ai", l: "AI" },
            { v: "department", l: "Department" },
            { v: "agent", l: "Agent" },
            { v: "queue", l: "Queue" },
          ]}
        />
        <FieldSelect
          label="Strategy"
          value={local.strategy}
          onChange={(v) => setLocal({ ...local, strategy: v as typeof local.strategy })}
          options={[
            { v: "auto", l: "Auto (skill → least busy)" },
            { v: "round_robin", l: "Round Robin" },
            { v: "least_busy", l: "Least Busy Agent" },
            { v: "department", l: "Department Only" },
            { v: "skill", l: "Agent Skills" },
          ]}
        />
        <FieldTri
          label="Business hours"
          value={local.hours}
          onChange={(v) => setLocal({ ...local, hours: v })}
          labels={["Any", "Open only", "Closed only"]}
        />

        <FieldText
          label="Pages (substrings)"
          value={local.pages}
          onChange={(v) => setLocal({ ...local, pages: v })}
          placeholder="/pricing, /checkout"
        />
        <FieldText
          label="Keywords"
          value={local.keywords}
          onChange={(v) => setLocal({ ...local, keywords: v })}
          placeholder="refund, cancel, human"
        />
        <FieldText
          label="Countries (ISO)"
          value={local.country}
          onChange={(v) => setLocal({ ...local, country: v })}
          placeholder="US, GB"
        />
        <FieldText
          label="Languages"
          value={local.language}
          onChange={(v) => setLocal({ ...local, language: v })}
          placeholder="en, es, fr"
        />

        <FieldText
          label="Required skills"
          value={local.skills}
          onChange={(v) => setLocal({ ...local, skills: v })}
          placeholder="billing, tier2, vip"
        />
        <FieldText
          label="Customer priority"
          value={local.priorityMatch}
          onChange={(v) => setLocal({ ...local, priorityMatch: v })}
          placeholder="high, urgent"
        />
        <FieldTri
          label="VIP visitors"
          value={local.vip}
          onChange={(v) => setLocal({ ...local, vip: v })}
          labels={["Any", "VIP only", "Non-VIP only"]}
        />
        <div className="md:col-span-1">
          <Label className="text-xs">Auto-message</Label>
          <Textarea
            rows={2}
            value={local.autoMessage}
            onChange={(e) => setLocal({ ...local, autoMessage: e.target.value })}
            placeholder="You're being connected to a specialist"
          />
        </div>
      </div>
    </div>
  );
}

function FieldNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
function FieldText({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function FieldSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        className="h-9 w-full rounded-control border border-input bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </div>
  );
}
function FieldTri({
  label,
  value,
  onChange,
  labels,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  labels: [string, string, string];
}) {
  const current = value === null ? "any" : value ? "yes" : "no";
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        className="h-9 w-full rounded-control border border-input bg-background px-2 text-sm"
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "any" ? null : v === "yes");
        }}
      >
        <option value="any">{labels[0]}</option>
        <option value="yes">{labels[1]}</option>
        <option value="no">{labels[2]}</option>
      </select>
    </div>
  );
}

// --- Simulator ---------------------------------------------------------------

function SimulatorTab({ workspaceId }: { workspaceId: string }) {
  const fmtZoned = useZonedDateFormatter();
  const [form, setForm] = useState({
    page: "/pricing",
    message: "I want a refund",
    country: "US",
    language: "en",
    isVip: false,
    priority: "normal" as "low" | "normal" | "high" | "urgent",
  });
  const preview = useMutation({
    mutationFn: () => previewRouting({ data: { workspaceId, ...form } }),
    onSuccess: () => toast.success("Routing simulated"),
    onError: (e: Error) => toast.error(e.message),
  });
  const d = preview.data;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-3 rounded-control border border-border p-4">
        <FieldText label="Page" value={form.page} onChange={(v) => setForm({ ...form, page: v })} />
        <div>
          <Label className="text-xs">First message</Label>
          <Textarea
            rows={3}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldText
            label="Country"
            value={form.country}
            onChange={(v) => setForm({ ...form, country: v })}
          />
          <FieldText
            label="Language"
            value={form.language}
            onChange={(v) => setForm({ ...form, language: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldSelect
            label="Customer priority"
            value={form.priority}
            onChange={(v) => setForm({ ...form, priority: v as typeof form.priority })}
            options={[
              { v: "low", l: "Low" },
              { v: "normal", l: "Normal" },
              { v: "high", l: "High" },
              { v: "urgent", l: "Urgent" },
            ]}
          />
          <div className="flex items-end gap-2">
            <Switch checked={form.isVip} onCheckedChange={(v) => setForm({ ...form, isVip: v })} />
            <span className="text-sm">VIP visitor</span>
          </div>
        </div>
        <Button onClick={() => preview.mutate()} disabled={preview.isPending} className="w-full">
          <Sparkles className="mr-2 h-4 w-4" />
          {preview.isPending ? "Simulating" : "Simulate routing"}
        </Button>
      </div>

      <div className="rounded-control border border-border p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
          <CircleDot className="h-4 w-4 text-primary" /> Decision
        </h3>
        {preview.isPending && <Loader />}
        {preview.isError && !preview.isPending && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              {(preview.error as Error)?.message || "Simulation failed."}
            </p>
            <Button size="sm" variant="outline" onClick={() => preview.mutate()}>
              Retry
            </Button>
          </div>
        )}
        {d && !preview.isPending && (
          <dl className="space-y-2 text-sm">
            <Row k="Route" v={<Badge>{d.route_to}</Badge>} />
            <Row k="Strategy" v={<Badge variant="secondary">{d.strategy}</Badge>} />
            <Row
              k="Rule"
              v={
                d.ruleId ? (
                  <span title={d.ruleId}>{d.ruleName ?? "Unnamed rule"}</span>
                ) : (
                  <span className="text-muted-foreground">— none (default) —</span>
                )
              }
            />
            <Row
              k="Agent"
              v={
                d.agentId ? (
                  <span title={d.agentId}>{d.agentName ?? "Agent"}</span>
                ) : (
                  <span className="text-muted-foreground">n/a</span>
                )
              }
            />
            <Row
              k="Department"
              v={
                d.departmentId ? (
                  <span title={d.departmentId}>{d.departmentName ?? "Department"}</span>
                ) : (
                  <span className="text-muted-foreground">n/a</span>
                )
              }
            />
            <Row k="Reason" v={<span className="text-muted-foreground">{d.reason}</span>} />
            {d.queuePosition !== null && (
              <Row
                k="Queue"
                v={
                  <span>
                    #{d.queuePosition} · ~{Math.round((d.estimatedWaitSeconds ?? 0) / 60)}m wait
                  </span>
                }
              />
            )}
            {d.autoMessage && (
              <div className="mt-3 rounded-control bg-muted/40 p-3 text-xs italic">
                "{d.autoMessage}"
              </div>
            )}
            {d.simulatedAt && (
              <p className="pt-2 text-xs text-muted-foreground">
                Simulated at {fmtZoned(new Date(d.simulatedAt), { timeStyle: "short" })}
              </p>
            )}
          </dl>
        )}
        {!d && !preview.isPending && !preview.isError && (
          <p className="text-sm text-muted-foreground">
            Run a simulation to see how the engine would route a session.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1">
      <dt className="text-xs uppercase text-muted-foreground">{k}</dt>
      <dd className="text-sm">{v}</dd>
    </div>
  );
}
