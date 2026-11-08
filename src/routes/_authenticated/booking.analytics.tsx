import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker, fromDateString, toDateString } from "@/shared/components";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Download, RefreshCw, Radio } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  getBookingAnalytics,
  exportBookingAnalyticsCsv,
  type BookingAnalytics,
} from "@/lib/booking/analytics.functions";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/booking/analytics")({
  component: AnalyticsPage,
});

const COLORS = [
  "hsl(var(--primary))",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
];

function toIso(date: string, endOfDay = false) {
  const d = new Date(date);
  if (endOfDay) d.setUTCHours(23, 59, 59, 999);
  else d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function AnalyticsPage() {
  const fmtZoned = useZonedDateFormatter();
  const tenantCurrency = useTenantCurrency();
  const runAnalytics = useServerFn(getBookingAnalytics);
  const runExport = useServerFn(exportBookingAnalyticsCsv);

  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 29 * 86_400_000);
  const [from, setFrom] = useState(defaultFrom.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [hostId, setHostId] = useState<string>("");
  const [eventTypeId, setEventTypeId] = useState<string>("");
  const [sourceChannel, setSourceChannel] = useState<string>("all");
  const [data, setData] = useState<BookingAnalytics | null>(null);
  const [live, setLive] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const filterPayload = useMemo(
    () => ({
      from: toIso(from),
      to: toIso(to, true),
      host_id: hostId || undefined,
      event_type_id: eventTypeId || undefined,
      source_channel: sourceChannel === "all" ? undefined : sourceChannel,
    }),
    [from, to, hostId, eventTypeId, sourceChannel],
  );

  const query = useMutation({
    mutationFn: () => runAnalytics({ data: filterPayload }),
    onSuccess: (d) => {
      setData(d);
      setLastUpdate(new Date());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportMut = useMutation({
    mutationFn: () => runExport({ data: filterPayload }),
    onSuccess: (r) => {
      const blob = new Blob([r.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported CSV");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Initial + filter changes
  useEffect(() => {
    query.mutate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [filterPayload]);

  // Realtime dashboard: refetch on booking_appointments changes when enabled
  useEffect(() => {
    if (!live) return;
    const channel = supabase
      .channel("booking-analytics")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_appointments" },
        () => {
          query.mutate();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, filterPayload]);

  const s = data?.summary;
  const currency = s?.currency ?? tenantCurrency;
  const fmtMoney = (n: number) => n.toLocaleString(undefined, { style: "currency", currency });

  return (
    <div className="min-h-screen bg-background">
      <AppTopbar
        title="Booking Analytics"
        subtitle="Reports, KPIs, and realtime activity across every booking channel."
        actions={
          <>
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                Updated {fmtZoned(lastUpdate, { timeStyle: "short" })}
              </span>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link to="/booking">
                <ArrowLeft className="mr-1 size-4" />
                Back
              </Link>
            </Button>
            <ActionBar
              primary={[
                <Button
                  key="refresh"
                  variant="outline"
                  size="sm"
                  onClick={() => query.mutate()}
                  disabled={query.isPending}
                >
                  <RefreshCw className={`mr-1 size-4 ${query.isPending ? "animate-spin" : ""}`} />
                  Refresh
                </Button>,
                <Button
                  key="export"
                  size="sm"
                  onClick={() => exportMut.mutate()}
                  disabled={exportMut.isPending || !data}
                >
                  <Download className="mr-1 size-4" />
                  Export CSV
                </Button>,
              ]}
              overflow={[
                <DropdownMenuItem key="live" onClick={() => setLive((v) => !v)}>
                  <Radio
                    className={`mr-2 size-4 ${live ? "text-emerald-500 animate-pulse" : ""}`}
                  />
                  {live ? "Live" : "Paused"}
                </DropdownMenuItem>,
              ]}
            />
          </>
        }
      />
      <div className="mx-auto max-w-7xl w-full px-4 py-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-5">
            <div className="space-y-1">
              <Label>From</Label>
              <DatePicker value={fromDateString(from)} onChange={(d) => setFrom(toDateString(d))} />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <DatePicker value={fromDateString(to)} onChange={(d) => setTo(toDateString(d))} />
            </div>
            <div className="space-y-1">
              <Label>Host ID</Label>
              <Input
                placeholder="all hosts"
                value={hostId}
                onChange={(e) => setHostId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Event Type ID</Label>
              <Input
                placeholder="all services"
                value={eventTypeId}
                onChange={(e) => setEventTypeId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Source</Label>
              <Select value={sourceChannel} onValueChange={setSourceChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="booking_page">Booking page</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="livechat">Live chat</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <KPI label="Bookings" value={s?.total ?? 0} />
          <KPI label="Completed" value={s?.completed ?? 0} accent="text-emerald-600" />
          <KPI label="Cancelled" value={s?.cancelled ?? 0} accent="text-amber-600" />
          <KPI label="No-shows" value={s?.no_show ?? 0} accent="text-red-600" />
          <KPI label="Rescheduled" value={s?.rescheduled ?? 0} />
          <KPI label="Revenue" value={fmtMoney(s?.revenue ?? 0)} />
          <KPI label="Conversion" value={`${(s?.conversion_rate ?? 0).toFixed(1)}%`} />
          <KPI label="Cancellation" value={`${(s?.cancellation_rate ?? 0).toFixed(1)}%`} />
          <KPI label="No-show rate" value={`${(s?.no_show_rate ?? 0).toFixed(1)}%`} />
          <KPI label="Avg duration" value={`${s?.avg_duration_minutes ?? 0} min`} />
          <KPI label="Utilization" value={`${s?.utilization_pct ?? 0}%`} />
          <KPI
            label="CSAT"
            value={s?.avg_satisfaction != null ? s.avg_satisfaction.toFixed(1) : "—"}
          />
        </div>

        {/* Charts */}
        <Tabs defaultValue="trends" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="duration">Duration</TabsTrigger>
          </TabsList>

          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Bookings over time</CardTitle>
                <CardDescription>Daily total, completed, cancelled and no-shows.</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.by_day ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke={COLORS[0]} strokeWidth={2} />
                    <Line type="monotone" dataKey="completed" stroke={COLORS[1]} strokeWidth={2} />
                    <Line type="monotone" dataKey="cancelled" stroke={COLORS[2]} strokeWidth={2} />
                    <Line type="monotone" dataKey="no_show" stroke={COLORS[3]} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Revenue over time</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.by_day ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmtMoney(v)} />
                    <Bar dataKey="revenue" fill={COLORS[0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="services">
            <Card>
              <CardHeader>
                <CardTitle>Popular services</CardTitle>
                <CardDescription>Ranked by booking volume with revenue.</CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(data?.by_service ?? []).slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill={COLORS[0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table className="mt-4 w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="p-2">Service</th>
                      <th className="p-2">Bookings</th>
                      <th className="p-2">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.by_service ?? []).map((s) => (
                      <tr key={s.event_type_id ?? "none"} className="border-t">
                        <td className="p-2">{s.name}</td>
                        <td className="p-2">{s.count}</td>
                        <td className="p-2">{fmtMoney(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents">
            <Card>
              <CardHeader>
                <CardTitle>Agent performance</CardTitle>
                <CardDescription>Completion, no-shows, revenue, satisfaction.</CardDescription>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="p-2">Agent</th>
                      <th className="p-2">Total</th>
                      <th className="p-2">Completed</th>
                      <th className="p-2">No-shows</th>
                      <th className="p-2">Revenue</th>
                      <th className="p-2">CSAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.by_agent ?? []).map((a) => (
                      <tr key={a.host_id} className="border-t">
                        <td className="p-2 font-medium">{a.name}</td>
                        <td className="p-2">{a.total}</td>
                        <td className="p-2 text-emerald-600">{a.completed}</td>
                        <td className="p-2 text-red-600">{a.no_show}</td>
                        <td className="p-2">{fmtMoney(a.revenue)}</td>
                        <td className="p-2">
                          {a.avg_rating != null ? a.avg_rating.toFixed(1) : "—"}
                        </td>
                      </tr>
                    ))}
                    {(!data || data.by_agent.length === 0) && (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-muted-foreground">
                          No data in range
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sources">
            <Card>
              <CardHeader>
                <CardTitle>Booking sources</CardTitle>
                <CardDescription>Where your bookings come from.</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data?.by_source ?? []}
                      dataKey="count"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      label
                    >
                      {(data?.by_source ?? []).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="duration">
            <Card>
              <CardHeader>
                <CardTitle>Meeting duration distribution</CardTitle>
              </CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.by_duration ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill={COLORS[4]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
