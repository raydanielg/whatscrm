import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { satisfactionAnalytics, listResponses, publishReview } from "@/lib/satisfaction/satisfaction.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { useState } from "react";
import { Eye, EyeOff, Smile, Meh, Frown, Star } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/satisfaction/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const analyticsFn = useServerFn(satisfactionAnalytics);
  const responsesFn = useServerFn(listResponses);
  const publishFn = useServerFn(publishReview);
  const qc = useQueryClient();

  const { data: analytics } = useQuery({ queryKey: ["satisfaction-analytics", days], queryFn: () => analyticsFn({ data: { days } }) });
  const { data: reviews = [] } = useQuery({ queryKey: ["satisfaction-reviews"], queryFn: () => responsesFn({ data: { limit: 50 } }) });
  const publish = useMutation({
    mutationFn: (v: { id: string; is_published: boolean }) => publishFn({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["satisfaction-reviews"] }); },
  });

  const a = analytics as { metrics: { total: number; csat_avg: number; csat_pct: number; nps: number; ces_avg: number; promoters: number; passives: number; detractors: number }; trend: Array<{ day: string; csat_avg: number; nps: number; ces_avg: number }>; sentiment: Record<string, number>; recent: Array<{ rating: number | null; nps_score: number | null; comment: string | null; sentiment: string | null; submitted_at: string }> } | undefined;
  const rev = reviews as unknown as Array<{ id: string; rating: number | null; nps_score: number | null; comment: string | null; sentiment: string | null; is_published: boolean; submitted_at: string }>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Satisfaction analytics</h2>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{[7, 14, 30, 60, 90, 180, 365].map((d) => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="CSAT avg" value={a ? a.metrics.csat_avg.toFixed(2) : "–"} sub={a ? `${a.metrics.csat_pct}% satisfied` : ""} icon={Star} />
        <KpiCard label="NPS" value={a ? String(a.metrics.nps) : "–"} sub={a ? `${a.metrics.promoters}P / ${a.metrics.passives}Pa / ${a.metrics.detractors}D` : ""} icon={Smile} />
        <KpiCard label="CES avg" value={a ? a.metrics.ces_avg.toFixed(2) : "–"} sub="1–7 effort" icon={Meh} />
        <KpiCard label="Responses" value={a ? String(a.metrics.total) : "–"} sub={`Last ${days} days`} icon={Frown} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Trend</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={a?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Line dataKey="csat_avg" stroke="hsl(var(--primary))" name="CSAT" />
                <Line dataKey="nps" stroke="#22c55e" name="NPS" />
                <Line dataKey="ces_avg" stroke="#f59e0b" name="CES" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-base">NPS breakdown</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a ? [
                { name: "Promoters", value: a.metrics.promoters, fill: "#22c55e" },
                { name: "Passives", value: a.metrics.passives, fill: "#eab308" },
                { name: "Detractors", value: a.metrics.detractors, fill: "#ef4444" },
              ] : []}>
                <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                <Bar dataKey="value" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card><CardHeader><CardTitle className="text-base">Sentiment</CardTitle></CardHeader>
        <CardContent style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie dataKey="value" data={Object.entries(a?.sentiment ?? {}).map(([k, v]) => ({ name: k, value: v }))} label>
                {Object.keys(a?.sentiment ?? {}).map((k, i) => <Cell key={i} fill={k === "positive" ? "#22c55e" : k === "negative" ? "#ef4444" : "#94a3b8"} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Written reviews</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rev.filter((r) => r.comment).length === 0 && <p className="text-sm text-muted-foreground">No written reviews yet.</p>}
          {rev.filter((r) => r.comment).map((r) => (
            <div key={r.id} className="border-b pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {r.rating != null && <Badge variant="outline">{r.rating}★</Badge>}
                  {r.nps_score != null && <Badge variant="outline">NPS {r.nps_score}</Badge>}
                  {r.sentiment && <Badge variant={r.sentiment === "positive" ? "default" : r.sentiment === "negative" ? "destructive" : "secondary"}>{r.sentiment}</Badge>}
                  <span className="text-xs text-muted-foreground">{format(new Date(r.submitted_at), "MMM d, HH:mm")}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => publish.mutate({ id: r.id, is_published: !r.is_published })}>
                  {r.is_published ? <><Eye className="w-3 h-3 " />Published</> : <><EyeOff className="w-3 h-3 " />Draft</>}
                </Button>
              </div>
              <p className="text-sm mt-1">{r.comment}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: typeof Star }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{label}</p><Icon className="w-4 h-4 text-muted-foreground" /></div>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </CardContent></Card>
  );
}
