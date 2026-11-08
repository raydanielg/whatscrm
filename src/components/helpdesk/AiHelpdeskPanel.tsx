import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useState } from "react";
import {
  analyzeTicket, detectPriority, analyzeSentiment, detectIntent,
  suggestReply, suggestKnowledge, summarizeConversation, summarizeTicket,
  suggestTags, suggestAssignment, detectDuplicates, suggestEscalation, suggestResolution,
} from "@/lib/helpdesk/ai-helpdesk.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger,
  DropdownMenuSubContent, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Sparkles, Wand2, Gauge, HeartPulse, Compass, MessageSquareText, BookOpen,
  ScrollText, ClipboardList, Tags, UserPlus, Copy, TrendingUp, CheckCircle2, Loader2,
  ChevronDown, Check, PenSquare, Search, Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type AiTabValue = "reply" | "insight" | "knowledge" | "summary" | "routing" | "resolve";
type AiTabLeaf = { value: AiTabValue; label: string; icon: LucideIcon; description: string };
type AiTabGroup = { key: string; label: string; icon: LucideIcon; items: AiTabLeaf[] };

const AI_TAB_GROUPS: AiTabGroup[] = [
  {
    key: "compose",
    label: "Compose",
    icon: PenSquare,
    items: [
      { value: "reply", label: "Reply", icon: MessageSquareText, description: "Draft an AI reply" },
      { value: "summary", label: "Summary", icon: ScrollText, description: "Conversation & ticket brief" },
    ],
  },
  {
    key: "analyze",
    label: "Analyze",
    icon: Search,
    items: [
      { value: "insight", label: "Insight", icon: Gauge, description: "Priority, sentiment, intent, tags" },
      { value: "knowledge", label: "Knowledge", icon: BookOpen, description: "Suggested KB articles" },
    ],
  },
  {
    key: "act",
    label: "Actions",
    icon: Wrench,
    items: [
      { value: "routing", label: "Route", icon: UserPlus, description: "Assign, duplicates, escalate" },
      { value: "resolve", label: "Resolve", icon: CheckCircle2, description: "Generate resolution plan" },
    ],
  },
];

const AI_TAB_LEAVES: AiTabLeaf[] = AI_TAB_GROUPS.flatMap((g) => g.items);

export function AiHelpdeskPanel({ ticketId, onApplied }: { ticketId: string; onApplied?: () => void }) {
  const analyzeFn = useServerFn(analyzeTicket);
  const priFn = useServerFn(detectPriority);
  const sentFn = useServerFn(analyzeSentiment);
  const intentFn = useServerFn(detectIntent);
  const replyFn = useServerFn(suggestReply);
  const kbFn = useServerFn(suggestKnowledge);
  const convFn = useServerFn(summarizeConversation);
  const briefFn = useServerFn(summarizeTicket);
  const tagsFn = useServerFn(suggestTags);
  const assignFn = useServerFn(suggestAssignment);
  const dupsFn = useServerFn(detectDuplicates);
  const escFn = useServerFn(suggestEscalation);
  const resFn = useServerFn(suggestResolution);

  const [tone, setTone] = useState<"friendly"|"formal"|"empathetic"|"concise"|"apologetic">("friendly");
  const [activeTab, setActiveTab] = useState<AiTabValue>("reply");
  const activeLeaf = AI_TAB_LEAVES.find((l) => l.value === activeTab) ?? AI_TAB_LEAVES[0];
  const ActiveIcon = activeLeaf.icon;

  const analyze = useMutation({
    mutationFn: () => analyzeFn({ data: { ticketId, apply: true } }),
    onSuccess: () => { toast.success("Ticket analyzed & applied"); onApplied?.(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const priority = useMutation({ mutationFn: () => priFn({ data: { ticketId, apply: true } }), onSuccess: () => { toast.success("Priority updated"); onApplied?.(); }, onError: (e: Error) => toast.error(e.message) });
  const sentiment = useMutation({ mutationFn: () => sentFn({ data: { ticketId } }), onError: (e: Error) => toast.error(e.message) });
  const intent = useMutation({ mutationFn: () => intentFn({ data: { ticketId } }), onError: (e: Error) => toast.error(e.message) });
  const reply = useMutation({ mutationFn: () => replyFn({ data: { ticketId, tone } }), onError: (e: Error) => toast.error(e.message) });
  const kb = useMutation({ mutationFn: () => kbFn({ data: { ticketId } }), onError: (e: Error) => toast.error(e.message) });
  const convSum = useMutation({ mutationFn: () => convFn({ data: { ticketId, apply: true } }), onSuccess: () => { toast.success("Summary saved"); onApplied?.(); }, onError: (e: Error) => toast.error(e.message) });
  const brief = useMutation({ mutationFn: () => briefFn({ data: { ticketId } }), onError: (e: Error) => toast.error(e.message) });
  const tags = useMutation({ mutationFn: () => tagsFn({ data: { ticketId, apply: true } }), onSuccess: () => { toast.success("Tags applied"); onApplied?.(); }, onError: (e: Error) => toast.error(e.message) });
  const assign = useMutation({ mutationFn: () => assignFn({ data: { ticketId, apply: true } }), onSuccess: (r) => { toast.success(r.agentId ? `Assigned to ${r.agentName ?? "agent"}` : "No suitable agent"); onApplied?.(); }, onError: (e: Error) => toast.error(e.message) });
  const dups = useMutation({ mutationFn: () => dupsFn({ data: { ticketId } }), onError: (e: Error) => toast.error(e.message) });
  const escalation = useMutation({ mutationFn: () => escFn({ data: { ticketId } }), onError: (e: Error) => toast.error(e.message) });
  const resolution = useMutation({ mutationFn: () => resFn({ data: { ticketId } }), onError: (e: Error) => toast.error(e.message) });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> AI Helpdesk
          <Badge variant="outline" className="ml-auto text-[11px]">Shared AI Engine</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <Button size="sm" className="w-full min-w-0" onClick={() => analyze.mutate()} disabled={analyze.isPending}>
            {analyze.isPending ? <Loader2 className="h-4 w-4 mr-2 shrink-0 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2 shrink-0" />}
            <span className="min-w-0 flex-1 truncate text-left">Full Analyze (classify + priority + sentiment + tags + summary)</span>
          </Button>
          {analyze.data && (
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
              {analyze.data.priority && <Badge variant="outline">Priority: {analyze.data.priority}</Badge>}
              {analyze.data.sentiment && <Badge variant="outline">Sentiment: {analyze.data.sentiment}</Badge>}
              {analyze.data.intent && <Badge variant="outline">Intent: {analyze.data.intent}</Badge>}
              {analyze.data.tags?.length ? <Badge variant="outline" className="col-span-2">Tags: {analyze.data.tags.join(", ")}</Badge> : null}
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AiTabValue)} data-testid="ai-helpdesk-tabs">
          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid="ai-helpdesk-tabs-trigger"
              className={cn(
                "flex w-full items-center gap-2 rounded-control border bg-background px-3 py-2 text-sm outline-none",
                "hover:bg-muted/40 data-[state=open]:bg-muted/60 transition-colors",
              )}
              aria-label="Select AI action"
            >
              <ActiveIcon className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-left font-medium">{activeLeaf.label}</span>
              <span className="hidden sm:inline text-xs text-muted-foreground truncate">{activeLeaf.description}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4} className="w-[min(18rem,calc(100vw-1.5rem))]">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">AI actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {AI_TAB_GROUPS.map((group) => {
                const GroupIcon = group.icon;
                const groupActive = group.items.some((i) => i.value === activeTab);
                return (
                  <DropdownMenuSub key={group.key}>
                    <DropdownMenuSubTrigger
                      className={cn("gap-2", groupActive && "bg-primary/5 text-primary")}
                      data-testid={`ai-helpdesk-group-${group.key}`}
                    >
                      <GroupIcon className={cn("h-4 w-4 shrink-0", groupActive && "text-primary")} />
                      <span className="flex-1 truncate">{group.label}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="w-[min(18rem,calc(100vw-1.5rem))]">
                        {group.items.map((leaf) => {
                          const Icon = leaf.icon;
                          const active = leaf.value === activeTab;
                          return (
                            <DropdownMenuItem
                              key={leaf.value}
                              data-testid={`ai-helpdesk-tab-${leaf.value}`}
                              onSelect={() => setActiveTab(leaf.value)}
                              className={cn(
                                "flex items-start gap-2.5 cursor-pointer",
                                active && "bg-primary/10 text-primary",
                              )}
                              aria-current={active ? "true" : undefined}
                            >
                              <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", active && "text-primary")} />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className={cn("text-sm leading-tight truncate", active && "font-semibold")}>
                                  {leaf.label}
                                </span>
                                <span className={cn("text-[11px] truncate", active ? "text-primary/80" : "text-muted-foreground")}>
                                  {leaf.description}
                                </span>
                              </span>
                              {active && <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>


          <TabsContent value="reply" className="space-y-2 mt-3">
            <div className="flex items-center gap-2">
              <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="empathetic">Empathetic</SelectItem>
                  <SelectItem value="concise">Concise</SelectItem>
                  <SelectItem value="apologetic">Apologetic</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => reply.mutate()} disabled={reply.isPending}>
                {reply.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 " />}Draft
              </Button>
            </div>
            {reply.data?.suggestion && (
              <div className="p-3 rounded-control border bg-muted/30 text-sm whitespace-pre-wrap">
                {reply.data.suggestion}
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(reply.data!.suggestion); toast.success("Copied"); }}>
                    <Copy className="h-3 w-3 " />Copy
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="insight" className="space-y-2 mt-3">
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => priority.mutate()} disabled={priority.isPending}>
                <Gauge className="h-3.5 w-3.5 " />Priority
              </Button>
              <Button size="sm" variant="outline" onClick={() => sentiment.mutate()} disabled={sentiment.isPending}>
                <HeartPulse className="h-3.5 w-3.5 " />Sentiment
              </Button>
              <Button size="sm" variant="outline" onClick={() => intent.mutate()} disabled={intent.isPending}>
                <Compass className="h-3.5 w-3.5 " />Intent
              </Button>
              <Button size="sm" variant="outline" onClick={() => tags.mutate()} disabled={tags.isPending}>
                <Tags className="h-3.5 w-3.5 " />Auto Tags
              </Button>
            </div>
            {priority.data && <InsightRow label="Priority" value={priority.data.priority} reason={priority.data.reason} />}
            {sentiment.data && <InsightRow label={`Sentiment (${sentiment.data.emotion ?? "—"})`} value={sentiment.data.sentiment} reason={`${sentiment.data.trend ?? ""} — ${sentiment.data.reason ?? ""}`} />}
            {intent.data && <InsightRow label="Intent" value={intent.data.intent} reason={intent.data.sub_topic ?? ""} />}
            {tags.data?.tags?.length ? <div className="flex flex-wrap gap-1 pt-1">{tags.data.tags.map((t) => <Badge key={t} variant="secondary" className="text-[11px]">{t}</Badge>)}</div> : null}
          </TabsContent>

          <TabsContent value="knowledge" className="space-y-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => kb.mutate()} disabled={kb.isPending}>
              <BookOpen className="h-3.5 w-3.5 " />Suggest articles
            </Button>
            <div className="space-y-2">
              {(kb.data ?? []).map((a) => (
                <a key={a.id} href={`/knowledge-base/${a.slug}`} className="block p-2 rounded-control border hover:bg-muted/50 text-sm">
                  <div className="font-medium">{a.title}</div>
                  {a.summary && <div className="text-xs text-muted-foreground line-clamp-2">{a.summary}</div>}
                </a>
              ))}
              {kb.data && kb.data.length === 0 && <p className="text-xs text-muted-foreground">No matching articles.</p>}
            </div>
          </TabsContent>

          <TabsContent value="summary" className="space-y-2 mt-3">
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => convSum.mutate()} disabled={convSum.isPending}>
                <ScrollText className="h-3.5 w-3.5 " />Conversation
              </Button>
              <Button size="sm" variant="outline" onClick={() => brief.mutate()} disabled={brief.isPending}>
                <ClipboardList className="h-3.5 w-3.5 " />Ticket Brief
              </Button>
            </div>
            {convSum.data?.summary && (
              <div className="p-2 rounded-control border bg-primary/5 text-sm">{convSum.data.summary}</div>
            )}
            {brief.data && (
              <div className="p-2 rounded-control border bg-muted/30 text-xs space-y-1">
                {brief.data.problem && <div><b>Problem:</b> {brief.data.problem}</div>}
                {brief.data.customer_ask && <div><b>Customer asks:</b> {brief.data.customer_ask}</div>}
                {!!brief.data.actions_taken?.length && <div><b>Actions:</b> {brief.data.actions_taken.join("; ")}</div>}
                {!!brief.data.pending?.length && <div><b>Pending:</b> {brief.data.pending.join("; ")}</div>}
                {!!brief.data.next_steps?.length && <div><b>Next:</b> {brief.data.next_steps.join("; ")}</div>}
              </div>
            )}
          </TabsContent>

          <TabsContent value="routing" className="space-y-2 mt-3">
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" variant="outline" onClick={() => assign.mutate()} disabled={assign.isPending}>
                <UserPlus className="h-3.5 w-3.5 " />Assign
              </Button>
              <Button size="sm" variant="outline" onClick={() => dups.mutate()} disabled={dups.isPending}>
                <Copy className="h-3.5 w-3.5 " />Duplicates
              </Button>
              <Button size="sm" variant="outline" onClick={() => escalation.mutate()} disabled={escalation.isPending}>
                <TrendingUp className="h-3.5 w-3.5 " />Escalate
              </Button>
            </div>
            {assign.data && (
              <div className="p-2 rounded-control border text-xs">
                <b>{assign.data.agentName ?? "No recommendation"}</b>
                <div className="text-muted-foreground">{assign.data.reason}</div>
              </div>
            )}
            {dups.data && dups.data.length > 0 && (
              <div className="space-y-1">
                {dups.data.map((d) => (
                  <a key={d.ticketId} href={`/helpdesk/${d.ticketId}`} className="block p-2 rounded-control border hover:bg-muted/50 text-xs">
                    <div className="flex items-center gap-2"><b>#{d.ticketNumber}</b> {d.subject}<Badge variant="outline" className="ml-auto text-[11px]">{Math.round((d.confidence ?? 0) * 100)}%</Badge></div>
                    <div className="text-muted-foreground">{d.reason}</div>
                  </a>
                ))}
              </div>
            )}
            {dups.data && dups.data.length === 0 && <p className="text-xs text-muted-foreground">No duplicates found.</p>}
            {escalation.data && (
              <div className={`p-2 rounded-control border text-xs ${escalation.data.recommend ? "bg-red-50 border-red-200" : "bg-muted/30"}`}>
                <div className="font-medium">{escalation.data.recommend ? `Recommend escalating (level ${escalation.data.level})` : "No escalation needed"}</div>
                {escalation.data.target && <div>Target: {escalation.data.target}</div>}
                {escalation.data.reason && <div className="text-muted-foreground">{escalation.data.reason}</div>}
              </div>
            )}
          </TabsContent>

          <TabsContent value="resolve" className="space-y-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => resolution.mutate()} disabled={resolution.isPending}>
              <CheckCircle2 className="h-3.5 w-3.5 " />Generate resolution plan
            </Button>
            {resolution.data && (
              <div className="space-y-2 text-xs">
                {resolution.data.estimated_effort && <Badge variant="outline">Effort: {resolution.data.estimated_effort}</Badge>}
                {resolution.data.steps?.map((s, i) => (
                  <div key={i} className="p-2 rounded-control border">
                    <div className="font-medium">{i + 1}. {s.title}</div>
                    <div className="text-muted-foreground">{s.detail}</div>
                  </div>
                ))}
                {!!resolution.data.risks?.length && (
                  <div className="p-2 rounded-control border bg-yellow-50 border-yellow-200">
                    <b>Risks:</b> {resolution.data.risks.join("; ")}
                  </div>
                )}
                {resolution.data.customer_message && (
                  <div className="p-2 rounded-control border bg-primary/5">
                    <b>Message to customer:</b>
                    <div className="whitespace-pre-wrap mt-1">{resolution.data.customer_message}</div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function InsightRow({ label, value, reason }: { label: string; value?: string; reason?: string }) {
  if (!value) return null;
  return (
    <div className="p-2 rounded-control border text-xs">
      <div className="flex items-center gap-2"><span className="text-muted-foreground">{label}:</span><Badge variant="outline">{value}</Badge></div>
      {reason && <div className="text-muted-foreground mt-1">{reason}</div>}
    </div>
  );
}
