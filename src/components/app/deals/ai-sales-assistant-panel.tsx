import { useState } from "react";
import {
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Target,
  Send,
  MessageCircle,
  FileText,
  GraduationCap,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  ChevronRight,
  Clock,
  Zap,
  ThumbsUp,
  LineChart,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDealSummary,
  useDealRisk,
  useNextBestAction,
  useFollowUps,
  useProposalSuggestions,
  useCoaching,
  useDealProbability,
  useSalesRecommendations,
  useDraftMessage,
  useGenerateCrmNote,
  useRefreshDealAI,
} from "@/hooks/use-sales-assistant";
import { cn } from "@/lib/utils";

interface Props {
  dealId: string;
}

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  critical: "bg-red-500/10 text-red-600 border-red-500/20",
};

const URGENCY_META: Record<string, { label: string; icon: typeof Zap; cls: string }> = {
  now: { label: "Now", icon: Zap, cls: "text-red-500" },
  today: { label: "Today", icon: Clock, cls: "text-orange-500" },
  this_week: { label: "This week", icon: Clock, cls: "text-blue-500" },
  later: { label: "Later", icon: Clock, cls: "text-muted-foreground" },
};

export function AISalesAssistantPanel({ dealId }: Props) {
  const refresh = useRefreshDealAI();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-control bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Sales Assistant</h3>
            <p className="text-xs text-muted-foreground">
              Real-time insight, continuously working for you.
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => refresh(dealId)}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-4 lg:grid-cols-7  ">
          <TabsTrigger value="overview" className="text-xs">
            Overview
          </TabsTrigger>
          <TabsTrigger value="risk" className="text-xs">
            Risk
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs">
            Actions
          </TabsTrigger>
          <TabsTrigger value="draft" className="text-xs">
            Draft
          </TabsTrigger>
          <TabsTrigger value="proposal" className="text-xs">
            Proposal
          </TabsTrigger>
          <TabsTrigger value="coach" className="text-xs">
            Coach
          </TabsTrigger>
          <TabsTrigger value="note" className="text-xs">
            Note
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-3">
          <SummaryCard dealId={dealId} />
          <ProbabilityCard dealId={dealId} />
          <RecommendationsCard dealId={dealId} />
        </TabsContent>
        <TabsContent value="risk" className="mt-4">
          <RiskCard dealId={dealId} />
        </TabsContent>
        <TabsContent value="actions" className="mt-4 space-y-3">
          <NextBestActionCard dealId={dealId} />
          <FollowUpsCard dealId={dealId} />
        </TabsContent>
        <TabsContent value="draft" className="mt-4">
          <DraftCard dealId={dealId} />
        </TabsContent>
        <TabsContent value="proposal" className="mt-4">
          <ProposalCard dealId={dealId} />
        </TabsContent>
        <TabsContent value="coach" className="mt-4">
          <CoachingCard dealId={dealId} />
        </TabsContent>
        <TabsContent value="note" className="mt-4">
          <CrmNoteCard dealId={dealId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------------- Cards --------------------------------- */

function LoadingBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3.5 w-full" />
      ))}
    </div>
  );
}

function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong";
  return (
    <div className="rounded-control border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive flex items-start justify-between gap-2">
      <span className="flex-1">{msg}</span>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

function SummaryCard({ dealId }: { dealId: string }) {
  const q = useDealSummary(dealId);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-violet-500" />
        <h4 className="text-sm font-semibold">Deal summary</h4>
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <div className="space-y-2">
          <p className="text-sm font-medium leading-snug">{q.data.headline}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{q.data.summary}</p>
          {q.data.keyPoints?.length > 0 && (
            <ul className="space-y-1 pt-1">
              {q.data.keyPoints.map((k, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-violet-500 flex-shrink-0" />
                  <span>{k}</span>
                </li>
              ))}
            </ul>
          )}
          {q.data.stakeholders?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {q.data.stakeholders.map((s, i) => (
                <Badge key={i} variant="secondary" className="text-[11px]">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function ProbabilityCard({ dealId }: { dealId: string }) {
  const q = useDealProbability(dealId);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-emerald-500" />
        <h4 className="text-sm font-semibold">Win probability</h4>
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold ">{q.data.probability}%</span>
            <Badge variant="outline" className="text-[11px] capitalize">
              {q.data.confidence} confidence
            </Badge>
          </div>
          <Progress value={q.data.probability} className="h-2" />
          {q.data.predictedCloseDate && (
            <p className="text-xs text-muted-foreground">
              Predicted close: <span className="font-medium">{q.data.predictedCloseDate}</span>
            </p>
          )}
          <div className="space-y-1.5">
            {q.data.drivers?.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      d.impact === "positive" ? "bg-emerald-500" : "bg-red-500",
                    )}
                  />
                  {d.label}
                </span>
                <span className="text-muted-foreground">weight {d.weight}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function RecommendationsCard({ dealId }: { dealId: string }) {
  const q = useSalesRecommendations(dealId);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <ThumbsUp className="w-4 h-4 text-blue-500" />
        <h4 className="text-sm font-semibold">Sales recommendations</h4>
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <ul className="space-y-2">
          {q.data.recommendations?.map((r, i) => (
            <li key={i} className="border rounded-control p-2.5">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-medium">{r.title}</p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px] capitalize",
                    r.impact === "high" && "border-emerald-500/40 text-emerald-600",
                    r.impact === "medium" && "border-blue-500/40 text-blue-600",
                  )}
                >
                  {r.impact} impact
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{r.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function RiskCard({ dealId }: { dealId: string }) {
  const q = useDealRisk(dealId);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-orange-500" />
        <h4 className="text-sm font-semibold">Deal risk detection</h4>
      </div>
      {q.isLoading ? (
        <LoadingBlock lines={5} />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold ">{q.data.score}</div>
              <div className="text-xs text-muted-foreground">Risk score</div>
            </div>
            <Badge className={cn("capitalize border", RISK_COLORS[q.data.level])}>
              {q.data.level}
            </Badge>
          </div>
          <div className="space-y-2">
            {q.data.factors?.map((f, i) => (
              <div key={i} className="border rounded-control p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">{f.title}</p>
                  <Badge
                    variant="outline"
                    className={cn("text-[11px] capitalize", RISK_COLORS[f.severity])}
                  >
                    {f.severity}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{f.detail}</p>
              </div>
            ))}
          </div>
          {q.data.mitigations?.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-semibold mb-1.5">Mitigations</p>
              <ul className="space-y-1">
                {q.data.mitigations.map((m, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <ChevronRight className="w-3 h-3 mt-0.5 text-emerald-500 flex-shrink-0" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function NextBestActionCard({ dealId }: { dealId: string }) {
  const q = useNextBestAction(dealId);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-fuchsia-500" />
        <h4 className="text-sm font-semibold">Next best action</h4>
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <ul className="space-y-2">
          {q.data.actions?.map((a, i) => {
            const meta = URGENCY_META[a.urgency] ?? URGENCY_META.later;
            const Icon = meta.icon;
            return (
              <li key={i} className="border rounded-control p-2.5">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium flex-1">{a.title}</p>
                  <div className={cn("flex items-center gap-1 text-[11px] font-medium", meta.cls)}>
                    <Icon className="w-3 h-3" /> {meta.label}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-1.5">{a.reason}</p>
                <Badge variant="outline" className="text-[11px] capitalize">
                  {a.channel}
                </Badge>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

function FollowUpsCard({ dealId }: { dealId: string }) {
  const q = useFollowUps(dealId);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-blue-500" />
        <h4 className="text-sm font-semibold">Follow-up suggestions</h4>
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <ul className="space-y-2">
          {q.data.suggestions?.map((s, i) => (
            <li key={i} className="border rounded-control p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-medium">{s.subject}</p>
                <span className="text-[11px] text-muted-foreground">{s.whenLabel}</span>
              </div>
              <p className="text-xs text-muted-foreground">{s.preview}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function DraftCard({ dealId }: { dealId: string }) {
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [tone, setTone] = useState<"friendly" | "professional" | "urgent" | "casual" | "formal">(
    "professional",
  );
  const [intent, setIntent] = useState("");
  const [copied, setCopied] = useState(false);
  const m = useDraftMessage();

  const onGenerate = () => {
    if (!intent.trim()) {
      toast.error("Describe what the message should achieve.");
      return;
    }
    m.mutate({ dealId, channel, intent, tone });
  };

  const doCopy = async () => {
    const text = [m.data?.subject ? `Subject: ${m.data.subject}` : "", m.data?.body ?? ""]
      .filter(Boolean)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        {channel === "email" ? (
          <Send className="w-4 h-4 text-blue-500" />
        ) : (
          <MessageCircle className="w-4 h-4 text-emerald-500" />
        )}
        <h4 className="text-sm font-semibold">Draft {channel} message</h4>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={channel} onValueChange={(v) => setChannel(v as "email" | "whatsapp")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="friendly">Friendly</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="casual">Casual</SelectItem>
            <SelectItem value="formal">Formal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input
        placeholder='Intent, e.g. "Push for a meeting next week"'
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !m.isPending) {
            e.preventDefault();
            onGenerate();
          }
        }}
      />
      <Button onClick={onGenerate} disabled={m.isPending} className="w-full">
        {m.isPending ? (
          <>
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Drafting
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate
          </>
        )}
      </Button>
      {m.isError && <ErrorBlock error={m.error} />}
      {m.data && (
        <div className="border rounded-control p-3 space-y-2 bg-muted/30">
          {m.data.subject && (
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-0.5">Subject</div>
              <div className="text-sm font-medium">{m.data.subject}</div>
            </div>
          )}
          <div>
            <div className="text-[11px] uppercase text-muted-foreground mb-0.5">Message</div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.data.body}</div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={doCopy}>
              {copied ? (
                <Check className="w-3.5 h-3.5 mr-1.5" />
              ) : (
                <Copy className="w-3.5 h-3.5 mr-1.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ProposalCard({ dealId }: { dealId: string }) {
  const q = useProposalSuggestions(dealId);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-purple-500" />
        <h4 className="text-sm font-semibold">Proposal strategy</h4>
      </div>
      {q.isLoading ? (
        <LoadingBlock lines={5} />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <ScrollArea className="max-h-96">
          <div className="space-y-3 pr-3">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1">Angle</p>
              <p className="text-sm">{q.data.angle}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1">Value props</p>
              <ul className="space-y-1">
                {q.data.valueProps?.map((v, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <ChevronRight className="w-3 h-3 mt-0.5 text-purple-500" /> {v}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1">Pricing approach</p>
              <p className="text-sm">{q.data.pricingApproach}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1">
                Prepare for objections
              </p>
              <ul className="space-y-1">
                {q.data.objectionsToPrepareFor?.map((v, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 mt-0.5 text-orange-500" /> {v}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1">Bundle ideas</p>
              <ul className="space-y-1">
                {q.data.bundleIdeas?.map((v, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <Sparkles className="w-3 h-3 mt-0.5 text-fuchsia-500" /> {v}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>
      ) : null}
    </Card>
  );
}

function CoachingCard({ dealId }: { dealId: string }) {
  const q = useCoaching(dealId);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap className="w-4 h-4 text-indigo-500" />
        <h4 className="text-sm font-semibold">Sales coaching</h4>
      </div>
      {q.isLoading ? (
        <LoadingBlock lines={5} />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <div className="space-y-3">
          <CoachSection title="What you're doing well" items={q.data.strengths} tint="emerald" />
          <CoachSection title="Where to improve" items={q.data.improvements} tint="amber" />
          <div>
            <p className="text-[11px] uppercase text-muted-foreground mb-1">Script tip</p>
            <p className="text-sm leading-relaxed italic border-l-2 border-indigo-500 pl-3">
              {q.data.scriptTip}
            </p>
          </div>
          <CoachSection title="Metrics to watch" items={q.data.metricsToWatch} tint="blue" />
        </div>
      ) : null}
    </Card>
  );
}

function CoachSection({
  title,
  items,
  tint,
}: {
  title: string;
  items?: string[];
  tint: "emerald" | "amber" | "blue";
}) {
  if (!items?.length) return null;
  const dot = { emerald: "bg-emerald-500", amber: "bg-amber-500", blue: "bg-blue-500" }[tint];
  return (
    <div>
      <p className="text-[11px] uppercase text-muted-foreground mb-1">{title}</p>
      <ul className="space-y-1">
        {items.map((v, i) => (
          <li key={i} className="text-xs flex items-start gap-1.5">
            <span className={cn("w-1.5 h-1.5 rounded-full mt-1.5", dot)} /> {v}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CrmNoteCard({ dealId }: { dealId: string }) {
  const [event, setEvent] = useState("");
  const [note, setNote] = useState("");
  const m = useGenerateCrmNote();
  const [copied, setCopied] = useState(false);

  const onGenerate = () => {
    if (!event.trim()) {
      toast.error("Describe what happened.");
      return;
    }
    m.mutate(
      { dealId, event },
      {
        onSuccess: (r) => setNote(r.note),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to generate note"),
      },
    );
  };

  const doCopy = async () => {
    await navigator.clipboard.writeText(note);
    setCopied(true);
    toast.success("Note copied");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <LineChart className="w-4 h-4 text-cyan-500" />
        <h4 className="text-sm font-semibold">Auto CRM note</h4>
      </div>
      <Input
        placeholder="What happened? e.g. Discovery call with CTO"
        value={event}
        onChange={(e) => setEvent(e.target.value)}
      />
      <Button onClick={onGenerate} disabled={m.isPending} className="w-full">
        {m.isPending ? (
          <>
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate note
          </>
        )}
      </Button>
      {note && (
        <>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={6} />
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={doCopy}>
              {copied ? (
                <Check className="w-3.5 h-3.5 mr-1.5" />
              ) : (
                <Copy className="w-3.5 h-3.5 mr-1.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
