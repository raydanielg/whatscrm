import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Trash2,
  Trophy,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Plus,
  Wand2,
  Loader2,
  TrendingUp,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  useAbVariants,
  useUpsertAbVariant,
  useDeleteAbVariant,
} from "@/hooks/use-marketing-extras";
import { useCampaign } from "@/hooks/use-marketing";
import {
  analyzeAb,
  METRIC_LABEL,
  type AbVariant,
  type MetricKey,
} from "@/hooks/ab-stats";
import {
  declareAbWinner,
  applyAbWinner,
  abTestSuggestions,
} from "@/lib/marketing/ab-testing.functions";

const SPLIT_TYPES = [
  { id: "message", label: "Message copy" },
  { id: "template", label: "Template" },
  { id: "cta", label: "CTA button" },
  { id: "media", label: "Media / creative" },
  { id: "schedule", label: "Send time" },
  { id: "audience", label: "Audience segment" },
] as const;

type SplitType = (typeof SPLIT_TYPES)[number]["id"];

type Hypothesis = {
  title: string;
  rationale: string;
  changes: string[];
  expected_lift_pct?: number;
};

type Suggestion = {
  hypotheses?: Hypothesis[];
  recommended_metric?: string;
  recommended_min_sample?: number;
  notes?: string;
};

export function AbTestingPanel({ campaignId }: { campaignId: string }) {
  const { data: campaign } = useCampaign(campaignId);
  const { data: variants } = useAbVariants(campaignId);
  const upsert = useUpsertAbVariant();
  const del = useDeleteAbVariant();

  const declare = useServerFn(declareAbWinner);
  const apply = useServerFn(applyAbWinner);
  const suggest = useServerFn(abTestSuggestions);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    weight: 50,
    message_body: "",
    media_url: "",
    split_type: "message" as SplitType,
  });
  const [metric, setMetric] = useState<MetricKey>("replied");
  const [mde, setMde] = useState(0.05);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState<Suggestion | null>(null);

  const vars: AbVariant[] = (variants ?? []) as unknown as AbVariant[];
  const analytics = useMemo(() => analyzeAb(vars, metric, mde), [vars, metric, mde]);
  const totalWeight = vars.reduce((s, v) => s + Number(v.weight), 0);
  const weightsOk = totalWeight === 100 || vars.length === 0;

  async function addVariant() {
    if (!campaign) return;
    const suggestedWeight = vars.length === 0 ? 50 : Math.max(0, Math.floor(100 / (vars.length + 1)));
    await upsert.mutateAsync({
      campaign_id: campaignId,
      workspace_id: campaign.workspace_id,
      name: form.name || `Variant ${String.fromCharCode(65 + vars.length)}`,
      weight: form.weight || suggestedWeight,
      message_body: form.message_body || null,
      media_url: form.media_url || null,
    });
    setForm({ name: "", weight: 50, message_body: "", media_url: "", split_type: "message" });
    setCreating(false);
  }

  async function balanceWeights() {
    if (!campaign || vars.length === 0) return;
    const each = Math.floor(100 / vars.length);
    const remainder = 100 - each * vars.length;
    for (let i = 0; i < vars.length; i++) {
      const w = each + (i === 0 ? remainder : 0);
      await upsert.mutateAsync({
        id: vars[i].id,
        campaign_id: campaignId,
        workspace_id: campaign.workspace_id,
        weight: w,
      });
    }
    toast.success("Weights rebalanced to 100%");
  }

  async function runSuggestions() {
    setAiOpen(true);
    setAiLoading(true);
    try {
      const res = (await suggest({ data: { campaignId } })) as Suggestion;
      setAi(res);
    } catch (e) {
      toast.error((e as Error).message);
      setAi(null);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">A/B testing</div>
          <div className="text-xs text-muted-foreground">
            Split traffic across variants — statistical analysis updates in real time.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="delivered">Delivery rate</SelectItem>
              <SelectItem value="read">Read rate</SelectItem>
              <SelectItem value="replied">Reply rate</SelectItem>
              <SelectItem value="clicked">Click rate</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(mde)} onValueChange={(v) => setMde(Number(v))}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.02">Detect ≥ 2 pp</SelectItem>
              <SelectItem value="0.05">Detect ≥ 5 pp</SelectItem>
              <SelectItem value="0.1">Detect ≥ 10 pp</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={runSuggestions}>
            <Sparkles className="w-4 h-4 " /> AI suggestions
          </Button>
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            <Plus className="w-4 h-4 " /> Variant
          </Button>
        </div>
      </div>

      {/* Significance banner */}
      <Card className="p-4">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="text-xs  text-muted-foreground">
              {METRIC_LABEL[metric]} · confidence
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="text-2xl font-semibold">
                {(analytics.confidence * 100).toFixed(1)}%
              </div>
              {analytics.winner ? (
                <Badge className="bg-success/10 text-success border-success/20">
                  <Trophy className="w-3 h-3 " />
                  Winner: {analytics.winner.name}
                </Badge>
              ) : analytics.hasEnoughData ? (
                <Badge variant="outline">Inconclusive</Badge>
              ) : (
                <Badge variant="outline" className="text-warning border-warning/40">
                  <AlertTriangle className="w-3 h-3 " /> More data needed
                </Badge>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="text-xs  text-muted-foreground">Sample</div>
            <div className="mt-1 text-2xl font-semibold ">
              {analytics.totalSent.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              Recommended per variant: {analytics.minSampleRecommended.toLocaleString()}
            </div>
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="text-xs  text-muted-foreground">Weights</div>
            <div className="mt-1 flex items-center gap-2">
              <div className={`text-2xl font-semibold  ${weightsOk ? "" : "text-warning"}`}>
                {totalWeight}%
              </div>
              {!weightsOk && (
                <Button size="sm" variant="outline" onClick={balanceWeights}>
                  Rebalance
                </Button>
              )}
            </div>
          </div>
          {analytics.winner ? (
            <div className="flex-shrink-0">
              <Button
                onClick={async () => {
                  try {
                    await declare({ data: { campaignId, variantId: analytics.winner!.id, metric } });
                    await apply({ data: { campaignId, variantId: analytics.winner!.id } });
                    toast.success("Winner promoted to 100% traffic");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <Wand2 className="w-4 h-4 " /> Auto-optimize
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Creation form */}
      {creating && (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <Input
                placeholder="Variant B"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Split type</label>
              <Select
                value={form.split_type}
                onValueChange={(v) => setForm({ ...form, split_type: v as SplitType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPLIT_TYPES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Weight %</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Message body</label>
            <textarea
              className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm min-h-[100px]"
              value={form.message_body}
              onChange={(e) => setForm({ ...form, message_body: e.target.value })}
              placeholder="Variant-specific copy, CTA text, personalisation"
            />
          </div>
          {(form.split_type === "media" || form.media_url) && (
            <div>
              <label className="text-xs text-muted-foreground">Media URL</label>
              <Input
                value={form.media_url}
                onChange={(e) => setForm({ ...form, media_url: e.target.value })}
                placeholder="https://"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={addVariant} disabled={!campaign || upsert.isPending}>
              {upsert.isPending ? "Adding" : "Add variant"}
            </Button>
          </div>
        </Card>
      )}

      {/* Variants + performance */}
      {vars.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <BarChart3 className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium">No variants yet</div>
          <div className="text-sm text-muted-foreground mt-1">
            Add at least two variants to start an A/B test.
          </div>
        </Card>
      ) : (
        <Tabs defaultValue="cards">
          <TabsList>
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="table">Performance table</TabsTrigger>
          </TabsList>
          <TabsContent value="cards" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vars.map((v) => {
                const a = analytics.variants.find((x) => x.id === v.id);
                if (!a) return null;
                const isBest = analytics.ranking[0]?.id === v.id && analytics.ranking.length > 1;
                return (
                  <Card key={v.id} className={`p-4 ${a.isWinner ? "ring-2 ring-success" : ""}`}>
                    <div className="flex items-start gap-2">
                      <div className={`w-9 h-9 grid place-items-center font-semibold ${
                        a.isWinner ? "bg-success/10 text-success" : "bg-accent/10 text-accent"
                      }`}>
                        {a.isWinner ? <Trophy className="w-4 h-4" /> : v.name[0]?.toUpperCase() ?? "V"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium truncate">{v.name}</div>
                          {isBest && !a.isWinner && (
                            <Badge variant="outline" className="text-xs">
                              <TrendingUp className="w-3 h-3 " /> Leader
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          weight {Number(v.weight)}% · {a.sent.toLocaleString()} sent
                        </div>
                      </div>
                      <button
                        onClick={() => del.mutate({ id: v.id, campaignId })}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {v.message_body && (
                      <div className="text-xs text-muted-foreground mt-2 line-clamp-3 whitespace-pre-wrap">
                        {v.message_body}
                      </div>
                    )}

                    {/* Rate + CI */}
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between">
                        <div className="text-2xl font-semibold ">
                          {(a.rate * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          95% CI [{(a.wilsonLow * 100).toFixed(1)}–{(a.wilsonHigh * 100).toFixed(1)}]
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 bg-muted rounded-full relative">
                        <div
                          className="absolute h-full bg-primary/20 rounded-full"
                          style={{
                            left: `${a.wilsonLow * 100}%`,
                            width: `${Math.max(0.5, (a.wilsonHigh - a.wilsonLow) * 100)}%`,
                          }}
                        />
                        <div
                          className="absolute h-full w-0.5 bg-primary"
                          style={{ left: `${a.rate * 100}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        {a.vsBaselinePct !== null && (
                          <span className={a.vsBaselinePct >= 0 ? "text-success" : "text-destructive"}>
                            {a.vsBaselinePct >= 0 ? "+" : ""}
                            {a.vsBaselinePct.toFixed(1)}% vs A
                          </span>
                        )}
                        {a.pValue !== null && (
                          <span className="text-muted-foreground">
                            p={a.pValue.toFixed(3)}
                            {a.significant && <CheckCircle2 className="inline w-3 h-3 ml-1 text-success" />}
                          </span>
                        )}
                        {!a.sampleSufficient && (
                          <span className="text-warning inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Low sample
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                      <Metric label="Sent" v={v.sent_count} />
                      <Metric label="Delivered" v={v.delivered_count} />
                      <Metric label="Read" v={v.read_count} />
                      <Metric label="Replied" v={v.replied_count} />
                    </div>

                    {!a.isWinner && analytics.hasEnoughData && a.significant && a.vsBaselinePct !== null && a.vsBaselinePct > 0 && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await declare({ data: { campaignId, variantId: v.id, metric } });
                              toast.success("Marked as winner");
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          <Trophy className="w-3 h-3 " /> Declare winner
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>
          <TabsContent value="table" className="mt-4">
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs  text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5">Variant</th>
                    <th className="text-right px-4 py-2.5">Sent</th>
                    <th className="text-right px-4 py-2.5">Delivered</th>
                    <th className="text-right px-4 py-2.5">Read</th>
                    <th className="text-right px-4 py-2.5">Replied</th>
                    <th className="text-right px-4 py-2.5">Clicked</th>
                    <th className="text-right px-4 py-2.5">Rate</th>
                    <th className="text-right px-4 py-2.5">95% CI</th>
                    <th className="text-right px-4 py-2.5">vs A</th>
                    <th className="text-right px-4 py-2.5">p-value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vars.map((v) => {
                    const a = analytics.variants.find((x) => x.id === v.id);
                    if (!a) return null;
                    return (
                      <tr key={v.id} className={a.isWinner ? "bg-success/5" : ""}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {a.isWinner && <Trophy className="w-3.5 h-3.5 text-success" />}
                            <span className="font-medium">{v.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right ">{v.sent_count.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right ">{v.delivered_count.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right ">{v.read_count.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right ">{v.replied_count.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right ">{v.clicked_count.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right  font-medium">{(a.rate * 100).toFixed(2)}%</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground text-xs ">
                          {(a.wilsonLow * 100).toFixed(1)}–{(a.wilsonHigh * 100).toFixed(1)}
                        </td>
                        <td className={`px-4 py-2.5 text-right  ${a.vsBaselinePct !== null && a.vsBaselinePct > 0 ? "text-success" : a.vsBaselinePct !== null && a.vsBaselinePct < 0 ? "text-destructive" : ""}`}>
                          {a.vsBaselinePct === null ? "—" : `${a.vsBaselinePct >= 0 ? "+" : ""}${a.vsBaselinePct.toFixed(1)}%`}
                        </td>
                        <td className="px-4 py-2.5 text-right ">
                          {a.pValue === null ? "—" : a.pValue.toFixed(3)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* AI suggestions drawer */}
      {aiOpen && (
        <Card className="p-5 border-primary/30 bg-primary/5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <div className="font-medium">AI recommendations</div>
            </div>
            <button
              onClick={() => setAiOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Analyzing variants
            </div>
          ) : ai ? (
            <div className="space-y-3">
              {ai.recommended_metric && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" /> Recommended metric: {ai.recommended_metric}
                  {ai.recommended_min_sample ? ` · min sample ${ai.recommended_min_sample}` : ""}
                </div>
              )}
              {(ai.hypotheses ?? []).map((h, i) => (
                <div key={i} className="rounded-control border border-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{h.title}</div>
                    {typeof h.expected_lift_pct === "number" && (
                      <Badge variant="outline" className="text-xs text-success border-success/30">
                        +{h.expected_lift_pct}% est.
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{h.rationale}</div>
                  {h.changes?.length ? (
                    <ul className="text-xs mt-2 list-disc pl-4 space-y-0.5">
                      {h.changes.map((c, j) => <li key={j}>{c}</li>)}
                    </ul>
                  ) : null}
                </div>
              ))}
              {ai.notes && (
                <div className="text-xs text-muted-foreground whitespace-pre-wrap">{ai.notes}</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No suggestions available.</div>
          )}
        </Card>
      )}
    </div>
  );
}

function Metric({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="text-sm font-semibold ">{v.toLocaleString()}</div>
      <div className="text-[11px]  text-muted-foreground">{label}</div>
    </div>
  );
}
