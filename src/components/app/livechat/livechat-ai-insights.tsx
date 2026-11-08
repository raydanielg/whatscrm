/**
 * AI Insights panel for a Live Chat session — surfaces summary, intent,
 * sentiment, lead score, language, topics, product/appointment suggestions,
 * and escalation reason. Sits alongside the conversation in the inbox.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles, Loader2, TrendingUp, Languages, Flame, Snowflake, Thermometer,
  MessageSquareText, AlertTriangle, CalendarClock, Package, RefreshCcw,
} from "lucide-react";
import {
  getLiveChatSessionInsight,
  summarizeLiveChatSession,
} from "@/lib/widget/livechat-ai.functions";

interface Props {
  sessionId: string;
  className?: string;
}

const SENTIMENT_STYLES: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  neutral: "bg-muted text-muted-foreground border-border",
  negative: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  frustrated: "bg-destructive/10 text-destructive border-destructive/30",
};

const INTENT_LABEL: Record<string, string> = {
  greeting: "Greeting",
  question: "General question",
  support_issue: "Support issue",
  sales_inquiry: "Sales inquiry",
  pricing: "Pricing",
  booking: "Booking",
  complaint: "Complaint",
  handoff_request: "Handoff request",
  smalltalk: "Small talk",
  other: "Other",
};

function LeadIcon({ stage }: { stage: string | null }) {
  if (stage === "hot" || stage === "qualified") return <Flame className="h-3.5 w-3.5 text-orange-500" />;
  if (stage === "warm") return <Thermometer className="h-3.5 w-3.5 text-amber-500" />;
  return <Snowflake className="h-3.5 w-3.5 text-sky-500" />;
}

export function LiveChatAiInsights({ sessionId, className }: Props) {
  const qc = useQueryClient();
  const getInsight = useServerFn(getLiveChatSessionInsight);
  const summarize = useServerFn(summarizeLiveChatSession);

  const { data, isLoading } = useQuery({
    queryKey: ["livechat-ai-insight", sessionId],
    queryFn: () => getInsight({ data: { sessionId } }),
    refetchInterval: 15_000,
  });

  const summarizeMutation = useMutation({
    mutationFn: () => summarize({ data: { sessionId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["livechat-ai-insight", sessionId] }),
  });

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-6 text-xs text-muted-foreground ${className ?? ""}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  const empty = !data || (!data.summary && !data.intent && !data.sentiment && !data.leadScore);

  return (
    <aside className={`flex flex-col gap-3 rounded-control border border-border bg-background p-3 text-sm ${className ?? ""}`}>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">AI Insights</h3>
        </div>
        <button
          type="button"
          onClick={() => summarizeMutation.mutate()}
          disabled={summarizeMutation.isPending}
          className="inline-flex items-center gap-1 rounded-control border border-border px-2 py-1 text-xs transition hover:bg-muted disabled:opacity-50"
        >
          {summarizeMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCcw className="h-3 w-3" />
          )}
          Refresh summary
        </button>
      </header>

      {empty && (
        <p className="rounded-control bg-muted/40 p-3 text-xs text-muted-foreground">
          Insights appear once the visitor sends a message. Click "Refresh summary" to force a re-analysis.
        </p>
      )}

      {data?.summary && (
        <section>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground">
            <MessageSquareText className="h-3 w-3" /> Summary
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{data.summary}</p>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2">
        {data?.intent && (
          <Stat label="Intent" value={INTENT_LABEL[data.intent] ?? data.intent} />
        )}
        {data?.sentiment && (
          <div className="rounded-control border border-border bg-muted/30 p-2">
            <div className="text-[11px] uppercase text-muted-foreground">Sentiment</div>
            <span
              className={`mt-1 inline-flex rounded-control border px-2 py-0.5 text-[11px] font-medium capitalize ${
                SENTIMENT_STYLES[data.sentiment] ?? SENTIMENT_STYLES.neutral
              }`}
            >
              {data.sentiment}
            </span>
          </div>
        )}
        {typeof data?.leadScore === "number" && (
          <div className="rounded-control border border-border bg-muted/30 p-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase text-muted-foreground">Lead score</div>
              <LeadIcon stage={data.leadStage} />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-lg font-semibold">{data.leadScore}</span>
              <span className="text-[11px] text-muted-foreground">/ 100</span>
              {data.leadStage && (
                <span className="ml-auto text-[11px] capitalize text-muted-foreground">{data.leadStage}</span>
              )}
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(0, Math.min(100, data.leadScore))}%` }}
              />
            </div>
          </div>
        )}
        {data?.language && (
          <Stat
            label="Language"
            icon={<Languages className="h-3 w-3" />}
            value={data.language.toUpperCase()}
          />
        )}
      </div>

      {data?.topics && data.topics.length > 0 && (
        <section>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground">
            <TrendingUp className="h-3 w-3" /> Topics
          </div>
          <div className="flex flex-wrap gap-1">
            {data.topics.map((t) => (
              <span key={t} className="rounded-control border border-border bg-muted/40 px-2 py-0.5 text-[11px]">
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {data?.recommendations.products && data.recommendations.products.length > 0 && (
        <section>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground">
            <Package className="h-3 w-3" /> Suggested products
          </div>
          <ul className="space-y-0.5 text-xs">
            {data.recommendations.products.map((p) => (
              <li key={p} className="rounded-control bg-muted/30 px-2 py-1">{p}</li>
            ))}
          </ul>
        </section>
      )}

      {data?.recommendations.appointment && (
        <section className="flex items-start gap-2 rounded-control border border-primary/20 bg-primary/5 p-2 text-xs">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div>
            <div className="font-medium">Appointment suggested</div>
            {data.recommendations.appointment.reason && (
              <div className="text-muted-foreground">{data.recommendations.appointment.reason}</div>
            )}
          </div>
        </section>
      )}

      {data?.escalationReason && (
        <section className="flex items-start gap-2 rounded-control border border-destructive/30 bg-destructive/5 p-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <div>
            <div className="font-medium text-destructive">Escalation recommended</div>
            <div className="text-muted-foreground">{data.escalationReason}</div>
          </div>
        </section>
      )}
    </aside>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-control border border-border bg-muted/30 p-2">
      <div className="flex items-center gap-1 text-[11px] uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
