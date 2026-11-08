import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getWaHandoffOverview,
  updateWaHandoffSettings,
  WA_HANDOFF_STRATEGY_LABEL,
} from "@/lib/messaging/wa-handoff.functions";
import type { WaHandoffStrategy } from "@/lib/messaging/wa-handoff-config";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Users, Timer, Save, ShieldCheck, Clock } from "lucide-react";

const STRATEGY_HINT: Record<WaHandoffStrategy, string> = {
  round_robin: "Each handoff goes to the agent who waited longest since their last assignment.",
  least_busy: "Picks the online agent with the fewest active conversations.",
  skill: "Only agents holding every required skill are eligible; ties go to the least busy.",
  auto: "Prefers skill matches, then the least busy agent, then round robin.",
};

export function WaHandoffSettingsPanel({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getWaHandoffOverview);
  const saveFn = useServerFn(updateWaHandoffSettings);

  const { data, isLoading } = useQuery({
    enabled: !!workspaceId,
    queryKey: ["wa-handoff-overview", workspaceId],
    queryFn: () => fetchOverview({ data: { workspaceId: workspaceId! } }),
    refetchInterval: 30_000,
  });

  const [form, setForm] = useState({
    enabled: true,
    strategy: "round_robin" as WaHandoffStrategy,
    requiredSkills: "",
    matchLanguage: true,
    respectMaxConcurrent: true,
    agentCooldownSeconds: 60,
    conversationCooldownSeconds: 300,
    pauseBotOnHandoff: true,
    queueWhenUnavailable: true,
    notifyMessage: "",
  });

  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setForm({
      enabled: s.enabled,
      strategy: s.strategy,
      requiredSkills: (s.required_skills ?? []).join(", "),
      matchLanguage: s.match_language,
      respectMaxConcurrent: s.respect_max_concurrent,
      agentCooldownSeconds: s.agent_cooldown_seconds,
      conversationCooldownSeconds: s.conversation_cooldown_seconds,
      pauseBotOnHandoff: s.pause_bot_on_handoff,
      queueWhenUnavailable: s.queue_when_unavailable,
      notifyMessage: s.notify_message ?? "",
    });
  }, [data?.settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace selected");
      return saveFn({
        data: {
          workspaceId,
          enabled: form.enabled,
          strategy: form.strategy,
          requiredSkills: form.requiredSkills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 20),
          matchLanguage: form.matchLanguage,
          respectMaxConcurrent: form.respectMaxConcurrent,
          agentCooldownSeconds: Math.max(0, Math.min(86400, Number(form.agentCooldownSeconds) || 0)),
          conversationCooldownSeconds: Math.max(
            0,
            Math.min(86400, Number(form.conversationCooldownSeconds) || 0),
          ),
          pauseBotOnHandoff: form.pauseBotOnHandoff,
          queueWhenUnavailable: form.queueWhenUnavailable,
          notifyMessage: form.notifyMessage.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Handoff routing saved");
      qc.invalidateQueries({ queryKey: ["wa-handoff-overview", workspaceId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not save handoff settings"),
  });

  const agents = data?.agents ?? [];
  const required = useMemo(
    () =>
      form.requiredSkills
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    [form.requiredSkills],
  );

  const eligible = agents.filter((a) => {
    if (a.presence !== "online") return false;
    if (form.respectMaxConcurrent && a.currentLoad >= Math.max(1, a.maxConcurrent)) return false;
    if (!required.length) return true;
    const have = new Set(a.skills.map((s) => s.toLowerCase()));
    return required.every((s) => have.has(s));
  });

  if (!workspaceId) {
    return (
      <Card className="rounded">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Select a workspace to configure handoff routing.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="rounded lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Live handoff routing
          </CardTitle>
          <CardDescription>
            Decides which agent takes over when a chat triggers an operator handoff.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <Label className="text-sm">Automatic assignment</Label>
              <p className="text-xs text-muted-foreground">
                Turn off to leave handoffs unassigned for manual pickup.
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Strategy</Label>
              <Select
                value={form.strategy}
                onValueChange={(v) => setForm((f) => ({ ...f, strategy: v as WaHandoffStrategy }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(WA_HANDOFF_STRATEGY_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{STRATEGY_HINT[form.strategy]}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Required skills</Label>
              <Input
                value={form.requiredSkills}
                placeholder="billing, spanish, tier-2"
                onChange={(e) => setForm((f) => ({ ...f, requiredSkills: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Comma separated. Agents must hold all of them to be eligible.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" /> Agent cooldown (seconds)
              </Label>
              <Input
                type="number" min={0} max={86400}
                value={form.agentCooldownSeconds}
                onChange={(e) =>
                  setForm((f) => ({ ...f, agentCooldownSeconds: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Skip an agent for this long after they receive a chat. If everyone is cooling
                down the least-recent agent still gets it.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Conversation cooldown (seconds)
              </Label>
              <Input
                type="number" min={0} max={86400}
                value={form.conversationCooldownSeconds}
                onChange={(e) =>
                  setForm((f) => ({ ...f, conversationCooldownSeconds: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Prevents re-routing the same thread when a customer sends several messages.
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { key: "matchLanguage", label: "Prefer agents who speak the detected language" },
              { key: "respectMaxConcurrent", label: "Respect each agent's max concurrent chats" },
              { key: "pauseBotOnHandoff", label: "Pause the bot on the thread after handoff" },
              { key: "queueWhenUnavailable", label: "Queue the chat when no agent is free" },
            ].map((o) => (
              <label
                key={o.key}
                className="flex items-center justify-between gap-3 rounded border p-3 text-sm"
              >
                <span>{o.label}</span>
                <Switch
                  checked={form[o.key as keyof typeof form] as boolean}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, [o.key]: v }))}
                />
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Message to the customer (optional)</Label>
            <Textarea
              rows={2}
              value={form.notifyMessage}
              placeholder="Connecting you with a specialist — one moment please."
              onChange={(e) => setForm((f) => ({ ...f, notifyMessage: e.target.value }))}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
              <Save className="h-4 w-4" />
              {save.isPending ? "Saving" : "Save routing"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Agent pool
          </CardTitle>
          <CardDescription>
            {eligible.length} of {agents.length} eligible right now
            {data?.waitingInQueue ? ` · ${data.waitingInQueue} waiting in queue` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-14 w-full rounded" />
              <Skeleton className="h-14 w-full rounded" />
            </>
          ) : agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No agent availability records yet. Agents appear here once they set their
              presence in the inbox.
            </p>
          ) : (
            agents.map((a) => {
              const isEligible = eligible.some((e) => e.userId === a.userId);
              return (
                <div key={a.userId} className="rounded border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{a.name}</span>
                    <Badge variant={isEligible ? "default" : "secondary"} className="rounded">
                      {a.presence}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Load {a.currentLoad}/{Math.max(1, a.maxConcurrent)}</span>
                    {a.coolingDownFor > 0 && <span>Cooling down {a.coolingDownFor}s</span>}
                    {a.languages.length > 0 && <span>{a.languages.join(", ")}</span>}
                  </div>
                  {a.skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {a.skills.slice(0, 6).map((s) => (
                        <Badge key={s} variant="outline" className="rounded text-[11px]">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
