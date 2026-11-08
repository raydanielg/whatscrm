import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList,
} from "recharts";
import { motion } from "framer-motion";
import {
  TrendingUp, Trophy, XCircle, Clock, Target, ArrowRight, AlertTriangle, Loader2,
} from "lucide-react";
import { usePipelineAnalytics } from "@/hooks/use-pipeline";
import { formatMoney } from "@/hooks/use-deals";
import { useTenantCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";

export function PipelineAnalytics({ pipelineId }: { pipelineId: string | null }) {
  const { data: a, isLoading } = usePipelineAnalytics(pipelineId);
  const tenantCurrency = useTenantCurrency();

  if (isLoading || !a) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Crunching analytics
      </div>
    );
  }

  const currency = a.currency || tenantCurrency;

  const kpis = [
    {
      label: "Win rate",
      value: `${Math.round(a.winRate * 100)}%`,
      hint: `${a.wonDeals} won · ${a.lostDeals} lost`,
      icon: <Trophy className="w-4 h-4 text-emerald-500" />,
      tone: "emerald",
    },
    {
      label: "Avg deal size",
      value: formatMoney(a.avgDealSize, currency),
      hint: `across ${a.wonDeals} won deals`,
      icon: <Target className="w-4 h-4 text-primary" />,
    },
    {
      label: "Weighted forecast",
      value: formatMoney(a.weightedValue, currency),
      hint: `${a.openDeals} open deals`,
      icon: <TrendingUp className="w-4 h-4 text-blue-500" />,
    },
    {
      label: "Avg sales cycle",
      value: a.avgSalesCycleDays == null ? "—" : `${Math.round(a.avgSalesCycleDays)}d`,
      hint: "creation → won",
      icon: <Clock className="w-4 h-4 text-amber-500" />,
    },
    {
      label: "Total won",
      value: formatMoney(a.wonValue, currency),
      hint: `${a.wonDeals} closed`,
      icon: <Trophy className="w-4 h-4 text-emerald-500" />,
      tone: "emerald",
    },
    {
      label: "Lost value",
      value: formatMoney(a.lostValue, currency),
      hint: `${a.lostDeals} deals`,
      icon: <XCircle className="w-4 h-4 text-destructive" />,
      tone: "destructive",
    },
  ];

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <motion.div key={k.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}>
            <Card className="p-3 h-full">
              <div className="flex items-center gap-1.5 text-[11px]  text-muted-foreground">
                {k.icon} {k.label}
              </div>
              <div className={cn(
                "text-lg font-semibold mt-1",
                k.tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
                k.tone === "destructive" && "text-destructive",
              )}>{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.hint}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Sales funnel</h3>
            <span className="text-xs text-muted-foreground">{a.totalDeals} deals tracked</span>
          </div>
          <Funnel data={a.funnel} currency={currency} />
        </Card>

        {/* Value by stage */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Value by stage</h3>
            <span className="text-xs text-muted-foreground">Open pipeline value</span>
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={a.byStage} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <XAxis dataKey="stageName" tick={{ fontSize: 11 }} interval={0}
                  angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => formatMoney(v, currency)}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {a.byStage.map((s) => <Cell key={s.stageId} fill={s.color} />)}
                  <LabelList dataKey="dealCount" position="top" style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Conversion & aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Stage-to-stage conversion</h3>
          <ConversionList
            conversion={a.conversion}
            stages={a.byStage}
          />
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Stage aging</h3>
            <span className="text-xs text-muted-foreground">Average time in stage</span>
          </div>
          <div className="space-y-2">
            {a.byStage.filter((s) => s.dealCount > 0).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No open deals yet.</p>
            )}
            {a.byStage.filter((s) => s.dealCount > 0).map((s) => (
              <div key={s.stageId} className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm flex-1 truncate">{s.stageName}</span>
                <span className="text-sm text-muted-foreground">
                  {s.avgAgeDays == null ? "—" : `${Math.round(s.avgAgeDays)}d`}
                </span>
                {s.stalled > 0 && (
                  <Badge variant="destructive" className="gap-1 text-[11px]">
                    <AlertTriangle className="w-2.5 h-2.5" /> {s.stalled} stalled
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------- Funnel ------------------------------- */

function Funnel({ data, currency }: { data: { stageId: string; stageName: string; color: string; count: number; value: number }[]; currency: string }) {
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.count)), [data]);
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No stages yet.</p>;
  }
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const width = Math.max(8, (d.count / max) * 100);
        const prev = i > 0 ? data[i - 1].count : d.count;
        const conv = i > 0 && prev > 0 ? Math.min(1, d.count / prev) : 1;
        return (
          <motion.div key={d.stageId}
            initial={{ opacity: 0, scaleX: 0.8 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: i * 0.04 }}
            style={{ transformOrigin: "left" }}
            className="flex items-center gap-2"
          >
            <span className="text-xs text-muted-foreground w-24 truncate">{d.stageName}</span>
            <div className="flex-1 relative h-9 rounded-control overflow-hidden bg-muted/40">
              <div
                className="h-full transition-all flex items-center px-2"
                style={{ width: `${width}%`, backgroundColor: `${d.color}30`, borderLeft: `3px solid ${d.color}` }}
              >
                <span className="text-xs font-medium">{d.count}</span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground w-20 text-right hidden sm:inline">
              {formatMoney(d.value, currency)}
            </span>
            {i > 0 && (
              <Badge variant="outline" className="text-[11px] w-14 justify-center">
                {Math.round(conv * 100)}%
              </Badge>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function ConversionList({
  conversion, stages,
}: {
  conversion: { fromStageId: string; toStageId: string; rate: number }[];
  stages: { stageId: string; stageName: string; color: string }[];
}) {
  if (conversion.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Need at least two stages.</p>;
  }
  return (
    <div className="space-y-2">
      {conversion.map((c) => {
        const from = stages.find((s) => s.stageId === c.fromStageId);
        const to = stages.find((s) => s.stageId === c.toStageId);
        const rate = Math.round(c.rate * 100);
        return (
          <div key={`${c.fromStageId}-${c.toStageId}`} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: from?.color }} />
            <span className="text-sm truncate flex-1">{from?.stageName}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: to?.color }} />
            <span className="text-sm truncate flex-1">{to?.stageName}</span>
            <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-primary/60"
                style={{ width: `${rate}%` }} />
            </div>
            <span className="text-sm font-medium w-10 text-right">{rate}%</span>
          </div>
        );
      })}
    </div>
  );
}
