import { formatDistanceToNowStrict } from "date-fns";
import {
  Sparkles,
  Flame,
  Snowflake,
  Sun,
  Target,
  TrendingUp,
  DollarSign,
  ShieldAlert,
  CalendarClock,
  ChevronRight,
  RefreshCw,
  Wand2,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  useLeadQualification,
  type LeadQualification,
  type RecommendedAction,
} from "@/hooks/use-lead-qualification";
import { useTenantCurrency } from "@/hooks/use-currency";

type Props = { leadId: string };

const TEMP_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; className: string; label: string }
> = {
  hot: { icon: Flame, className: "text-red-500 bg-red-500/10 border-red-500/30", label: "Hot" },
  warm: { icon: Sun, className: "text-amber-500 bg-amber-500/10 border-amber-500/30", label: "Warm" },
  cold: { icon: Snowflake, className: "text-sky-500 bg-sky-500/10 border-sky-500/30", label: "Cold" },
};

const PRIORITY_META: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  high: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  urgent: "bg-red-500/15 text-red-600 border-red-500/30",
};

const STAGE_LABEL: Record<string, string> = {
  awareness: "Awareness",
  consideration: "Consideration",
  decision: "Decision",
  purchase: "Purchase",
  retention: "Retention",
  unknown: "Unknown",
};

/** `fallback` is required so a lead without a currency cannot quietly mean dollars. */
function fmtMoney(n: number | null, cur: string | null, fallback: string) {
  if (n == null || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur || fallback,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${cur || "$"}${Math.round(n).toLocaleString()}`;
  }
}

function pct(n: number | null) {
  if (n == null) return null;
  return Math.round(Math.max(0, Math.min(1, n)) * 100);
}

export function LeadQualificationPanel({ leadId }: Props) {
  const { data, isLoading, isFetching, analyze, isAnalyzing } =
    useLeadQualification(leadId);

  return (
    <section className="rounded-control border border-border bg-surface overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-accent/5 via-transparent to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-control bg-accent/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              AI Lead Qualification
              {data?.needsReanalysis && (
                <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-600">
                  Stale
                </Badge>
              )}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {data?.analyzedAt
                ? `Updated ${formatDistanceToNowStrict(new Date(data.analyzedAt))} ago`
                : "Not analyzed yet"}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={data ? "outline" : "default"}
          onClick={() => analyze()}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : data ? (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          ) : (
            <Wand2 className="w-3.5 h-3.5 mr-1.5" />
          )}
          {isAnalyzing ? "Analyzing" : data ? "Re-analyze" : "Analyze lead"}
        </Button>
      </header>

      {isLoading || (isFetching && !data) ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !data ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="mb-1">No AI qualification yet.</p>
          <p className="text-xs">
            Analyze this lead to generate a score, intent, buying stage, and next best actions.
          </p>
        </div>
      ) : (
        <QualificationContent data={data} />
      )}
    </section>
  );
}

function QualificationContent({ data }: { data: LeadQualification }) {
  const tenantCurrency = useTenantCurrency();
  const temp = data.temperature ? TEMP_META[data.temperature] : null;
  const TempIcon = temp?.icon ?? Target;
  const score = data.leadScore ?? 0;
  const interest = pct(data.customerInterest);
  const intent = pct(data.purchaseIntent);
  const dealProb = pct(data.dealProbability);
  const risk = pct(data.riskScore);

  return (
    <div className="p-4 space-y-4">
      {/* Hero: score + temperature */}
      <div className="flex items-stretch gap-3">
        <div className="flex-1 rounded-control border border-border bg-background/50 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Lead score
            </span>
            {data.leadPriority && (
              <Badge
                variant="outline"
                className={cn("text-[11px] capitalize", PRIORITY_META[data.leadPriority])}
              >
                {data.leadPriority}
              </Badge>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-display font-bold ">{score}</span>
            <span className="text-sm text-muted-foreground">/100</span>
          </div>
          <Progress value={score} className="mt-2 h-1.5" />
          {data.scoreRationale && (
            <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">
              {data.scoreRationale}
            </p>
          )}
        </div>
        <div
          className={cn(
            "w-28 rounded-control border p-3 flex flex-col items-center justify-center text-center",
            temp?.className ?? "bg-muted",
          )}
        >
          <TempIcon className="w-6 h-6 mb-1" />
          <div className="text-sm font-semibold">{temp?.label ?? "Unrated"}</div>
          <div className="text-[11px] opacity-75 mt-0.5">
            {data.buyingStage ? STAGE_LABEL[data.buyingStage] : "Stage —"}
          </div>
        </div>
      </div>

      {/* Signal grid */}
      <div className="grid grid-cols-2 gap-2">
        <SignalTile
          icon={Target}
          label="Purchase intent"
          value={intent != null ? `${intent}%` : "—"}
          sublabel={data.purchaseIntentLabel ?? undefined}
          progress={intent}
          tone="accent"
        />
        <SignalTile
          icon={TrendingUp}
          label="Customer interest"
          value={interest != null ? `${interest}%` : "—"}
          progress={interest}
          tone="accent"
        />
        <SignalTile
          icon={CheckCircle2}
          label="Deal probability"
          value={dealProb != null ? `${dealProb}%` : "—"}
          progress={dealProb}
          tone="success"
        />
        <SignalTile
          icon={ShieldAlert}
          label="Risk"
          value={risk != null ? `${risk}%` : "—"}
          progress={risk}
          tone="danger"
        />
      </div>

      {/* Revenue predictions */}
      {(data.revenuePrediction != null || data.clvPrediction != null) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-control border border-border p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide">
              <DollarSign className="w-3 h-3" /> Revenue
            </div>
            <div className="text-lg font-semibold mt-0.5">
              {fmtMoney(data.revenuePrediction, data.revenueCurrency, tenantCurrency)}
            </div>
          </div>
          <div className="rounded-control border border-border p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide">
              <TrendingUp className="w-3 h-3" /> Lifetime value
            </div>
            <div className="text-lg font-semibold mt-0.5">
              {fmtMoney(data.clvPrediction, data.revenueCurrency, tenantCurrency)}
            </div>
          </div>
        </div>
      )}

      {/* Next best action */}
      {data.nextBestAction && (
        <div className="rounded-control border border-accent/40 bg-accent/5 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-accent uppercase mb-1">
            <Sparkles className="w-3 h-3" /> Next best action
          </div>
          <p className="text-sm font-medium">{data.nextBestAction}</p>
          {data.recommendedFollowUpAt && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CalendarClock className="w-3 h-3" />
              Follow up{" "}
              {formatDistanceToNowStrict(new Date(data.recommendedFollowUpAt), {
                addSuffix: true,
              })}
              {data.recommendedFollowUp ? ` — ${data.recommendedFollowUp}` : ""}
            </div>
          )}
        </div>
      )}

      {/* Recommended actions */}
      {data.recommendedActions.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground uppercase mb-2">
            Recommended sales actions
          </h4>
          <ul className="space-y-1.5">
            {data.recommendedActions.map((a, i) => (
              <ActionItem key={i} action={a} />
            ))}
          </ul>
        </div>
      )}

      {/* Interest signals */}
      {data.interestSignals.length > 0 && (
        <>
          <Separator />
          <div>
            <h4 className="text-[11px] font-medium text-muted-foreground uppercase mb-2">
              Interest signals
            </h4>
            <div className="flex flex-wrap gap-1">
              {data.interestSignals.map((s, i) => (
                <Badge key={i} variant="outline" className="text-[11px] font-normal">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Risk reasons */}
      {data.riskReasons.length > 0 && (
        <div className="rounded-control border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-destructive uppercase mb-1.5">
            <AlertTriangle className="w-3 h-3" /> Risk factors
          </div>
          <ul className="space-y-1 text-xs">
            {data.riskReasons.map((r, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-destructive">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Insights */}
      {data.insights.length > 0 && (
        <div className="rounded-control border border-border p-3 bg-muted/30">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase mb-1.5">
            <Lightbulb className="w-3 h-3 text-amber-500" /> Actionable insights
          </div>
          <ul className="space-y-1 text-xs">
            {data.insights.map((s, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-accent">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.model && (
        <p className="text-[11px] text-muted-foreground text-right">
          Generated by {data.model}
        </p>
      )}
    </div>
  );
}

function SignalTile({
  icon: Icon,
  label,
  value,
  sublabel,
  progress,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sublabel?: string;
  progress: number | null;
  tone: "accent" | "success" | "danger";
}) {
  const barColor =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "danger"
      ? "bg-red-500"
      : "bg-accent";
  return (
    <div className="rounded-control border border-border p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-base font-semibold mt-0.5 ">{value}</div>
      {sublabel && (
        <div className="text-[11px] text-muted-foreground truncate">{sublabel}</div>
      )}
      {progress != null && (
        <div className="mt-1.5 h-1 w-full bg-muted rounded overflow-hidden">
          <div
            className={cn("h-full transition-all", barColor)}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function ActionItem({ action }: { action: RecommendedAction }) {
  return (
    <li className="rounded-control border border-border p-2.5 hover:bg-muted/40 transition-colors">
      <div className="flex items-start gap-2">
        <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{action.title}</span>
            {action.priority && (
              <Badge
                variant="outline"
                className={cn("text-[11px] capitalize", PRIORITY_META[action.priority])}
              >
                {action.priority}
              </Badge>
            )}
            {typeof action.due_in_days === "number" && (
              <span className="text-[11px] text-muted-foreground">
                in {action.due_in_days}d
              </span>
            )}
          </div>
          {action.detail && (
            <p className="text-xs text-muted-foreground mt-0.5">{action.detail}</p>
          )}
        </div>
      </div>
    </li>
  );
}
