import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Zap,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  ThumbsUp,
  DollarSign,
} from "lucide-react";
import {
  usePipelineHealth,
  useLeadPriority,
  useRevenuePrediction,
} from "@/hooks/use-sales-assistant";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useCurrencyFormatter } from "@/hooks/use-currency";

export const Route = createFileRoute("/_authenticated/sales-ai")({
  staticData: { breadcrumb: "AI Sales Assistant" },
  head: () => ({
    meta: [
      { title: "AI Sales Assistant" },
      {
        name: "description",
        content:
          "AI-powered coaching, forecasts, priorities, and pipeline health for your sales team.",
      },
    ],
  }),
  component: SalesAIPage,
});

function SalesAIPage() {
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("quarter");
  const qc = useQueryClient();
  const health = usePipelineHealth();
  const priority = useLeadPriority();
  const revenue = useRevenuePrediction(period);

  const refreshAll = () => qc.invalidateQueries({ queryKey: ["ai-sales"] });

  return (
    <>
      <AppTopbar
        title="AI Sales Assistant"
        subtitle="Continuous AI coaching across your pipeline"
        actions={
          <Button variant="outline" onClick={refreshAll}>
            <RefreshCw className="w-4 h-4" /> Refresh insights
          </Button>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <PipelineHealthCard q={health} />
          <RevenueForecastCard q={revenue} period={period} setPeriod={setPeriod} />
          <QuickMetricsCard />
        </div>

        <LeadPriorityCard q={priority} />
      </div>
    </>
  );
}

function PipelineHealthCard({ q }: { q: ReturnType<typeof usePipelineHealth> }) {
  const statusMap = {
    healthy: { cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20", label: "Healthy" },
    watch: { cls: "text-amber-600 bg-amber-500/10 border-amber-500/20", label: "Watch" },
    at_risk: { cls: "text-red-600 bg-red-500/10 border-red-500/20", label: "At risk" },
  } as const;
  return (
    <Card className="p-5 lg:col-span-1">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-semibold">Pipeline health</h3>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : q.isError ? (
        <p className="text-xs text-destructive">{(q.error as Error)?.message}</p>
      ) : q.data ? (
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold ">{q.data.score}</span>
            <Badge className={cn("border capitalize", statusMap[q.data.status]?.cls)}>
              {statusMap[q.data.status]?.label}
            </Badge>
          </div>
          <Progress value={q.data.score} className="h-2" />
          {q.data.highlights?.length > 0 && (
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1">Highlights</p>
              <ul className="space-y-1">
                {q.data.highlights.slice(0, 3).map((h, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <ThumbsUp className="w-3 h-3 mt-0.5 text-emerald-500 flex-shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {q.data.concerns?.length > 0 && (
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1">Concerns</p>
              <ul className="space-y-1">
                {q.data.concerns.slice(0, 3).map((h, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 mt-0.5 text-orange-500 flex-shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {q.data.recommendations?.length > 0 && (
            <div>
              <p className="text-[11px] uppercase text-muted-foreground mb-1">Recommendations</p>
              <ul className="space-y-1">
                {q.data.recommendations.slice(0, 3).map((h, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <Zap className="w-3 h-3 mt-0.5 text-violet-500 flex-shrink-0" />
                    {h}
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

function RevenueForecastCard({
  q,
  period,
  setPeriod,
}: {
  q: ReturnType<typeof useRevenuePrediction>;
  period: "month" | "quarter" | "year";
  setPeriod: (v: "month" | "quarter" | "year") => void;
}) {
  return (
    <Card className="p-5 lg:col-span-1">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold">Revenue prediction</h3>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="quarter">Quarter</SelectItem>
            <SelectItem value="year">Year</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : q.isError ? (
        <p className="text-xs text-destructive">{(q.error as Error)?.message}</p>
      ) : q.data ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{q.data.periodLabel}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <ForecastBox
              label="Worst"
              value={q.data.worstCase}
              currency={q.data.currency}
              tint="red"
            />
            <ForecastBox
              label="Commit"
              value={q.data.commit}
              currency={q.data.currency}
              tint="blue"
            />
            <ForecastBox
              label="Best"
              value={q.data.bestCase}
              currency={q.data.currency}
              tint="emerald"
            />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{q.data.narrative}</p>
        </div>
      ) : null}
    </Card>
  );
}

function ForecastBox({
  label,
  value,
  currency,
  tint,
}: {
  label: string;
  value: number;
  currency: string;
  tint: "red" | "blue" | "emerald";
}) {
  const money = useCurrencyFormatter({ maximumFractionDigits: 0 });
  const cls = { red: "text-red-600", blue: "text-blue-600", emerald: "text-emerald-600" }[tint];
  return (
    <div className="border rounded-control p-2">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("text-base font-semibold ", cls)}>
        {money(value ?? 0, currency)}
      </div>
    </div>
  );
}

function QuickMetricsCard() {
  return (
    <Card className="p-5 lg:col-span-1">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="w-4 h-4 text-fuchsia-500" />
        <h3 className="text-sm font-semibold">Continuous assistance</h3>
      </div>
      <ul className="space-y-2 text-xs text-muted-foreground">
        <li className="flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 mt-0.5 text-violet-500" /> AI monitors every deal and
          surfaces changes automatically.
        </li>
        <li className="flex items-start gap-2">
          <Zap className="w-3.5 h-3.5 mt-0.5 text-amber-500" /> Next-best-action suggestions update
          as deals progress.
        </li>
        <li className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-orange-500" /> Risk detection alerts you
          before deals stall.
        </li>
        <li className="flex items-start gap-2">
          <TrendingUp className="w-3.5 h-3.5 mt-0.5 text-emerald-500" /> Revenue and probability
          recalculated from live signals.
        </li>
      </ul>
    </Card>
  );
}

function LeadPriorityCard({ q }: { q: ReturnType<typeof useLeadPriority> }) {
  const priorityCls = {
    urgent: "bg-red-500/10 text-red-600 border-red-500/20",
    high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    medium: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    low: "bg-muted text-muted-foreground border-border",
  } as const;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold">Lead priority ranking</h3>
      </div>
      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <p className="text-xs text-destructive">{(q.error as Error)?.message}</p>
      ) : q.data ? (
        <ul className="space-y-2">
          {q.data.ranking?.map((r, i) => (
            <li
              key={r.dealId}
              className="flex items-center gap-3 border rounded-control p-3 hover:bg-muted/30 transition-colors"
            >
              <div className="w-7 h-7 rounded-control bg-muted flex items-center justify-center text-xs font-semibold ">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{r.reason}</p>
              </div>
              <Badge className={cn("border capitalize", priorityCls[r.priority])}>
                {r.priority}
              </Badge>
              <Link
                to="/deals/$dealId"
                params={{ dealId: r.dealId }}
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
