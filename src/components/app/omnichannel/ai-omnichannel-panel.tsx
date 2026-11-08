import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  analyzeOmnichannel,
  aiSearchTimeline,
  summarizeTimeline,
  translateText,
  saveCrmNote,
  type OmnichannelInsight,
} from "@/lib/ai/omnichannel.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Search,
  Languages,
  StickyNote,
  MessageSquareText,
  Target,
  Activity,
  Clock,
  Send,
  Copy,
  Save,
} from "lucide-react";

interface Props {
  workspaceId: string;
  contactId: string;
  contactName?: string;
}

const priorityColor: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-primary/20 text-primary",
  urgent: "bg-destructive/10 text-destructive",
};
const sentimentColor: Record<string, string> = {
  positive: "text-emerald-600",
  neutral: "text-muted-foreground",
  mixed: "text-amber-600",
  negative: "text-destructive",
};
const healthColor: Record<string, string> = {
  excellent: "text-emerald-600",
  good: "text-primary",
  at_risk: "text-amber-600",
  critical: "text-destructive",
};

export function AIOmnichannelPanel({ workspaceId, contactId, contactName }: Props) {
  const fmtZoned = useZonedDateFormatter();
  const analyzeFn = useServerFn(analyzeOmnichannel);
  const searchFn = useServerFn(aiSearchTimeline);
  const summaryFn = useServerFn(summarizeTimeline);
  const translateFn = useServerFn(translateText);
  const saveNoteFn = useServerFn(saveCrmNote);

  const [insight, setInsight] = useState<OmnichannelInsight | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResult, setSearchResult] = useState<{
    answer: string;
    matches: { at: string; channel: string; excerpt: string }[];
  } | null>(null);
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "all">("month");
  const [rollup, setRollup] = useState<{
    summary: string;
    highlights: string[];
    channels: string[];
    events: number;
  } | null>(null);
  const [translateSrc, setTranslateSrc] = useState("");
  const [translateTarget, setTranslateTarget] = useState("en");
  const [translateOut, setTranslateOut] = useState("");

  const analyze = useMutation({
    mutationFn: () => analyzeFn({ data: { workspaceId, contactId, limit: 200 } }),
    onSuccess: (r) => setInsight(r),
    onError: (e: Error) => toast.error(e.message),
  });
  const search = useMutation({
    mutationFn: () => searchFn({ data: { workspaceId, contactId, query: searchQ, limit: 200 } }),
    onSuccess: (r) => setSearchResult(r),
    onError: (e: Error) => toast.error(e.message),
  });
  const rollupM = useMutation({
    mutationFn: () => summaryFn({ data: { workspaceId, contactId, period, limit: 300 } }),
    onSuccess: (r) => setRollup(r),
    onError: (e: Error) => toast.error(e.message),
  });
  const translate = useMutation({
    mutationFn: () =>
      translateFn({ data: { workspaceId, text: translateSrc, targetLanguage: translateTarget } }),
    onSuccess: (r) => setTranslateOut(r.text),
    onError: (e: Error) => toast.error(e.message),
  });
  const saveNote = useMutation({
    mutationFn: (body: string) => saveNoteFn({ data: { workspaceId, contactId, body } }),
    onSuccess: () => toast.success("CRM note saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copied");
  };

  return (
    <Card className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">Omnichannel AI</div>
            <div className="text-xs text-muted-foreground">
              {contactName
                ? `Understanding ${contactName} across every channel`
                : "Unified customer intelligence"}
            </div>
          </div>
        </div>
        <Button size="sm" onClick={() => analyze.mutate()} disabled={analyze.isPending}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          {analyze.isPending ? "Analyzing" : insight ? "Re-analyze" : "Analyze"}
        </Button>
      </header>

      <Tabs defaultValue="insight" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-3 grid grid-cols-5">
          <TabsTrigger value="insight">
            <Activity className="h-3.5 w-3.5 " />
            Insight
          </TabsTrigger>
          <TabsTrigger value="replies">
            <MessageSquareText className="h-3.5 w-3.5 " />
            Replies
          </TabsTrigger>
          <TabsTrigger value="search">
            <Search className="h-3.5 w-3.5 " />
            Search
          </TabsTrigger>
          <TabsTrigger value="rollup">
            <Clock className="h-3.5 w-3.5 " />
            Rollup
          </TabsTrigger>
          <TabsTrigger value="translate">
            <Languages className="h-3.5 w-3.5 " />
            Translate
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="insight" className="p-4 space-y-4 m-0">
            {analyze.isPending && !insight ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : !insight ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Run analysis to see summary, sentiment, intent, priority, health, risks,
                opportunities, journey and lead qualification across every channel this customer has
                used.
              </div>
            ) : (
              <>
                <section className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge className={priorityColor[insight.priority]}>{insight.priority}</Badge>
                    <Badge variant="outline" className={sentimentColor[insight.sentiment]}>
                      {insight.sentiment}
                    </Badge>
                    <Badge variant="outline">intent: {insight.intent}</Badge>
                    <Badge variant="outline">lang: {insight.language}</Badge>
                    <Badge variant="outline">{insight.eventsAnalyzed} events</Badge>
                    {insight.channelsUsed.map((c) => (
                      <Badge key={c} variant="secondary">
                        {c}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed">{insight.summary}</p>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-xs font-medium text-muted-foreground">Customer health</div>
                    <div className={`text-sm font-semibold ${healthColor[insight.healthLabel]}`}>
                      {insight.health}/100 · {insight.healthLabel.replace("_", " ")}
                    </div>
                  </div>
                  <Progress value={insight.health} />
                </section>

                {insight.risks.length > 0 && (
                  <section>
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-medium">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Risks
                    </div>
                    <ul className="space-y-1.5">
                      {insight.risks.map((r, i) => (
                        <li key={i} className="text-sm border rounded-control p-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{r.label}</span>
                            <Badge
                              variant="outline"
                              className={r.severity === "high" ? "text-destructive" : ""}
                            >
                              {r.severity}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {insight.opportunities.length > 0 && (
                  <section>
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-medium">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Opportunities
                    </div>
                    <ul className="space-y-1.5">
                      {insight.opportunities.map((o, i) => (
                        <li key={i} className="text-sm border rounded-control p-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{o.label}</span>
                            <Badge variant="outline">{o.value}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{o.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="border rounded-control p-3 bg-muted/30">
                  <div className="flex items-center gap-1.5 mb-1 text-xs font-medium">
                    <Target className="h-3.5 w-3.5" /> Next best action
                  </div>
                  <div className="text-sm font-medium">{insight.nextAction.action}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    via {insight.nextAction.channel} · {insight.nextAction.when}
                  </div>
                  <p className="text-xs mt-1">{insight.nextAction.reason}</p>
                </section>

                <section>
                  <div className="text-xs font-medium mb-1.5">Customer journey</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{insight.journey}</p>
                </section>

                <section className="border rounded-control p-3">
                  <div className="text-xs font-medium mb-2">Lead qualification</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Stage:</span>{" "}
                      {insight.qualification.stage}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Score:</span>{" "}
                      {insight.qualification.score}/100
                    </div>
                    <div>
                      <span className="text-muted-foreground">Budget:</span>{" "}
                      {insight.qualification.budget}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Authority:</span>{" "}
                      {insight.qualification.authority}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Need:</span>{" "}
                      {insight.qualification.need}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Timeline:</span>{" "}
                      {insight.qualification.timeline}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {insight.qualification.reasoning}
                  </p>
                </section>

                {insight.crmNote && (
                  <section className="border rounded-control p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <StickyNote className="h-3.5 w-3.5" /> AI-generated CRM note
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => copy(insight.crmNote)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => saveNote.mutate(insight.crmNote)}
                          disabled={saveNote.isPending}
                        >
                          <Save className="h-3.5 w-3.5 " />
                          Save
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{insight.crmNote}</p>
                  </section>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="replies" className="p-4 space-y-3 m-0">
            {!insight ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Run analysis to see suggested replies.
              </div>
            ) : insight.suggestedReplies.length === 0 ? (
              <div className="text-sm text-muted-foreground">No reply suggestions available.</div>
            ) : (
              insight.suggestedReplies.map((r, i) => (
                <div key={i} className="border rounded-control p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex gap-1.5">
                      <Badge variant="secondary">{r.channel}</Badge>
                      <Badge variant="outline">{r.tone}</Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => copy(r.text)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost">
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{r.text}</p>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="search" className="p-4 space-y-3 m-0">
            <div className="flex gap-2">
              <Input
                placeholder="Ask anything about this customer's history"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchQ.length > 1 && search.mutate()}
              />
              <Button
                onClick={() => search.mutate()}
                disabled={search.isPending || searchQ.length < 2}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {searchResult && (
              <div className="space-y-3">
                <div className="border rounded-control p-3 bg-muted/30">
                  <p className="text-sm">{searchResult.answer}</p>
                </div>
                {searchResult.matches.map((m, i) => (
                  <div key={i} className="border rounded-control p-2 text-xs">
                    <div className="flex justify-between text-muted-foreground mb-0.5">
                      <span>{m.channel}</span>
                      <span>
                        {fmtZoned(new Date(m.at), { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </div>
                    <p>{m.excerpt}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rollup" className="p-4 space-y-3 m-0">
            <div className="flex gap-2">
              {(["week", "month", "quarter", "all"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? "default" : "outline"}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </Button>
              ))}
              <Button
                size="sm"
                onClick={() => rollupM.mutate()}
                disabled={rollupM.isPending}
                className="ml-auto"
              >
                {rollupM.isPending ? "Summarizing" : "Summarize"}
              </Button>
            </div>
            {rollup && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{rollup.events} events</Badge>
                  {rollup.channels.map((c) => (
                    <Badge key={c} variant="secondary">
                      {c}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm leading-relaxed">{rollup.summary}</p>
                {rollup.highlights.length > 0 && (
                  <ul className="text-sm space-y-1 list-disc pl-5">
                    {rollup.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="translate" className="p-4 space-y-3 m-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Target language:</span>
              <Input
                className="w-32"
                value={translateTarget}
                onChange={(e) => setTranslateTarget(e.target.value)}
                placeholder="en"
              />
              <Button
                size="sm"
                onClick={() => translate.mutate()}
                disabled={translate.isPending || !translateSrc}
              >
                {translate.isPending ? "Translating" : "Translate"}
              </Button>
            </div>
            <Textarea
              rows={5}
              placeholder="Paste any message to translate"
              value={translateSrc}
              onChange={(e) => setTranslateSrc(e.target.value)}
            />
            {translateOut && (
              <div className="border rounded-control p-3 bg-muted/30">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-muted-foreground">Translation</span>
                  <Button size="sm" variant="ghost" onClick={() => copy(translateOut)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-sm whitespace-pre-wrap">{translateOut}</p>
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </Card>
  );
}
