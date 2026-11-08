import { formatDistanceToNowStrict } from "date-fns";
import { headerSlotClass } from "@/lib/layout/header-height";

import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  Ban,
  Flame,
  Smile,
  Frown,
  Meh,
  Zap,
  Target,
  Heart,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useConversationIntelligence } from "@/hooks/use-conversation-intelligence";
import type { ConversationInsight } from "@/lib/ai/intelligence.functions";

type Props = {
  conversationId: string;
  onClose?: () => void;
};

export function ConversationIntelligencePanel({ conversationId, onClose }: Props) {
  const { insight, loading, analyzing, analyze } = useConversationIntelligence(conversationId);

  return (
    <aside className="w-full sm:w-96 flex flex-col min-h-0 border-l border-border bg-surface">
      <div className="flex items-center shrink-0 h-12 border-b border-border px-4 justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Intelligence
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1"
            onClick={() => analyze()}
            disabled={analyzing}
          >
            {analyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="text-xs">Analyze</span>
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" className="h-9" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {loading && !insight ? (
            <LoadingState />
          ) : !insight || !insight.summary ? (
            <EmptyState analyzing={analyzing} onAnalyze={() => analyze()} />
          ) : (
            <InsightBody insight={insight} stale={insight.needsReanalysis} />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-3/4" />
    </div>
  );
}

function EmptyState({ analyzing, onAnalyze }: { analyzing: boolean; onAnalyze: () => void }) {
  return (
    <div className="rounded-control border border-dashed border-border p-6 text-center space-y-3">
      <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
      <div className="text-sm font-medium">No analysis yet</div>
      <p className="text-xs text-muted-foreground">
        Generate AI insights: summary, sentiment, intent, urgency, priority, risk, spam
        detection, and topics — all grounded in the conversation transcript and CRM data.
      </p>
      <Button size="sm" onClick={onAnalyze} disabled={analyzing} className="gap-2">
        {analyzing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        Analyze conversation
      </Button>
    </div>
  );
}

function InsightBody({ insight, stale }: { insight: ConversationInsight; stale: boolean }) {
  return (
    <>
      {stale && (
        <div className="rounded-control bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-warning-foreground flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          New messages since last analysis
        </div>
      )}

      {insight.isSpam && (
        <div className="rounded-control bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs flex items-center gap-2">
          <Ban className="h-3.5 w-3.5 text-destructive" />
          <span className="font-medium">Flagged as spam</span>
          {typeof insight.spamScore === "number" && (
            <span className="text-muted-foreground ml-auto">
              {(insight.spamScore * 100).toFixed(0)}%
            </span>
          )}
        </div>
      )}

      {/* Summary */}
      <Section title="Summary">
        <p className="text-sm leading-relaxed">{insight.summary}</p>
        {insight.analyzedAt && (
          <p className="text-xs text-muted-foreground mt-2">
            Analyzed {formatDistanceToNowStrict(new Date(insight.analyzedAt))} ago ·{" "}
            {insight.messagesAnalyzed} messages · {insight.model?.split("/").pop()}
          </p>
        )}
      </Section>

      {/* Key points */}
      {insight.keyPoints.length > 0 && (
        <Section title="Key points">
          <ul className="space-y-1.5">
            {insight.keyPoints.map((kp, i) => (
              <li key={i} className="text-xs flex gap-2">
                <span className="text-primary shrink-0">•</span>
                <span>{kp}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Signals grid */}
      <Section title="Signals">
        <div className="grid grid-cols-2 gap-2">
          <SignalTile
            icon={<SentimentIcon s={insight.sentiment} />}
            label="Sentiment"
            value={insight.sentiment ?? "—"}
            tint={sentimentTint(insight.sentiment)}
          />
          <SignalTile
            icon={<Flame className="h-3.5 w-3.5" />}
            label="Urgency"
            value={insight.urgency ?? "—"}
            tint={urgencyTint(insight.urgency)}
          />
          <SignalTile
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Priority"
            value={insight.priority ?? "—"}
            tint={priorityTint(insight.priority)}
          />
          <SignalTile
            icon={<Target className="h-3.5 w-3.5" />}
            label="Intent"
            value={insight.intent ?? "—"}
          />
          <SignalTile
            icon={<Heart className="h-3.5 w-3.5" />}
            label="Emotion"
            value={insight.emotion ?? "—"}
          />
          <SignalTile
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="Category"
            value={insight.category ?? "—"}
          />
        </div>
      </Section>

      {/* Scores */}
      {(typeof insight.satisfactionScore === "number" ||
        typeof insight.riskScore === "number") && (
        <Section title="Predictions">
          {typeof insight.satisfactionScore === "number" && (
            <ScoreRow
              label="Customer satisfaction"
              value={insight.satisfactionScore}
              accent="success"
              hint={insight.satisfactionPrediction ?? undefined}
            />
          )}
          {typeof insight.riskScore === "number" && (
            <ScoreRow
              label="Risk"
              value={insight.riskScore}
              accent="destructive"
              hint={
                insight.riskReasons.length > 0
                  ? insight.riskReasons.join(" · ")
                  : undefined
              }
            />
          )}
        </Section>
      )}

      {/* Risk reasons */}
      {insight.riskReasons.length > 0 && (
        <Section title="Risk factors" icon={<ShieldAlert className="h-3.5 w-3.5" />}>
          <div className="flex flex-wrap gap-1">
            {insight.riskReasons.map((r, i) => (
              <Badge key={i} variant="outline" className="text-[11px] font-normal">
                {r}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Topics */}
      {insight.topics.length > 0 && (
        <Section title="Topics">
          <div className="flex flex-wrap gap-1">
            {insight.topics.map((t) => (
              <Badge key={t} variant="secondary" className="text-[11px]">
                {t}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {insight.language && (
        <div className="text-xs text-muted-foreground pt-2">
          Detected language: <span className="font-medium">{insight.language}</span>
        </div>
      )}
    </>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      {children}
      <Separator className="mt-4" />
    </div>
  );
}

function SignalTile({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <div className={cn("rounded-control border border-border p-2 space-y-0.5", tint)}>
      <div className="text-[11px]  text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-xs font-medium capitalize truncate">{value}</div>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent: "success" | "destructive";
  hint?: string;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1 mb-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <Progress
        value={pct}
        className={cn("h-1.5", accent === "destructive" && "[&>div]:bg-destructive")}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SentimentIcon({ s }: { s: ConversationInsight["sentiment"] }) {
  if (s === "positive") return <Smile className="h-3.5 w-3.5" />;
  if (s === "negative") return <Frown className="h-3.5 w-3.5" />;
  return <Meh className="h-3.5 w-3.5" />;
}

function sentimentTint(s: ConversationInsight["sentiment"]) {
  if (s === "positive") return "bg-success/5 border-success/30";
  if (s === "negative") return "bg-destructive/5 border-destructive/30";
  if (s === "mixed") return "bg-warning/5 border-warning/30";
  return "";
}
function urgencyTint(u: ConversationInsight["urgency"]) {
  if (u === "critical") return "bg-destructive/5 border-destructive/30";
  if (u === "high") return "bg-warning/5 border-warning/30";
  return "";
}
function priorityTint(p: ConversationInsight["priority"]) {
  if (p === "urgent") return "bg-destructive/5 border-destructive/30";
  if (p === "high") return "bg-warning/5 border-warning/30";
  return "";
}
