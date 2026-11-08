import * as React from "react";
import { Check, X, Loader2, Sparkles, Shield, Bot } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useCurrentWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import {
  AUTOMATION_TYPES,
  AUTOMATION_META,
  useAutomationConfigMap,
  useUpdateAutomationConfig,
  useSuggestions,
  useApplySuggestion,
  useRejectSuggestion,
  type AutomationType,
} from "@/hooks/use-ai-automations";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AiAutomationsPanel() {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  const { data: role } = useWorkspaceRole(wsId);
  const isAdmin = role === "owner" || role === "admin";

  const { map, isLoading } = useAutomationConfigMap(wsId);
  const update = useUpdateAutomationConfig(wsId);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-4">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">AI Automations</h2>
          {!isAdmin && <Badge variant="secondary" className="ml-2 gap-1"><Shield className="w-3 h-3"/>Read-only</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Enable AI-driven actions across your CRM. Each automation can require confirmation before executing.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {AUTOMATION_TYPES.map((t) => {
            const cfg = map.get(t);
            const meta = AUTOMATION_META[t];
            const enabled = !!cfg?.enabled;
            const requireConfirm = cfg?.requireConfirmation ?? true;
            return (
              <Card key={t} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                      <h3 className="font-medium text-sm">{meta.label}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {meta.entities.map((e) => (
                        <Badge key={e} variant="outline" className="text-[11px] py-0 px-1.5 capitalize">{e}</Badge>
                      ))}
                    </div>
                  </div>
                  <Switch
                    disabled={!isAdmin || isLoading || update.isPending}
                    checked={enabled}
                    onCheckedChange={(v) => update.mutate({ automationType: t, enabled: v })}
                  />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <label className="text-xs text-muted-foreground flex items-center gap-2">
                    <Shield className="w-3 h-3" />
                    Require confirmation
                  </label>
                  <Switch
                    disabled={!isAdmin || !enabled}
                    checked={requireConfirm}
                    onCheckedChange={(v) => update.mutate({ automationType: t, requireConfirmation: v })}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="xl:col-span-1">
        <SuggestionQueue workspaceId={wsId} />
      </div>
    </div>
  );
}

function SuggestionQueue({ workspaceId }: { workspaceId: string | undefined }) {
  const { data: pending, isLoading } = useSuggestions(workspaceId, { status: "pending", limit: 50 });
  const apply = useApplySuggestion(workspaceId);
  const reject = useRejectSuggestion(workspaceId);

  return (
    <Card className="p-4 space-y-3 sticky top-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm">Pending suggestions</h3>
        <Badge variant="secondary">{pending?.length ?? 0}</Badge>
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">Loading</div>}
      {!isLoading && (pending?.length ?? 0) === 0 && (
        <div className="text-xs text-muted-foreground py-8 text-center">
          No pending AI suggestions. Enable automations and interact with conversations, leads, or deals to generate suggestions.
        </div>
      )}
      <ScrollArea type="hover" viewportClassName="max-h-[70vh]">
        <div className="space-y-2">
          {(pending ?? []).map((s) => {
            const meta = AUTOMATION_META[s.automationType as AutomationType];
            const applying = apply.isPending && apply.variables === s.id;
            const rejecting = reject.isPending && reject.variables === s.id;
            return (
              <div key={s.id} className="rounded-control border border-border p-3 space-y-2 bg-surface hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[11px]">{meta?.label ?? s.automationType}</Badge>
                  {s.confidence != null && (
                    <span className="text-[11px] text-muted-foreground ">
                      {(s.confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium">{s.title}</div>
                {s.summary && <div className="text-xs text-muted-foreground line-clamp-3">{s.summary}</div>}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    {s.entityType} · {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      disabled={rejecting || applying}
                      onClick={() => reject.mutate(s.id)}
                    >
                      {rejecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-2"
                      disabled={applying || rejecting}
                      onClick={() => apply.mutate(s.id)}
                    >
                      {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      <span className="ml-1 text-xs">Apply</span>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
