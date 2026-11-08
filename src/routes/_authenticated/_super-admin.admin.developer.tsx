import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  KeyRound,
  Webhook,
  ShieldAlert,
  Activity,
  RotateCcw,
  Ban,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  getDeveloperOverview,
  revokeApiKey,
  retryWebhookEvent,
} from "@/lib/admin/developer.functions";

const devOverviewQO = queryOptions({
  queryKey: ["admin", "developer", "overview"],
  queryFn: () => getDeveloperOverview(),
});

export const Route = createFileRoute("/_authenticated/_super-admin/admin/developer")({
  loader: ({ context }) => context.queryClient.ensureQueryData(devOverviewQO),
  component: DeveloperPage,
  errorComponent: ({ error }) => (
    <AdminPageShell title="Developer Tools" description="Failed to load">
      <div role="alert" className="text-sm text-destructive">
        {(error as Error).message}
      </div>
    </AdminPageShell>
  ),
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function DeveloperPage() {
  return (
    <AdminPageShell
      title="Developer Tools"
      description="API keys, webhooks, and third-party integration surface for platform operators."
    >
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading</div>}>
        <DeveloperInner />
      </Suspense>
    </AdminPageShell>
  );
}

function DeveloperInner() {
  const { data } = useSuspenseQuery(devOverviewQO);
  const qc = useQueryClient();
  const router = useRouter();
  const revoke = useServerFn(revokeApiKey);
  const retry = useServerFn(retryWebhookEvent);

  const EVENTS_PAGE_SIZE = 10;
  const [eventsPage, setEventsPage] = useState(1);
  const eventsTotalPages = Math.max(1, Math.ceil(data.webhookEvents.length / EVENTS_PAGE_SIZE));
  const eventsSafePage = Math.min(eventsPage, eventsTotalPages);
  const pagedWebhookEvents = data.webhookEvents.slice(
    (eventsSafePage - 1) * EVENTS_PAGE_SIZE,
    eventsSafePage * EVENTS_PAGE_SIZE,
  );

  async function handleRevoke(id: string) {
    try {
      await revoke({ data: { id } });
      toast.success("API key revoked");
      await qc.invalidateQueries({ queryKey: ["admin", "developer"] });
      await router.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to revoke");
    }
  }

  async function handleRetry(id: string) {
    try {
      await retry({ data: { id } });
      toast.success("Webhook queued for retry");
      await qc.invalidateQueries({ queryKey: ["admin", "developer"] });
      await router.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to retry");
    }
  }

  const s = data.stats;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={KeyRound}
          label="Active API keys"
          value={s.activeKeys}
          sub={`${s.totalKeys} total`}
        />
        <Stat
          icon={ShieldAlert}
          label="Signing secrets"
          value={s.signingSecrets}
          sub="webhook rotation"
        />
        <Stat icon={Webhook} label="Recent events" value={s.recentEvents} sub="last 100" />
        <Stat
          icon={Activity}
          label="Failing webhooks"
          value={s.failedWebhooks}
          sub={`${s.invalidSignatures} bad sig`}
          tone={s.failedWebhooks > 0 ? "danger" : "ok"}
        />
      </div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="secrets">Signing Secrets</TabsTrigger>
          <TabsTrigger value="events">Webhook Events</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Platform API keys</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Scopes</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.apiKeys.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No API keys issued yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.apiKeys.map((k: any) => {
                    const revoked = !!k.revoked_at;
                    const expired = k.expires_at && new Date(k.expires_at) < new Date();
                    return (
                      <TableRow key={k.id}>
                        <TableCell className="font-medium">{k.name}</TableCell>
                        <TableCell className="font-mono text-xs">{k.prefix}</TableCell>
                        <TableCell className="text-xs">
                          {(k.scopes ?? []).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}
                        </TableCell>
                        <TableCell>
                          {revoked ? (
                            <Badge variant="destructive">Revoked</Badge>
                          ) : expired ? (
                            <Badge variant="secondary">Expired</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!revoked && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRevoke(k.id)}
                              aria-label={`Revoke ${k.name}`}
                            >
                              <Ban className="w-3.5 h-3.5 " /> Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="secrets" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Webhook signing secrets</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Primary</TableHead>
                    <TableHead>Activated</TableHead>
                    <TableHead>Retired</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.signingSecrets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No signing secrets provisioned.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.signingSecrets.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.secret_prefix}</TableCell>
                      <TableCell>
                        {s.is_primary ? (
                          <Badge>Primary</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Rotational</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.activated_at ? new Date(s.activated_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.retired_at ? (
                          new Date(s.retired_at).toLocaleString()
                        ) : (
                          <span className="text-emerald-600">Active</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent webhook events</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Signature</TableHead>
                    <TableHead>Processed</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.webhookEvents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No recent webhook events.
                      </TableCell>
                    </TableRow>
                  )}
                  {pagedWebhookEvents.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{e.provider}</TableCell>
                      <TableCell className="text-xs font-medium">{e.event_type}</TableCell>
                      <TableCell>
                        {e.signature_valid ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
                            Valid
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Invalid</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {e.processed ? (
                          <span className="text-emerald-600 text-xs">✓</span>
                        ) : (
                          <span className="text-amber-600 text-xs">pending</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{e.attempts}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(e.received_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {!e.processed && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRetry(e.id)}
                            aria-label="Retry webhook"
                          >
                            <RotateCcw className="w-3.5 h-3.5 " /> Retry
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            {data.webhookEvents.length > EVENTS_PAGE_SIZE && (
              <div className="flex items-center justify-between border-t px-4 py-2.5">
                <span className="text-xs text-muted-foreground">
                  Page {eventsSafePage} of {eventsTotalPages} · {data.webhookEvents.length} events
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={eventsSafePage <= 1}
                    onClick={() => setEventsPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={eventsSafePage >= eventsTotalPages}
                    onClick={() => setEventsPage((p) => Math.min(eventsTotalPages, p + 1))}
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  sub?: string;
  tone?: "ok" | "danger";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div
              className={`text-2xl font-display font-semibold mt-1 ${tone === "danger" ? "text-destructive" : ""}`}
            >
              {value.toLocaleString()}
            </div>
            {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
          </div>
          <Icon className="w-4 h-4 text-muted-foreground" aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}
