import { Brand } from "@/components/brand";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listCalendarAccounts,
  listSyncLog,
  startCalendarOAuth,
  connectIcsFeed,
  toggleCalendarAccount,
  disconnectCalendarAccount,
  syncCalendarAccounts,
  listExternalCalendars,
  setActiveCalendar,
} from "@/lib/booking/calendar-integrations.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Link2,
  Loader2,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/booking/calendar-integrations")({
  component: CalendarIntegrationsPage,
  head: () => ({
    meta: [
      { title: "Calendar Integrations" },
      {
        name: "description",
        content:
          "Connect Google Calendar, Microsoft Outlook / 365, and Apple Calendar to sync availability, appointments, and cancellations through the provider abstraction layer.",
      },
    ],
  }),
});

type CalendarAccount = {
  id: string;
  provider: string;
  account_email: string;
  display_name: string | null;
  calendar_id: string | null;
  color: string | null;
  enabled: boolean;
  is_primary: boolean;
  sync_direction: string;
  status: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  ics_url: string | null;
  scopes: string[] | null;
};

const PROVIDER_META: Record<
  string,
  { name: string; badge: string; auth: "oauth" | "ics"; connector?: "google" | "microsoft" }
> = {
  google: { name: "Google Calendar", badge: "OAuth", auth: "oauth", connector: "google" },
  microsoft: {
    name: "Microsoft Outlook / 365",
    badge: "OAuth",
    auth: "oauth",
    connector: "microsoft",
  },
  apple: { name: "Apple Calendar", badge: "ICS", auth: "ics" },
};

function CalendarIntegrationsPage() {
  const fmtZoned = useZonedDateFormatter();
  const qc = useQueryClient();
  const list = useServerFn(listCalendarAccounts);
  const logs = useServerFn(listSyncLog);
  const startOAuth = useServerFn(startCalendarOAuth);
  const connectIcs = useServerFn(connectIcsFeed);
  const toggle = useServerFn(toggleCalendarAccount);
  const disconnect = useServerFn(disconnectCalendarAccount);
  const sync = useServerFn(syncCalendarAccounts);

  const accounts = useQuery({
    queryKey: ["calendar-accounts"],
    queryFn: () => list() as Promise<CalendarAccount[]>,
  });

  const syncLog = useQuery({
    queryKey: ["calendar-sync-log"],
    queryFn: () => logs({ data: { limit: 25 } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["calendar-accounts"] });
    qc.invalidateQueries({ queryKey: ["calendar-sync-log"] });
  };

  const [connecting, setConnecting] = useState<string | null>(null);

  async function handleOAuth(provider: "google" | "microsoft") {
    setConnecting(provider);
    try {
      {
        const popup = window.open("", `wacrm-${provider}-calendar`, "width=600,height=720");
        if (!popup) throw new Error("Popup blocked. Allow popups and try again.");
        try {
          const { authorizationUrl } = await startOAuth({ data: { provider, targetOrigin: window.location.origin } });
          const authUrl = new URL(authorizationUrl);
          const expectedOrigin = provider === "google" ? "https://accounts.google.com" : "https://login.microsoftonline.com";
          if (authUrl.origin !== expectedOrigin) throw new Error("Unexpected calendar authorization URL");
          popup.location.href = authUrl.href;
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => { window.removeEventListener("message", onMessage); clearInterval(timer); };
            const onMessage = (event: MessageEvent) => {
              if (event.origin !== window.location.origin || event.source !== popup) return;
              if (event.data?.type !== "wacrm:calendar-oauth" || event.data.provider !== provider) return;
              cleanup(); popup.close();
              if (event.data.success === true) resolve();
              else reject(new Error(`${PROVIDER_META[provider].name} connection failed`));
            };
            window.addEventListener("message", onMessage);
            const timer = setInterval(() => {
              if (popup.closed) { cleanup(); reject(new Error("Calendar sign-in was cancelled")); }
            }, 500);
          });
        } catch (cause) { popup.close(); throw cause; }
        toast.success(`${PROVIDER_META[provider].name} connected`);
        refresh();
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setConnecting(null);
    }
  }

  const syncMut = useMutation({
    mutationFn: () => sync({ data: { horizonDays: 60 } }),
    onSuccess: (r: unknown) => {
      const count = (r as { count?: number }).count ?? 0;
      toast.success(`Synced ${count} busy blocks`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Calendar Integrations</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Connect Google Calendar, Microsoft Outlook / 365, and Apple Calendar. <Brand /> detects
            conflicts, syncs availability, and pushes new appointments and cancellations through the
            provider abstraction layer.
          </p>
        </div>
        <Button
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          variant="outline"
          size="sm"
        >
          {syncMut.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sync now
        </Button>
      </header>

      <section>
        <h2 className="text-sm font-medium uppercase text-muted-foreground mb-3">
          Providers
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Google Calendar
                <Badge variant="secondary">OAuth</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Two-way sync via Google Calendar API
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => handleOAuth("google")}
                disabled={connecting === "google"}
                className="w-full"
              >
                {connecting === "google" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Connect Google
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Microsoft Outlook / 365
                <Badge variant="secondary">OAuth</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Two-way sync via Microsoft Graph
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => handleOAuth("microsoft")}
                disabled={connecting === "microsoft"}
                className="w-full"
              >
                {connecting === "microsoft" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Connect Microsoft
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Apple Calendar
                <Badge variant="secondary">ICS</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Availability sync from public ICS feed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IcsConnectDialog
                onSubmit={async (v) => {
                  await connectIcs({ data: v });
                  toast.success("ICS feed connected");
                  refresh();
                }}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Connected accounts</TabsTrigger>
          <TabsTrigger value="log">Sync activity</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="space-y-3 mt-4">
          {accounts.isLoading && <div className="text-sm text-muted-foreground">Loading</div>}
          {accounts.data?.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No calendar accounts connected yet.
              </CardContent>
            </Card>
          )}
          {(accounts.data ?? []).map((acc) => (
            <AccountRow
              key={acc.id}
              account={acc}
              onChange={refresh}
              onToggle={(patch) => toggle({ data: { accountId: acc.id, ...patch } }).then(refresh)}
              onDisconnect={() => disconnect({ data: { accountId: acc.id } }).then(refresh)}
            />
          ))}
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {(syncLog.data ?? []).length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No sync activity yet.
                  </div>
                )}
                {(syncLog.data ?? []).map(
                  (row: {
                    id: string;
                    direction: string;
                    operation: string;
                    status: string;
                    message: string | null;
                    created_at: string;
                  }) => (
                    <div key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      {row.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                      )}
                      <span className="font-medium capitalize">
                        {row.operation.replace(/_/g, " ")}
                      </span>
                      <Badge variant="outline" className="text-[11px]">
                        {row.direction}
                      </Badge>
                      <span className="text-muted-foreground text-xs truncate flex-1">
                        {row.message ?? ""}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {fmtZoned(new Date(row.created_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccountRow({
  account,
  onToggle,
  onDisconnect,
}: {
  account: CalendarAccount;
  onChange: () => void;
  onToggle: (p: {
    enabled?: boolean;
    sync_direction?: "inbound" | "outbound" | "bidirectional";
  }) => Promise<unknown>;
  onDisconnect: () => Promise<unknown>;
}) {
  const meta = PROVIDER_META[account.provider] ?? {
    name: account.provider,
    badge: account.provider,
    auth: "oauth" as const,
  };
  const listExt = useServerFn(listExternalCalendars);
  const setActive = useServerFn(setActiveCalendar);
  const qc = useQueryClient();

  const cals = useQuery({
    queryKey: ["ext-calendars", account.id],
    queryFn: () =>
      listExt({ data: { accountId: account.id } }) as Promise<
        Array<{ id: string; name: string; primary: boolean }>
      >,
    enabled: account.provider !== "apple",
  });

  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="h-9 w-9 rounded-control bg-primary/10 grid place-items-center shrink-0">
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate flex items-center gap-2">
              {meta.name}
              <Badge variant="outline" className="text-[11px]">
                {meta.badge}
              </Badge>
              {account.status === "connected" && (
                <Badge variant="secondary" className="text-[11px]">
                  Connected
                </Badge>
              )}
              {account.status === "error" && (
                <Badge variant="destructive" className="text-[11px]">
                  Error
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {account.account_email}
              {account.display_name ? ` · ${account.display_name}` : ""}
            </div>
            {account.last_sync_error && (
              <div className="text-xs text-destructive mt-0.5 truncate">
                {account.last_sync_error}
              </div>
            )}
          </div>
        </div>

        {account.provider !== "apple" && (
          <Select
            value={account.calendar_id ?? ""}
            onValueChange={async (val) => {
              const cal = cals.data?.find((c) => c.id === val);
              await setActive({
                data: { accountId: account.id, calendarId: val, displayName: cal?.name },
              });
              qc.invalidateQueries({ queryKey: ["calendar-accounts"] });
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Choose calendar" />
            </SelectTrigger>
            <SelectContent>
              {(cals.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.primary ? " (primary)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={account.sync_direction}
          onValueChange={(v) =>
            onToggle({ sync_direction: v as "inbound" | "outbound" | "bidirectional" })
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bidirectional">Two-way</SelectItem>
            <SelectItem value="inbound">Availability only</SelectItem>
            <SelectItem value="outbound">Push only</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch checked={account.enabled} onCheckedChange={(v) => onToggle({ enabled: v })} />
          <span className="text-xs text-muted-foreground">
            {account.enabled ? "Active" : "Paused"}
          </span>
        </div>

        <Button variant="ghost" size="sm" onClick={() => onDisconnect()}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function IcsConnectDialog({
  onSubmit,
}: {
  onSubmit: (v: { account_email: string; display_name?: string; ics_url: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = useMemo(
    () => email.length > 2 && /^https?:\/\/|^webcal:\/\//.test(url),
    [email, url],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Link2 className="h-4 w-4 mr-2" />
          Add ICS feed
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Apple / ICS Calendar</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Account email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@icloud.com"
            />
          </div>
          <div>
            <Label>Display name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My iCloud calendar"
            />
          </div>
          <div>
            <Label>Public ICS URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="webcal://p01-caldav.icloud.com/..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              In Apple Calendar, share a calendar → make public → copy URL.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({
                  account_email: email,
                  display_name: name || undefined,
                  ics_url: url,
                });
                setOpen(false);
                setEmail("");
                setName("");
                setUrl("");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
