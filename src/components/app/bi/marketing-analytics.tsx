import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Send,
  CheckCircle2,
  Eye,
  MessageCircle,
  MousePointerClick,
  Target,
  UserMinus,
  Users,
  TrendingUp,
  DollarSign,
  Trophy,
  Loader2,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMarketingAnalytics } from "@/lib/bi/marketing.functions";
import { useCurrencyFormatter } from "@/hooks/use-currency";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 197 37% 24%))",
  "hsl(var(--chart-4, 43 74% 66%))",
  "hsl(var(--chart-5, 27 87% 67%))",
  "hsl(var(--destructive))",
];

const fmtNum = (n: number) => new Intl.NumberFormat().format(Math.round(n));
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-500"
      : tone === "warning"
        ? "text-amber-500"
        : tone === "destructive"
          ? "text-destructive"
          : "text-primary";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold  mt-1 truncate">{value}</p>
            {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
          </div>
          <Icon className={`h-5 w-5 ${toneClass}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function MarketingAnalytics({ workspaceId }: { workspaceId: string }) {
  // Campaign revenue and spend are the tenant's own money, not dollars.
  const fmtCur = useCurrencyFormatter({ maximumFractionDigits: 0 });
  const [days, setDays] = useState(30);
  const call = useServerFn(getMarketingAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["bi.marketing", workspaceId, days],
    enabled: !!workspaceId,
    queryFn: () => call({ data: { workspaceId, days } }),
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Marketing analytics</h2>
          <p className="text-sm text-muted-foreground">
            Campaign performance, audience growth, revenue and A/B testing for the last {days} days.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard icon={Send} label="Sent" value={fmtNum(t.sent)} hint={`${t.campaigns} campaigns`} />
        <KpiCard icon={CheckCircle2} label="Delivered" value={fmtPct(t.deliveryRate)} hint={fmtNum(t.delivered)} tone="success" />
        <KpiCard icon={Eye} label="Read rate" value={fmtPct(t.readRate)} hint={fmtNum(t.read)} />
        <KpiCard icon={MessageCircle} label="Response rate" value={fmtPct(t.responseRate)} hint={fmtNum(t.replied)} />
        <KpiCard icon={MousePointerClick} label="Click rate" value={fmtPct(t.clickRate)} hint={fmtNum(t.clicked)} />
        <KpiCard icon={Target} label="Conversion" value={fmtPct(t.conversionRate)} tone="success" />
        <KpiCard icon={UserMinus} label="Opt-out rate" value={fmtPct(t.optOutRate)} hint={fmtNum(t.optedOut)} tone={t.optOutRate > 2 ? "warning" : "default"} />
      </div>

      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-6 w-full">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="audience">Audience growth</TabsTrigger>
          <TabsTrigger value="revenue">Revenue & ROI</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="ab">A/B testing</TabsTrigger>
        </TabsList>

        {/* PERFORMANCE */}
        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Delivery, reads & responses over time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={data.performanceTrend}>
                  <defs>
                    {(["sent", "delivered", "read", "replied"] as const).map((k, i) => (
                      <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[i]} stopOpacity={0.5} />
                        <stop offset="95%" stopColor={COLORS[i]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Area type="monotone" dataKey="sent" stroke={COLORS[0]} fill="url(#g-sent)" name="Sent" />
                  <Area type="monotone" dataKey="delivered" stroke={COLORS[1]} fill="url(#g-delivered)" name="Delivered" />
                  <Area type="monotone" dataKey="read" stroke={COLORS[2]} fill="url(#g-read)" name="Read" />
                  <Area type="monotone" dataKey="replied" stroke={COLORS[3]} fill="url(#g-replied)" name="Replied" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Rates over time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.rateTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" dataKey="deliveryRate" stroke={COLORS[1]} name="Delivery" dot={false} />
                  <Line type="monotone" dataKey="readRate" stroke={COLORS[2]} name="Read" dot={false} />
                  <Line type="monotone" dataKey="responseRate" stroke={COLORS[3]} name="Response" dot={false} />
                  <Line type="monotone" dataKey="clickRate" stroke={COLORS[4]} name="Click" dot={false} />
                  <Line type="monotone" dataKey="optOutRate" stroke={COLORS[5]} name="Opt-out" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4" /> Top campaigns</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">Read %</TableHead>
                    <TableHead className="text-right">Response %</TableHead>
                    <TableHead className="text-right">Click %</TableHead>
                    <TableHead className="text-right">Opt-out %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topCampaigns.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No campaigns in this range.</TableCell></TableRow>
                  ) : data.topCampaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                      <TableCell className="text-right ">{fmtNum(c.sent)}</TableCell>
                      <TableCell className="text-right ">{fmtNum(c.delivered)}</TableCell>
                      <TableCell className="text-right ">{fmtPct(c.readRate)}</TableCell>
                      <TableCell className="text-right ">{fmtPct(c.responseRate)}</TableCell>
                      <TableCell className="text-right ">{fmtPct(c.clickRate)}</TableCell>
                      <TableCell className="text-right ">{fmtPct(c.optOutRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AUDIENCE */}
        <TabsContent value="audience" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={Users} label="Active subscribers" value={fmtNum(data.audienceTotals.activeSubscribers)} />
            <KpiCard icon={TrendingUp} label="Opted in" value={fmtNum(data.audienceTotals.optedInPeriod)} tone="success" />
            <KpiCard icon={UserMinus} label="Opted out" value={fmtNum(data.audienceTotals.optedOutPeriod)} tone="warning" />
            <KpiCard icon={Percent} label="Net growth" value={fmtPct(data.audienceTotals.growthRate)} hint={`${data.audienceTotals.netGrowth >= 0 ? "+" : ""}${fmtNum(data.audienceTotals.netGrowth)}`} tone={data.audienceTotals.netGrowth >= 0 ? "success" : "destructive"} />
          </div>
          <Card>
            <CardHeader><CardTitle>Audience growth</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={data.audienceGrowth}>
                  <defs>
                    <linearGradient id="g-cum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Area type="monotone" dataKey="cumulative" stroke={COLORS[0]} fill="url(#g-cum)" name="Cumulative net" />
                  <Bar dataKey="optedIn" fill={COLORS[1]} name="Opt-in" />
                  <Bar dataKey="optedOut" fill={COLORS[5]} name="Opt-out" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* REVENUE */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={DollarSign} label="Revenue" value={fmtCur(t.revenue)} tone="success" />
            <KpiCard icon={DollarSign} label="Spend" value={fmtCur(t.cost)} />
            <KpiCard icon={TrendingUp} label="ROI" value={t.cost > 0 ? fmtPct(t.roi) : "—"} tone={t.roi >= 0 ? "success" : "destructive"} />
            <KpiCard icon={Target} label="Conversions" value={fmtNum(t.replied + t.clicked)} />
          </div>
          <Card>
            <CardHeader><CardTitle>Revenue by campaign</CardTitle></CardHeader>
            <CardContent>
              {data.campaignRevenue.every((c) => c.revenue === 0 && c.cost === 0) ? (
                <p className="text-sm text-muted-foreground">
                  No revenue or spend attribution recorded. Set <code>revenue</code> and <code>cost</code> in a campaign's audience snapshot to populate ROI.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={data.campaignRevenue} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => fmtCur(v as number)} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={140} />
                    <Tooltip formatter={(v: number) => fmtCur(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="revenue" fill={COLORS[1]} name="Revenue" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="cost" fill={COLORS[5]} name="Spend" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>ROI leaderboard</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Conversions</TableHead>
                    <TableHead className="text-right">ROI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.campaignRevenue.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No campaigns to report.</TableCell></TableRow>
                  ) : data.campaignRevenue.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right ">{fmtCur(c.revenue)}</TableCell>
                      <TableCell className="text-right ">{fmtCur(c.cost)}</TableCell>
                      <TableCell className="text-right ">{fmtNum(c.conversions)}</TableCell>
                      <TableCell className="text-right ">
                        <Badge variant={c.roi >= 0 ? "default" : "destructive"}>{c.cost > 0 ? fmtPct(c.roi) : "—"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TEMPLATES */}
        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Template performance</CardTitle></CardHeader>
            <CardContent>
              {data.templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No templated campaigns in this range.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.templates.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} interval={0} angle={-20} height={60} textAnchor="end" />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                      <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="readRate" fill={COLORS[2]} name="Read rate" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="responseRate" fill={COLORS[3]} name="Response rate" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Template</TableHead>
                        <TableHead className="text-right">Campaigns</TableHead>
                        <TableHead className="text-right">Delivered</TableHead>
                        <TableHead className="text-right">Read %</TableHead>
                        <TableHead className="text-right">Response %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.templates.map((t2) => (
                        <TableRow key={t2.id}>
                          <TableCell className="font-medium">{t2.name}</TableCell>
                          <TableCell className="text-right ">{t2.campaigns}</TableCell>
                          <TableCell className="text-right ">{fmtNum(t2.delivered)}</TableCell>
                          <TableCell className="text-right ">{fmtPct(t2.readRate)}</TableCell>
                          <TableCell className="text-right ">{fmtPct(t2.responseRate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEGMENTS */}
        <TabsContent value="segments" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Segment performance</CardTitle></CardHeader>
            <CardContent>
              {data.segments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No segments targeted in this range.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.segments.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} interval={0} angle={-20} height={60} textAnchor="end" />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                      <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="readRate" fill={COLORS[2]} name="Read rate" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="responseRate" fill={COLORS[3]} name="Response rate" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="conversionRate" fill={COLORS[1]} name="Conversion rate" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Segment / list</TableHead>
                        <TableHead className="text-right">Campaigns</TableHead>
                        <TableHead className="text-right">Delivered</TableHead>
                        <TableHead className="text-right">Read %</TableHead>
                        <TableHead className="text-right">Response %</TableHead>
                        <TableHead className="text-right">Conversion %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.segments.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-right ">{s.campaigns}</TableCell>
                          <TableCell className="text-right ">{fmtNum(s.delivered)}</TableCell>
                          <TableCell className="text-right ">{fmtPct(s.readRate)}</TableCell>
                          <TableCell className="text-right ">{fmtPct(s.responseRate)}</TableCell>
                          <TableCell className="text-right ">{fmtPct(s.conversionRate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* A/B TESTING */}
        <TabsContent value="ab" className="space-y-4">
          {data.abTests.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No A/B tests running in this range. Add variants to a campaign to compare performance.
              </CardContent>
            </Card>
          ) : (
            data.abTests.map((test) => (
              <Card key={test.campaignId}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="truncate">{test.campaignName}</span>
                    {test.winnerId ? (
                      <Badge className="gap-1"><Trophy className="h-3 w-3" /> Winner selected · {fmtPct(test.lift)} lift</Badge>
                    ) : (
                      <Badge variant="outline">Running</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={test.variants}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                      <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="readRate" name="Read rate" radius={[4, 4, 0, 0]}>
                        {test.variants.map((v, i) => (
                          <Cell key={v.id} fill={v.isWinner ? COLORS[1] : COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                      <Bar dataKey="responseRate" name="Response rate" fill={COLORS[3]} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="clickRate" name="Click rate" fill={COLORS[4]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variant</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                        <TableHead className="text-right">Sent</TableHead>
                        <TableHead className="text-right">Read %</TableHead>
                        <TableHead className="text-right">Response %</TableHead>
                        <TableHead className="text-right">Click %</TableHead>
                        <TableHead>Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {test.variants.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium">{v.name}</TableCell>
                          <TableCell className="text-right ">{v.weight}%</TableCell>
                          <TableCell className="text-right ">{fmtNum(v.sent)}</TableCell>
                          <TableCell className="text-right ">{fmtPct(v.readRate)}</TableCell>
                          <TableCell className="text-right ">{fmtPct(v.responseRate)}</TableCell>
                          <TableCell className="text-right ">{fmtPct(v.clickRate)}</TableCell>
                          <TableCell>{v.isWinner ? <Badge className="gap-1"><Trophy className="h-3 w-3" /> Winner</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
