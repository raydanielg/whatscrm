import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listMeetingAccounts,
  saveMeetingAccount,
  deleteMeetingAccount,
  listMeetingHistory,
} from "@/lib/booking/meeting-integrations.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Video, ArrowLeft, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/booking/meeting-integrations")({
  component: MeetingIntegrationsPage,
  head: () => ({
    meta: [
      { title: "Meeting integrations" },
      {
        name: "description",
        content:
          "Connect Zoom, Google Meet, Microsoft Teams, Jitsi & LiveKit for automatic meeting links, recording, and attendance tracking.",
      },
    ],
  }),
});

type ProviderKind = "zoom" | "google_meet" | "microsoft_teams" | "jitsi" | "livekit";

const PROVIDER_META: Record<
  ProviderKind,
  {
    label: string;
    description: string;
    fields: Array<{ key: string; label: string; type: "text" | "password"; hint?: string }>;
  }
> = {
  zoom: {
    label: "Zoom",
    description:
      "Server-to-Server OAuth app. Meetings, waiting room, recording, attendance report.",
    fields: [
      { key: "account_id", label: "Account ID", type: "text" },
      { key: "client_id", label: "Client ID", type: "text" },
      { key: "client_secret", label: "Client Secret", type: "password" },
    ],
  },
  google_meet: {
    label: "Google Meet",
    description: "Meet links are auto-provisioned via connected Google Calendar accounts.",
    fields: [],
  },
  microsoft_teams: {
    label: "Microsoft Teams",
    description: "Uses Microsoft Graph onlineMeetings via the connected Outlook account.",
    fields: [],
  },
  jitsi: {
    label: "Jitsi Meet",
    description:
      "Public meet.jit.si or your self-hosted Jitsi deployment. URL-based rooms, no API keys needed.",
    fields: [],
  },
  livekit: {
    label: "LiveKit",
    description: "Real-time rooms with server-signed JWTs. Set the LiveKit URL and API key/secret.",
    fields: [
      { key: "api_key", label: "API key", type: "text" },
      { key: "api_secret", label: "API secret", type: "password" },
    ],
  },
};

function MeetingIntegrationsPage() {
  const fmtZoned = useZonedDateFormatter();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;

  const listFn = useServerFn(listMeetingAccounts);
  const historyFn = useServerFn(listMeetingHistory);

  const accounts = useQuery({
    queryKey: ["meeting-accounts", workspaceId],
    queryFn: () => listFn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const history = useQuery({
    queryKey: ["meeting-history", workspaceId],
    queryFn: () => historyFn({ data: { workspaceId: workspaceId!, limit: 100 } }),
    enabled: !!workspaceId,
    refetchInterval: 15000,
  });

  return (
    <>
      <AppTopbar
        title="Meeting integrations"
        subtitle="Zoom · Google Meet · Teams · Jitsi · LiveKit"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/booking">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to booking
            </Link>
          </Button>
        }
      />
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Tabs defaultValue="accounts" className="space-y-6">
          <TabsList>
            <TabsTrigger value="accounts">Connected accounts</TabsTrigger>
            <TabsTrigger value="history">Meeting history</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="space-y-4">
            {(Object.keys(PROVIDER_META) as ProviderKind[]).map((kind) => {
              const rows = (accounts.data ?? []).filter(
                (a: { provider: string }) => a.provider === kind,
              );
              return (
                <ProviderCard
                  key={kind}
                  kind={kind}
                  workspaceId={workspaceId}
                  accounts={
                    rows as Array<{
                      id: string;
                      display_name: string;
                      is_default: boolean;
                      status: string;
                      config: Record<string, unknown>;
                    }>
                  }
                />
              );
            })}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent meeting events</CardTitle>
                <CardDescription>
                  Live log of every meeting created, updated, or errored.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {(history.data ?? []).map(
                    (h: {
                      id: string;
                      provider: string;
                      action: string;
                      join_url: string | null;
                      error: string | null;
                      created_at: string;
                      appointment_id: string | null;
                    }) => (
                      <div key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <Badge variant="outline" className="capitalize">
                          {h.provider.replace("_", " ")}
                        </Badge>
                        <span
                          className={`text-xs font-medium ${h.action === "error" ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {h.action}
                        </span>
                        <span className="text-muted-foreground flex-1 truncate">
                          {h.error ?? h.join_url ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fmtZoned(new Date(h.created_at), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                        {h.join_url ? (
                          <a
                            href={h.join_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    ),
                  )}
                  {history.data?.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No meeting events yet.
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function ProviderCard({
  kind,
  workspaceId,
  accounts,
}: {
  kind: ProviderKind;
  workspaceId: string | undefined;
  accounts: Array<{
    id: string;
    display_name: string;
    is_default: boolean;
    status: string;
    config: Record<string, unknown>;
  }>;
}) {
  const meta = PROVIDER_META[kind];
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const saveFn = useServerFn(saveMeetingAccount);
  const deleteFn = useServerFn(deleteMeetingAccount);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meeting-accounts", workspaceId] });
      toast.success("Account removed");
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-control border p-2">
            <Video className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base">{meta.label}</CardTitle>
            <CardDescription>{meta.description}</CardDescription>
          </div>
        </div>
        {workspaceId ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-9">
                <Plus className="h-4 w-4 mr-1.5" />
                Connect
              </Button>
            </DialogTrigger>
            <ConnectDialog
              kind={kind}
              workspaceId={workspaceId}
              onClose={() => setOpen(false)}
              onSaved={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["meeting-accounts", workspaceId] });
              }}
              saveFn={saveFn}
            />
          </Dialog>
        ) : null}
      </CardHeader>
      {accounts.length ? (
        <CardContent className="pt-0">
          <div className="divide-y border rounded-control">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.display_name}</span>
                  {a.is_default ? (
                    <Badge variant="secondary" className="text-xs">
                      Default
                    </Badge>
                  ) : null}
                  <Badge
                    variant={a.status === "active" ? "outline" : "destructive"}
                    className="text-xs capitalize"
                  >
                    {a.status}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  onClick={() => del.mutate(a.id)}
                  disabled={del.isPending}
                >
                  {del.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

function ConnectDialog({
  kind,
  workspaceId,
  onClose,
  onSaved,
  saveFn,
}: {
  kind: ProviderKind;
  workspaceId: string;
  onClose: () => void;
  onSaved: () => void;
  saveFn: ReturnType<typeof useServerFn<typeof saveMeetingAccount>>;
}) {
  const meta = PROVIDER_META[kind];
  const [displayName, setDisplayName] = useState(`${meta.label} account`);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [isDefault, setIsDefault] = useState(true);
  const [domain, setDomain] = useState(kind === "jitsi" ? "meet.jit.si" : "");
  const [livekitUrl, setLivekitUrl] = useState("");
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [autoRecording, setAutoRecording] = useState<"none" | "cloud" | "local">("none");

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          workspaceId,
          provider: kind,
          display_name: displayName,
          credentials: creds,
          config: {
            waiting_room_default: waitingRoom,
            auto_recording: autoRecording,
            ...(kind === "jitsi" ? { domain } : {}),
            ...(kind === "livekit" ? { livekit_url: livekitUrl } : {}),
          },
          is_default: isDefault,
        },
      }),
    onSuccess: () => {
      toast.success(`${meta.label} connected`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Connect {meta.label}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>

        {kind === "jitsi" ? (
          <div className="space-y-1.5">
            <Label>Jitsi domain</Label>
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="meet.jit.si"
            />
          </div>
        ) : null}

        {kind === "livekit" ? (
          <div className="space-y-1.5">
            <Label>LiveKit URL</Label>
            <Input
              value={livekitUrl}
              onChange={(e) => setLivekitUrl(e.target.value)}
              placeholder="wss://your-project.livekit.cloud"
            />
          </div>
        ) : null}

        {meta.fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label>{f.label}</Label>
            <Input
              type={f.type}
              value={creds[f.key] ?? ""}
              onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
            />
          </div>
        ))}

        <div className="flex items-center justify-between border rounded-control px-3 py-2">
          <div>
            <Label className="text-sm">Waiting room by default</Label>
            <p className="text-xs text-muted-foreground">
              Guests are held until the host admits them.
            </p>
          </div>
          <Switch checked={waitingRoom} onCheckedChange={setWaitingRoom} />
        </div>

        <div className="space-y-1.5">
          <Label>Automatic recording</Label>
          <Select
            value={autoRecording}
            onValueChange={(v) => setAutoRecording(v as "none" | "cloud" | "local")}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Off</SelectItem>
              <SelectItem value="cloud">Cloud</SelectItem>
              <SelectItem value="local">Local</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between border rounded-control px-3 py-2">
          <Label className="text-sm">Set as default for {meta.label}</Label>
          <Switch checked={isDefault} onCheckedChange={setIsDefault} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
          Connect
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
