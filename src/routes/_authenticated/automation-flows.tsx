import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppTopbar } from "@/components/app/app-topbar";
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Zap,
  MessageSquare,
  Users,
  ShoppingCart,
  CalendarClock,
  Bot,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Button } from "@/components/ui/button";
import { sbAny } from "@/lib/supabase/untyped";

export const Route = createFileRoute("/_authenticated/automation-flows")({
  component: AutomationFlowsPage,
});

type FlowRow = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "paused";
  trigger_type: string;
  runs_count: number;
  last_run_at: string | null;
  last_run_status: string | null;
  updated_at: string;
};

const TEMPLATES = [
  {
    id: "welcome",
    title: "New Contact Welcome",
    desc: "Greet fresh leads on WhatsApp with a branded intro.",
    icon: MessageSquare,
    tint: "text-success",
    trigger: "contact.created",
  },
  {
    id: "abandoned-cart",
    title: "Abandoned Cart Recovery",
    desc: "Nudge shoppers who leave items behind.",
    icon: ShoppingCart,
    tint: "text-primary",
    trigger: "cart.abandoned",
  },
  {
    id: "lead-qualify",
    title: "AI Lead Qualification",
    desc: "Score, tag and route inbound leads.",
    icon: Sparkles,
    tint: "text-accent",
    trigger: "lead.created",
  },
  {
    id: "reminder",
    title: "Appointment Reminder",
    desc: "Send a 24h reminder before every booking.",
    icon: CalendarClock,
    tint: "text-warning",
    trigger: "appointment.upcoming",
  },
  {
    id: "handoff",
    title: "Bot to Human Handoff",
    desc: "Escalate to an agent when confidence drops.",
    icon: Bot,
    tint: "text-primary",
    trigger: "chatbot.handoff",
  },
  {
    id: "reengage",
    title: "Customer Re-engagement",
    desc: "Win back contacts idle for 30 days.",
    icon: Users,
    tint: "text-accent",
    trigger: "contact.idle",
  },
];

function AutomationFlowsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dlg, setDlg] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tpl, setTpl] = useState<string | null>(null);

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["automation-flows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select(
          "id, name, description, status, trigger_type, runs_count, last_run_at, last_run_status, updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as FlowRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: sess } = await supabase.auth.getUser();
      const { data: mem } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", sess.user?.id ?? "")
        .limit(1)
        .single();
      if (!mem?.workspace_id) throw new Error("No workspace");
      const template = TEMPLATES.find((t) => t.id === tpl);
      const { data, error } = await sbAny(supabase)
        .from("automations")
        .insert({
          workspace_id: mem.workspace_id,
          name: name || template?.title || "Untitled Flow",
          description: desc || template?.desc || null,
          trigger_type: template?.trigger ?? "manual",
          status: "draft",
          graph: { nodes: [], edges: [] } as unknown as never,
          created_by: sess.user?.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Flow created");
      setDlg(false);
      setName("");
      setDesc("");
      setTpl(null);
      qc.invalidateQueries({ queryKey: ["automation-flows"] });
      navigate({ to: "/automations/$workflowId", params: { workflowId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FlowRow["status"] }) => {
      const next = status === "active" ? "paused" : "active";
      const { error } = await sbAny(supabase)
        .from("automations")
        .update({ status: next })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-flows"] }),
  });

  const stats = {
    total: flows.length,
    active: flows.filter((f) => f.status === "active").length,
    draft: flows.filter((f) => f.status === "draft").length,
    runs: flows.reduce((a, b) => a + (b.runs_count ?? 0), 0),
  };

  const openTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    setTpl(id);
    setName(t?.title ?? "");
    setDesc(t?.desc ?? "");
    setDlg(true);
  };

  return (
    <>
      <AppTopbar
        title="Automation Flows"
        subtitle="Design, run and monitor no-code automation flows across your workspace"
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Flows", value: stats.total, icon: Workflow },
            { label: "Active", value: stats.active, icon: CheckCircle2 },
            { label: "Drafts", value: stats.draft, icon: Clock },
            { label: "Total Runs", value: stats.runs, icon: Zap },
          ].map((s) => (
            <div key={s.label} className="rounded-control border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-display font-bold mt-1">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Templates */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display font-semibold text-base">Start from a template</h2>
              <p className="text-xs text-muted-foreground">
                Battle-tested flows you can launch in one click.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setTpl(null);
                setName("");
                setDesc("");
                setDlg(true);
              }}
            >
              <Plus className="w-4 h-4 " /> Blank flow
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => openTemplate(t.id)}
                className="text-left rounded-control border border-border bg-surface p-4 hover:border-primary/40 hover:shadow-sm transition-all group"
              >
                <div
                  className={`w-9 h-9 rounded-control bg-muted/60 flex items-center justify-center ${t.tint}`}
                >
                  <t.icon className="w-4.5 h-4.5" />
                </div>
                <div className="mt-3 font-medium text-sm">{t.title}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.desc}</div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-mono">{t.trigger}</span>
                  <span className="text-primary inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Use <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Existing Flows */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display font-semibold text-base">Your flows</h2>
              <p className="text-xs text-muted-foreground">
                Open the visual builder to edit triggers, actions and conditions.
              </p>
            </div>
            <Link to="/automations" className="text-xs text-primary hover:underline">
              Advanced view →
            </Link>
          </div>
          {isLoading ? (
            <div className="rounded-control border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
              Loading flows
            </div>
          ) : flows.length === 0 ? (
            <div className="rounded-control border border-dashed border-border bg-surface p-10 text-center">
              <Workflow className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <div className="font-medium text-sm">No flows yet</div>
              <div className="text-xs text-muted-foreground mt-1">
                Pick a template above or start blank.
              </div>
            </div>
          ) : (
            <div className="rounded-control border border-border bg-surface divide-y divide-border">
              {flows.map((f) => (
                <div key={f.id} className="p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-control bg-muted flex items-center justify-center shrink-0">
                    <Workflow className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      to="/automations/$workflowId"
                      params={{ workflowId: f.id }}
                      className="font-medium text-sm hover:text-primary truncate block"
                    >
                      {f.name}
                    </Link>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                      <span className="font-mono">{f.trigger_type}</span>
                      <span>· {f.runs_count ?? 0} runs</span>
                      {f.last_run_status && (
                        <span className="inline-flex items-center gap-1">
                          {f.last_run_status === "success" ? (
                            <CheckCircle2 className="w-3 h-3 text-success" />
                          ) : (
                            <XCircle className="w-3 h-3 text-destructive" />
                          )}
                          {f.last_run_status}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-control font-medium ${
                      f.status === "active"
                        ? "bg-success/10 text-success"
                        : f.status === "paused"
                          ? "bg-warning/10 text-warning"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {f.status}
                  </span>
                  <button
                    onClick={() => toggle.mutate({ id: f.id, status: f.status })}
                    className="h-8 w-8 rounded-control border border-border hover:bg-muted inline-flex items-center justify-center"
                    title={f.status === "active" ? "Pause" : "Activate"}
                  >
                    {f.status === "active" ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <Link
                    to="/automations/$workflowId"
                    params={{ workflowId: f.id }}
                    className="h-8 px-3 rounded-control bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 inline-flex items-center gap-1"
                  >
                    Open builder <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tpl ? "Use template" : "New blank flow"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Welcome new leads"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <RichTextarea
                value={desc}
                onChange={(v) => setDesc(v)}
                rows={3}
                placeholder="What does this flow do?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating" : "Create & open builder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
