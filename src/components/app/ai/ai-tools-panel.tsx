import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTION_TOOL_CATALOG } from "@/lib/ai/conversation/action-tools.catalog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, Wrench } from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { formatDistanceToNow } from "date-fns";

type Row = {
  id: string;
  tool_name: string;
  success: boolean;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
  input: unknown;
  output: unknown;
};

export function AIToolsPanel({ conversationId }: { conversationId?: string }) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;

  const executions = useQuery({
    queryKey: ["ai_tool_executions", workspaceId, conversationId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("ai_tool_executions" as never)
        .select("id,tool_name,success,error,duration_ms,created_at,input,output")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (conversationId) q = q.eq("conversation_id", conversationId);
      const { data } = await q;
      return (data ?? []) as unknown as Row[];
    },
  });

  const grouped = ACTION_TOOL_CATALOG.reduce<Record<string, typeof ACTION_TOOL_CATALOG[number][]>>(
    (acc, t) => {
      (acc[t.group] ??= []).push(t);
      return acc;
    },
    {},
  );

  return (
    <div className="flex h-full flex-col">
      <header className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="h-8 w-8 rounded-control bg-primary/10 grid place-items-center">
          <Wrench className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">AI Actions</div>
          <div className="text-[11px] text-muted-foreground">
            {ACTION_TOOL_CATALOG.length} tools available
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          <section className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Available tools
            </div>
            <div className="space-y-3">
              {Object.entries(grouped).map(([group, tools]) => (
                <div key={group}>
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                    {group}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tools.map((t) => (
                      <Badge
                        key={t.name}
                        variant="secondary"
                        className="text-[11px] font-normal"
                        title={t.description}
                      >
                        {t.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recent executions
            </div>
            {executions.isLoading ? (
              <div className="text-xs text-muted-foreground">Loading</div>
            ) : (executions.data ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">No executions yet.</div>
            ) : (
              <div className="space-y-1.5">
                {executions.data!.map((r) => (
                  <div
                    key={r.id}
                    className="border border-border rounded-control px-2.5 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {r.success ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      )}
                      <span className="font-medium">{r.tool_name}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        {r.duration_ms != null ? ` · ${r.duration_ms}ms` : null}
                      </span>
                    </div>
                    {r.error ? (
                      <div className="mt-1 text-destructive text-[11px]">{r.error}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
