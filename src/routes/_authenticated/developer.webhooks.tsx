import { requireOrgRole } from "@/lib/rbac";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  RefreshCw,
  Copy,
  Trash2,
  PlayCircle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Activity,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import {
  listWebhookEndpoints,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  rotateWebhookSecret,
  testWebhookEndpoint,
  listDeliveries,
  getDeliveryDetail,
  replayDelivery,
  getWebhookStats,
} from "@/lib/webhooks/webhooks.functions";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { AppTopbar } from "@/components/app/app-topbar";
import { DeveloperOrgSwitcher } from "@/components/app/developer/developer-org-switcher";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

const endpointsQO = queryOptions({
  queryKey: ["webhooks", "endpoints"],
  queryFn: () => listWebhookEndpoints(),
});
const statsQO = queryOptions({
  queryKey: ["webhooks", "stats"],
  queryFn: () => getWebhookStats(),
  refetchInterval: 30000,
});

export const Route = createFileRoute("/_authenticated/developer/webhooks")({
  beforeLoad: requireOrgRole("owner", "admin"),
  staticData: { breadcrumb: "Webhooks" },
  head: () => ({
    meta: [
      { title: `Webhooks — ${BRAND_NAME} Developer` },
      {
        name: "description",
        content:
          "Create webhook endpoints, monitor deliveries, replay failed events, and manage signing secrets.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(endpointsQO),
      context.queryClient.ensureQueryData(statsQO),
    ]),
  component: WebhooksPage,
  errorComponent: ({ error }) => (
    <div className="p-6" role="alert">
      <h1 className="font-display text-xl font-semibold">Webhooks</h1>
      <p className="text-sm text-destructive mt-2">{(error as Error).message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function WebhooksPage() {
  return (
    <>
      <AppTopbar
        title="Webhooks"
        subtitle="Manage webhook endpoints, deliveries, and retries."
        actions={
          <div className="flex items-center gap-2">
            <DeveloperOrgSwitcher />
            <CreateEndpointDialog />
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Suspense fallback={<Loader2 className="animate-spin" />}>
          <StatsRow />
        </Suspense>
        <Tabs defaultValue="endpoints">
          <TabsList>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
            <TabsTrigger value="events">Event catalog</TabsTrigger>
          </TabsList>
          <TabsContent value="endpoints" className="mt-4">
            <Suspense fallback={<Loader2 className="animate-spin" />}>
              <EndpointsList />
            </Suspense>
          </TabsContent>
          <TabsContent value="deliveries" className="mt-4">
            <DeliveriesTable />
          </TabsContent>
          <TabsContent value="events" className="mt-4">
            <EventCatalog />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

function StatsRow() {
  const { data } = useSuspenseQuery(statsQO);
  const cards = [
    {
      label: "Success rate (24h)",
      value: `${data.successRate}%`,
      icon: CheckCircle2,
      color: "text-emerald-600",
    },
    { label: "Delivered", value: data.succeeded, icon: Activity, color: "text-primary" },
    { label: "Pending", value: data.pending, icon: Clock, color: "text-amber-600" },
    { label: "Failed", value: data.failed, icon: XCircle, color: "text-destructive" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`w-5 h-5 ${c.color}`} />
              <div>
                <div className="text-2xl font-semibold">{c.value}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function EndpointsList() {
  const { data } = useSuspenseQuery(endpointsQO);
  const qc = useQueryClient();
  const update = useServerFn(updateWebhookEndpoint);
  const del = useServerFn(deleteWebhookEndpoint);
  const rotate = useServerFn(rotateWebhookSecret);
  const test = useServerFn(testWebhookEndpoint);
  const [rotated, setRotated] = useState<string | null>(null);

  if (!data.endpoints.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No webhook endpoints yet. Create one to start receiving events.
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.endpoints.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[280px] truncate">
                    {e.url}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {(e.events as string[]).slice(0, 3).map((ev) => (
                        <Badge key={ev} variant="secondary" className="text-xs">
                          {ev}
                        </Badge>
                      ))}
                      {e.events.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{e.events.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {e.consecutive_failures > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                        <AlertTriangle className="w-3 h-3" /> {e.consecutive_failures} recent
                        failures
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                        <CheckCircle2 className="w-3 h-3" /> Healthy
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={e.status === "active"}
                      onCheckedChange={async (v) => {
                        await update({ data: { id: e.id, status: v ? "active" : "paused" } });
                        qc.invalidateQueries({ queryKey: ["webhooks", "endpoints"] });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Send test event"
                      onClick={async () => {
                        await test({ data: { id: e.id } });
                        toast.success("Test event queued");
                      }}
                    >
                      <PlayCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Rotate signing secret"
                      onClick={async () => {
                        if (!confirm("Rotate signing secret? Existing consumers must update."))
                          return;
                        const r: any = await rotate({ data: { id: e.id } });
                        setRotated(r.signing_secret);
                        qc.invalidateQueries({ queryKey: ["webhooks", "endpoints"] });
                      }}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={async () => {
                        if (!confirm(`Delete "${e.name}"? All history will be removed.`)) return;
                        await del({ data: { id: e.id } });
                        qc.invalidateQueries({ queryKey: ["webhooks", "endpoints"] });
                        toast.success("Endpoint deleted");
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <SecretDialog secret={rotated} onClose={() => setRotated(null)} title="New signing secret" />
    </>
  );
}

function DeliveriesTable() {
  const formatZoned = useZonedDateFormatter();
  const load = useServerFn(listDeliveries);
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["webhooks", "deliveries"],
    queryFn: () => load({ data: {} }),
    refetchInterval: 10000,
  });
  const [detailId, setDetailId] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Recent deliveries</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>HTTP</TableHead>
              <TableHead>Attempt</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Time</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.deliveries ?? []).map((d: any) => (
              <TableRow key={d.id} className="cursor-pointer" onClick={() => setDetailId(d.id)}>
                <TableCell className="font-mono text-xs">{d.event_type}</TableCell>
                <TableCell>
                  <StatusBadge status={d.status} />
                </TableCell>
                <TableCell className="text-xs">{d.response_status ?? "—"}</TableCell>
                <TableCell className="text-xs">{d.attempt}</TableCell>
                <TableCell className="text-xs">
                  {d.duration_ms ? `${d.duration_ms}ms` : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatZoned(new Date(d.created_at), { dateStyle: "short", timeStyle: "medium" })}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            ))}
            {!data?.deliveries.length && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  No deliveries yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      <DeliveryDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: any; label: string; icon: any }> = {
    succeeded: { variant: "default", label: "Succeeded", icon: CheckCircle2 },
    pending: { variant: "secondary", label: "Pending", icon: Clock },
    delivering: { variant: "secondary", label: "Delivering", icon: Loader2 },
    failed: { variant: "destructive", label: "Failed", icon: XCircle },
    dead_letter: { variant: "destructive", label: "Dead letter", icon: XCircle },
    cancelled: { variant: "outline", label: "Cancelled", icon: Ban },
  };
  const it = map[status] ?? { variant: "outline", label: status, icon: Clock };
  const Icon = it.icon;
  return (
    <Badge variant={it.variant} className="gap-1">
      <Icon className="w-3 h-3" />
      {it.label}
    </Badge>
  );
}

function DeliveryDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const get = useServerFn(getDeliveryDetail);
  const replay = useServerFn(replayDelivery);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["webhooks", "delivery", id],
    queryFn: () => get({ data: { id: id! } }),
    enabled: !!id,
  });
  const d = data?.delivery;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Delivery detail</DialogTitle>
          <DialogDescription>
            {d?.event_type} • {d?.event_id}
          </DialogDescription>
        </DialogHeader>
        {d && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <div>
                  <StatusBadge status={d.status} />
                </div>
              </div>
              <div>
                <Label>HTTP status</Label>
                <div>{d.response_status ?? "—"}</div>
              </div>
              <div>
                <Label>Attempt</Label>
                <div>
                  {d.attempt} / {d.max_attempts}
                </div>
              </div>
              <div>
                <Label>Latency</Label>
                <div>{d.duration_ms ?? "—"}ms</div>
              </div>
            </div>
            {d.error_message && (
              <div>
                <Label>Error</Label>
                <div className="rounded-control bg-destructive/10 text-destructive text-xs p-2 font-mono">
                  {d.error_message}
                </div>
              </div>
            )}
            <div>
              <Label>Request payload</Label>
              <pre className="rounded-control bg-muted p-2 text-xs overflow-x-auto max-h-48">
                {JSON.stringify(d.payload, null, 2)}
              </pre>
            </div>
            {d.response_body && (
              <div>
                <Label>Response body</Label>
                <pre className="rounded-control bg-muted p-2 text-xs overflow-x-auto max-h-48">
                  {d.response_body}
                </pre>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {d &&
            (d.status === "dead_letter" || d.status === "failed" || d.status === "succeeded") && (
              <Button
                variant="outline"
                onClick={async () => {
                  await replay({ data: { id: d.id } });
                  qc.invalidateQueries({ queryKey: ["webhooks", "deliveries"] });
                  toast.success("Replay queued");
                  onClose();
                }}
              >
                <RotateCcw className="w-4 h-4" /> Replay event
              </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventCatalog() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Available events</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {WEBHOOK_EVENTS.map((ev) => (
            <div key={ev} className="rounded-control border p-2 text-sm font-mono">
              {ev}
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          Use <code className="font-mono">*</code> to subscribe to every event.
        </div>
      </CardContent>
    </Card>
  );
}

function SecretDialog({
  secret,
  onClose,
  title,
}: {
  secret: string | null;
  onClose: () => void;
  title: string;
}) {
  return (
    <Dialog open={!!secret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Copy this now — it won't be shown again.</DialogDescription>
        </DialogHeader>
        {secret && (
          <div className="rounded-control bg-muted p-3 font-mono text-xs break-all">{secret}</div>
        )}
        <DialogFooter>
          <Button
            onClick={() => {
              if (secret) {
                navigator.clipboard.writeText(secret);
                toast.success("Copied");
              }
              onClose();
            }}
          >
            <Copy className="w-4 h-4" /> Copy and close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateEndpointDialog() {
  const qc = useQueryClient();
  const create = useServerFn(createWebhookEndpoint);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    url: "",
    events: ["*"] as string[],
  });

  const toggle = (ev: string) => {
    setForm((f) => {
      const has = f.events.includes(ev);
      if (ev === "*") return { ...f, events: has ? [] : ["*"] };
      const next = has
        ? f.events.filter((e) => e !== ev)
        : [...f.events.filter((e) => e !== "*"), ev];
      return { ...f, events: next };
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="w-4 h-4" /> New endpoint
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create webhook endpoint</DialogTitle>
            <DialogDescription>
              Events will be POSTed as JSON with an HMAC signature header.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>URL (HTTPS required)</Label>
              <Input
                placeholder="https://api.example.com/wacrm/webhook"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Events</Label>
              <div className="mt-2 border rounded-control p-2 max-h-56 overflow-y-auto space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id="webhook-event-all"
                    checked={form.events.includes("*")}
                    onCheckedChange={() => toggle("*")}
                  />
                  <Label htmlFor="webhook-event-all" className="font-normal">
                    <strong>All events (*)</strong>
                  </Label>
                </div>
                {WEBHOOK_EVENTS.map((ev) => (
                  <div key={ev} className="flex items-center gap-2 text-sm font-mono">
                    <Checkbox
                      id={`webhook-event-${ev}`}
                      disabled={form.events.includes("*")}
                      checked={form.events.includes(ev)}
                      onCheckedChange={() => toggle(ev)}
                    />
                    <Label htmlFor={`webhook-event-${ev}`} className="font-normal font-mono">
                      {ev}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={busy || !form.name || !form.url || !form.events.length}
              onClick={async () => {
                setBusy(true);
                try {
                  const r: any = await create({
                    data: {
                      name: form.name,
                      description: form.description || undefined,
                      url: form.url,
                      events: form.events,
                    },
                  });
                  setIssued(r.signing_secret);
                  setOpen(false);
                  qc.invalidateQueries({ queryKey: ["webhooks", "endpoints"] });
                } catch (e: any) {
                  toast.error(e.message ?? "Failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create endpoint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SecretDialog secret={issued} onClose={() => setIssued(null)} title="Signing secret" />
    </>
  );
}
