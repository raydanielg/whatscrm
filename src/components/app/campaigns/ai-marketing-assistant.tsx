import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Wand2,
  ShieldAlert,
  Users,
  Clock,
  LineChart,
  Repeat2,
  Loader2,
  Copy as CopyIcon,
  Check,
  ChevronRight,
} from "lucide-react";
import {
  generateCampaignCopy,
  rewriteMessage,
  scoreContent,
  recommendAudience,
  suggestSendTime,
  analyzeCampaignPerformance,
  generateFollowUp,
  type CopyVariant,
  type ContentScore,
} from "@/lib/marketing/ai-assistant.functions";
import { useCampaign } from "@/hooks/use-marketing";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Tab = "copy" | "rewrite" | "score" | "audience" | "timing" | "analyze" | "followup";

const TABS: Array<{ id: Tab; label: string; icon: typeof Sparkles }> = [
  { id: "copy", label: "Copy generator", icon: Sparkles },
  { id: "rewrite", label: "Rewrite", icon: Wand2 },
  { id: "score", label: "Score & spam", icon: ShieldAlert },
  { id: "audience", label: "Audience", icon: Users },
  { id: "timing", label: "Best time", icon: Clock },
  { id: "analyze", label: "Performance", icon: LineChart },
  { id: "followup", label: "Follow-up", icon: Repeat2 },
];

export function AiMarketingAssistant({ campaignId }: { campaignId?: string }) {
  const [tab, setTab] = useState<Tab>(campaignId ? "analyze" : "copy");
  return (
    <div className="rounded-control border border-border bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-gradient-to-r from-primary/10 via-transparent to-transparent">
        <Sparkles className="w-4 h-4 text-primary" />
        <div className="font-medium">AI marketing assistant</div>
        <div className="ml-auto text-xs text-muted-foreground">Continuously optimizes campaigns</div>
      </div>
      <div className="border-b border-border">
        <ScrollArea orientation="horizontal" type="hover" className="w-full">
          <div className="flex w-max">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-xs flex items-center gap-1.5 border-b-2 whitespace-nowrap transition rounded-none ${
                    active
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
      <div className="p-4">
        {tab === "copy" && <CopyGenerator campaignId={campaignId} />}
        {tab === "rewrite" && <RewritePanel campaignId={campaignId} />}
        {tab === "score" && <ScorePanel campaignId={campaignId} />}
        {tab === "audience" && <AudiencePanel />}
        {tab === "timing" && <TimingPanel campaignId={campaignId} />}
        {tab === "analyze" && <AnalyzePanel campaignId={campaignId} />}
        {tab === "followup" && <FollowUpPanel campaignId={campaignId} />}
      </div>
    </div>
  );
}

/* -------- Shared helpers -------- */

function useCopyToClipboard() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };
  return { copied, copy };
}

function RunButton({
  onClick,
  loading,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
      {children}
    </button>
  );
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="mt-3 rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {error}
    </div>
  );
}

function Bar({ value, tone = "primary" }: { value: number; tone?: "primary" | "warn" | "danger" }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    tone === "danger" ? "bg-destructive" : tone === "warn" ? "bg-warning" : "bg-primary";
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/* -------- Copy generator -------- */

function CopyGenerator({ campaignId }: { campaignId?: string }) {
  const { data: campaign } = useCampaign(campaignId ?? "");
  const gen = useServerFn(generateCampaignCopy);
  const [goal, setGoal] = useState<string>(((campaign as any)?.goal as string) ?? "");
  const [tone, setTone] = useState<"friendly" | "professional" | "urgent" | "playful" | "luxury" | "neutral">(
    "friendly",
  );
  const [product, setProduct] = useState("");
  const [count, setCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<CopyVariant[]>([]);
  const { copied, copy } = useCopyToClipboard();

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await gen({
        data: { campaignId, goal, tone, productContext: product, count },
      });
      setVariants(res.variants ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Goal">
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Drive Black Friday pre-orders"
            className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm"
          />
        </Field>
        <Field label="Tone">
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as typeof tone)}
            className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm"
          >
            {["friendly", "professional", "urgent", "playful", "luxury", "neutral"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Product / offer context" className="md:col-span-2">
          <textarea
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            rows={2}
            placeholder="What are you promoting? Any offer / benefits?"
            className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm"
          />
        </Field>
        <Field label="Variants">
          <input
            type="number"
            min={1}
            max={6}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
            className="w-24 px-3 py-2 rounded-control border border-border bg-background text-sm"
          />
        </Field>
      </div>
      <div className="mt-3">
        <RunButton onClick={run} loading={loading}>
          Generate copy
        </RunButton>
      </div>
      <ErrorBanner error={error} />
      <div className="mt-4 space-y-3">
        {variants.map((v, i) => (
          <div key={i} className="rounded-control border border-border p-3 bg-background/60">
            <div className="flex items-center justify-between">
              <div className="text-xs  text-muted-foreground">
                Variant {i + 1}
              </div>
              <button
                onClick={() =>
                  copy(`${v.headline}\n\n${v.body}\n\nCTA: ${v.cta}`, `v-${i}`)
                }
                className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                {copied === `v-${i}` ? (
                  <>
                    <Check className="w-3 h-3" /> Copied
                  </>
                ) : (
                  <>
                    <CopyIcon className="w-3 h-3" /> Copy
                  </>
                )}
              </button>
            </div>
            <div className="mt-1 font-medium text-sm">{v.headline}</div>
            {v.hook && <div className="mt-1 text-xs text-muted-foreground italic">{v.hook}</div>}
            <div className="mt-2 whitespace-pre-wrap text-sm">{v.body}</div>
            <div className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-control bg-primary/10 text-primary">
              <ChevronRight className="w-3 h-3" /> {v.cta}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------- Rewrite -------- */

function RewritePanel({ campaignId }: { campaignId?: string }) {
  const { data: campaign } = useCampaign(campaignId ?? "");
  const fn = useServerFn(rewriteMessage);
  const [msg, setMsg] = useState(campaign?.message_body ?? "");
  const [instruction, setInstruction] = useState("Make it shorter and more compelling.");
  const [length, setLength] = useState<"shorter" | "same" | "longer">("shorter");
  const [tone, setTone] = useState("friendly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ rewritten: string; changes: string[]; reasoning: string } | null>(
    null,
  );

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fn({
        data: { message: msg, instruction, targetLength: length, tone },
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <Field label="Original">
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm"
          />
        </Field>
        <Field label="Instruction">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Length">
            <select
              value={length}
              onChange={(e) => setLength(e.target.value as typeof length)}
              className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm"
            >
              <option value="shorter">Shorter</option>
              <option value="same">Same</option>
              <option value="longer">Longer</option>
            </select>
          </Field>
          <Field label="Tone">
            <input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm"
            />
          </Field>
        </div>
        <RunButton onClick={run} loading={loading}>
          Rewrite
        </RunButton>
        <ErrorBanner error={error} />
      </div>
      <div>
        <Field label="Rewritten">
          <div className="min-h-[160px] px-3 py-2 rounded-control border border-border bg-background text-sm whitespace-pre-wrap">
            {result?.rewritten ?? (
              <span className="text-muted-foreground">Output appears here.</span>
            )}
          </div>
        </Field>
        {result?.changes?.length ? (
          <div className="mt-3">
            <div className="text-xs  text-muted-foreground mb-1">
              Changes
            </div>
            <ul className="list-disc pl-5 text-sm space-y-0.5">
              {result.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* -------- Score -------- */

function ScorePanel({ campaignId }: { campaignId?: string }) {
  const { data: campaign } = useCampaign(campaignId ?? "");
  const fn = useServerFn(scoreContent);
  const [msg, setMsg] = useState(campaign?.message_body ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<ContentScore | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setScore(await fn({ data: { message: msg } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Field label="Message to score">
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm"
        />
      </Field>
      <div className="mt-3">
        <RunButton onClick={run} loading={loading}>
          Analyze content
        </RunButton>
      </div>
      <ErrorBanner error={error} />
      {score && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <MetricRow label="Overall" value={score.overall_score} />
            <MetricRow label="Clarity" value={score.clarity} />
            <MetricRow label="Persuasion" value={score.persuasiveness} />
            <MetricRow label="Brand safety" value={score.brand_safety} />
            <MetricRow
              label="Spam risk"
              value={score.spam_risk}
              tone={score.spam_risk > 60 ? "danger" : score.spam_risk > 30 ? "warn" : "primary"}
              invert
            />
          </div>
          <div className="space-y-3 text-sm">
            {score.spam_signals?.length > 0 && (
              <Bullets title="Spam signals" items={score.spam_signals} tone="danger" />
            )}
            {score.strengths?.length > 0 && (
              <Bullets title="Strengths" items={score.strengths} tone="primary" />
            )}
            {score.weaknesses?.length > 0 && (
              <Bullets title="Weaknesses" items={score.weaknesses} tone="warn" />
            )}
            {score.suggestions?.length > 0 && (
              <Bullets title="Suggestions" items={score.suggestions} tone="primary" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({
  label,
  value,
  tone = "primary",
  invert = false,
}: {
  label: string;
  value: number;
  tone?: "primary" | "warn" | "danger";
  invert?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className=" font-medium">
          {value}
          {invert ? " risk" : "/100"}
        </span>
      </div>
      <Bar value={value} tone={tone} />
    </div>
  );
}

function Bullets({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "primary" | "warn" | "danger";
}) {
  const color =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-primary";
  return (
    <div>
      <div className={`text-xs  mb-1 ${color}`}>{title}</div>
      <ul className="list-disc pl-5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

/* -------- Audience -------- */

function AudiencePanel() {
  const fn = useServerFn(recommendAudience);
  const [goal, setGoal] = useState("");
  const [product, setProduct] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await fn({ data: { goal, productContext: product } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Campaign goal">
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Re-engage churned customers"
            className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm"
          />
        </Field>
        <Field label="Product / offer">
          <input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm"
          />
        </Field>
      </div>
      <div className="mt-3">
        <RunButton onClick={run} loading={loading}>
          Recommend audiences
        </RunButton>
      </div>
      <ErrorBanner error={error} />
      {result && (
        <div className="mt-4 space-y-3">
          {(result.segments ?? []).map((s: any, i: number) => (
            <div key={i} className="rounded-control border border-border p-3 bg-background/60">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{s.name}</div>
                <span className="text-xs px-2 py-0.5 rounded-control bg-muted">
                  {s.estimated_size_bucket}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{s.description}</div>
              {s.filters?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.filters.map((f: any, j: number) => (
                    <span
                      key={j}
                      className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted"
                    >
                      {f.field} {f.op} {String(f.value)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {(result.suggested_lists ?? []).length > 0 && (
            <div className="rounded-control border border-border p-3">
              <div className="text-xs  text-muted-foreground mb-1">
                Suggested existing lists
              </div>
              <ul className="text-sm space-y-1">
                {result.suggested_lists.map((l: any, i: number) => (
                  <li key={i}>
                    <span className="font-mono text-xs">{l.list_id}</span> —{" "}
                    <span className="text-muted-foreground">{l.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.notes && (
            <div className="text-xs text-muted-foreground">{result.notes}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------- Timing -------- */

function TimingPanel({ campaignId }: { campaignId?: string }) {
  const fn = useServerFn(suggestSendTime);
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await fn({ data: { campaignId, audienceTimezone: tz } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      <Field label="Audience timezone">
        <input
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className="w-full px-3 py-2 rounded-control border border-border bg-background text-sm"
        />
      </Field>
      <div className="mt-3">
        <RunButton onClick={run} loading={loading}>
          Suggest send time
        </RunButton>
      </div>
      <ErrorBanner error={error} />
      {result && (
        <div className="mt-4 space-y-3">
          {result.next_recommended_iso && (
            <div className="rounded-control border border-primary/40 bg-primary/5 p-3">
              <div className="text-xs  text-primary mb-1">
                Next recommended send
              </div>
              <div className="text-lg font-semibold">
                {new Date(result.next_recommended_iso).toLocaleString()}
              </div>
            </div>
          )}
          {(result.best_windows ?? []).map((w: any, i: number) => (
            <div key={i} className="rounded-control border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">
                  {days[w.day_of_week] ?? "Any"} · {w.start_hour_local}:00 – {w.end_hour_local}:00
                </div>
                <span className="text-xs text-muted-foreground">
                  confidence {Math.round((w.confidence ?? 0) * 100)}%
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{w.rationale}</div>
            </div>
          ))}
          {(result.avoid_windows ?? []).length > 0 && (
            <div className="text-xs text-muted-foreground">
              Avoid: {result.avoid_windows.join(", ")}
            </div>
          )}
          {result.notes && <div className="text-xs text-muted-foreground">{result.notes}</div>}
        </div>
      )}
    </div>
  );
}

/* -------- Performance analysis -------- */

function AnalyzePanel({ campaignId }: { campaignId?: string }) {
  const fn = useServerFn(analyzeCampaignPerformance);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  if (!campaignId) {
    return (
      <div className="text-sm text-muted-foreground">
        Open a specific campaign to analyze its performance.
      </div>
    );
  }

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await fn({ data: { campaignId: campaignId! } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const healthColor: Record<string, string> = {
    excellent: "bg-success text-success-foreground",
    good: "bg-primary text-primary-foreground",
    fair: "bg-warning text-warning-foreground",
    poor: "bg-destructive text-destructive-foreground",
  };

  return (
    <div>
      <RunButton onClick={run} loading={loading}>
        Analyze performance
      </RunButton>
      <ErrorBanner error={error} />
      {result && (
        <div className="mt-4 space-y-4">
          <div className="rounded-control border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs  text-muted-foreground">Health</span>
              <span className={`text-xs px-2 py-0.5 rounded-control ${healthColor[result.health] ?? "bg-muted"}`}>
                {result.health}
              </span>
            </div>
            <div className="mt-2 text-sm">{result.summary}</div>
          </div>
          {(result.insights ?? []).length > 0 && (
            <Bullets title="Insights" items={result.insights} tone="primary" />
          )}
          {(result.strengths ?? []).length > 0 && (
            <Bullets title="Strengths" items={result.strengths} tone="primary" />
          )}
          {(result.risks ?? []).length > 0 && (
            <Bullets title="Risks" items={result.risks} tone="danger" />
          )}
          {(result.improvements ?? []).length > 0 && (
            <div>
              <div className="text-xs  text-primary mb-1">
                Improvement plan
              </div>
              <div className="space-y-2">
                {result.improvements.map((imp: any, i: number) => (
                  <div key={i} className="rounded-control border border-border p-3">
                    <div className="font-medium text-sm">{imp.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{imp.action}</div>
                    {imp.expected_impact && (
                      <div className="mt-1 text-xs text-primary">
                        Expected impact: {imp.expected_impact}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(result.next_best_actions ?? []).length > 0 && (
            <Bullets title="Next best actions" items={result.next_best_actions} tone="primary" />
          )}
        </div>
      )}
    </div>
  );
}

/* -------- Follow-up -------- */

function FollowUpPanel({ campaignId }: { campaignId?: string }) {
  const fn = useServerFn(generateFollowUp);
  const [segment, setSegment] = useState<
    "not_read" | "read_no_reply" | "clicked_no_convert" | "all_engaged"
  >("read_no_reply");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  if (!campaignId) {
    return (
      <div className="text-sm text-muted-foreground">
        Open a specific campaign to generate a follow-up.
      </div>
    );
  }

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await fn({ data: { campaignId: campaignId!, segment } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Field label="Target segment">
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value as typeof segment)}
          className="w-full md:w-72 px-3 py-2 rounded-control border border-border bg-background text-sm"
        >
          <option value="not_read">Did not read</option>
          <option value="read_no_reply">Read, did not reply</option>
          <option value="clicked_no_convert">Clicked, did not convert</option>
          <option value="all_engaged">All engaged</option>
        </select>
      </Field>
      <div className="mt-3">
        <RunButton onClick={run} loading={loading}>
          Draft follow-up campaign
        </RunButton>
      </div>
      <ErrorBanner error={error} />
      {result && (
        <div className="mt-4 rounded-control border border-border p-4 space-y-3">
          <div>
            <div className="text-xs  text-muted-foreground">Name</div>
            <div className="font-medium">{result.name}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Goal</div>
              <div>{result.goal}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Send after</div>
              <div>{result.timing_offset_hours}h</div>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Segment</div>
            <div className="text-sm">{result.segment_description}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Message</div>
            <div className="mt-1 whitespace-pre-wrap font-mono text-sm rounded-control border border-border bg-background px-3 py-2">
              {result.message_body}
            </div>
          </div>
          {result.cta && (
            <div className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-control bg-primary/10 text-primary">
              <ChevronRight className="w-3 h-3" /> {result.cta}
            </div>
          )}
          {result.rationale && (
            <div className="text-xs text-muted-foreground italic">{result.rationale}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------- Field -------- */

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <div className="text-xs  text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
