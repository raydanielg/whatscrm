import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
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
import { Bell, Trash2, Plus, Save, ArrowLeft } from "lucide-react";
import {
  listNotificationRules,
  upsertNotificationRule,
  deleteNotificationRule,
  listNotificationTemplates,
  upsertNotificationTemplate,
  deleteNotificationTemplate,
} from "@/lib/booking/notifications.functions";

export const Route = createFileRoute("/_authenticated/booking/notifications")({
  component: BookingNotificationsPage,
});

type Kind =
  "confirmation" | "reschedule" | "cancellation" | "reminder" | "follow_up" | "review_request";
type Channel = "whatsapp" | "email" | "sms" | "push" | "in_app";

const KINDS: Array<{ v: Kind; l: string }> = [
  { v: "confirmation", l: "Confirmation" },
  { v: "reschedule", l: "Reschedule" },
  { v: "cancellation", l: "Cancellation" },
  { v: "reminder", l: "Reminder" },
  { v: "follow_up", l: "Follow-up" },
  { v: "review_request", l: "Review request" },
];
const CHANNELS: Array<{ v: Channel; l: string }> = [
  { v: "whatsapp", l: "WhatsApp" },
  { v: "email", l: "Email" },
  { v: "sms", l: "SMS" },
  { v: "push", l: "Push" },
  { v: "in_app", l: "In-app" },
];

const REMINDER_PRESETS = [
  { label: "1 hour before", offset_minutes: -60 },
  { label: "24 hours before", offset_minutes: -1440 },
  { label: "3 days before", offset_minutes: -4320 },
  { label: "1 hour after (follow-up)", offset_minutes: 60 },
];

function BookingNotificationsPage() {
  return (
    <>
      <AppTopbar
        title="Appointment notifications"
        subtitle="Templates, reminder rules and channels"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/booking">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Booking
            </Link>
          </Button>
        }
      />
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Tabs defaultValue="rules" className="space-y-6">
          <TabsList>
            <TabsTrigger value="rules">
              <Bell className="h-4 w-4 mr-2" />
              Rules
            </TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>
          <TabsContent value="rules">
            <RulesTab />
          </TabsContent>
          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

// ─── Rules ────────────────────────────────────────────────────────────────
function RulesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotificationRules);
  const upsertFn = useServerFn(upsertNotificationRule);
  const delFn = useServerFn(deleteNotificationRule);
  const { data: rules = [] } = useQuery({
    queryKey: ["booking", "notif-rules"],
    queryFn: () => listFn({ data: {} }),
  });
  const [draft, setDraft] = useState<{
    id?: string;
    name: string;
    kind: Kind;
    channels: Channel[];
    offset_minutes: number;
    send_to: "customer" | "host" | "both";
    is_active: boolean;
  }>({
    name: "",
    kind: "reminder",
    channels: ["email"],
    offset_minutes: -1440,
    send_to: "customer",
    is_active: true,
  });

  const save = useMutation({
    mutationFn: () => upsertFn({ data: draft }),
    onSuccess: () => {
      toast.success("Rule saved");
      qc.invalidateQueries({ queryKey: ["booking", "notif-rules"] });
      setDraft({
        name: "",
        kind: "reminder",
        channels: ["email"],
        offset_minutes: -1440,
        send_to: "customer",
        is_active: true,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking", "notif-rules"] });
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Active rules</CardTitle>
          <CardDescription>Rules govern which notifications fire, when, and where.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No rules yet. Add your first on the right.
            </p>
          )}
          {rules.map((r) => (
            <div key={r.id} className="flex items-start justify-between border rounded-control p-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <Badge variant="outline">{r.kind}</Badge>
                  {!r.is_active && <Badge variant="secondary">Paused</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {r.channels.join(", ")} • {formatOffset(r.offset_minutes)} • to {r.send_to}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove.mutate(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New rule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="24h reminder"
            />
          </div>
          <div>
            <Label>Kind</Label>
            <Select
              value={draft.kind}
              onValueChange={(v) => setDraft({ ...draft, kind: v as Kind })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.v} value={k.v}>
                    {k.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Channels</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {CHANNELS.map((c) => {
                const active = draft.channels.includes(c.v);
                return (
                  <Button
                    key={c.v}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        channels: active
                          ? draft.channels.filter((x) => x !== c.v)
                          : [...draft.channels, c.v],
                      })
                    }
                  >
                    {c.l}
                  </Button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Timing</Label>
            <Select
              value={String(draft.offset_minutes)}
              onValueChange={(v) => setDraft({ ...draft, offset_minutes: Number(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_PRESETS.map((p) => (
                  <SelectItem key={p.offset_minutes} value={String(p.offset_minutes)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={draft.offset_minutes}
              onChange={(e) => setDraft({ ...draft, offset_minutes: Number(e.target.value) })}
              className="mt-2"
              placeholder="Custom minutes (negative = before)"
            />
          </div>
          <div>
            <Label>Recipient</Label>
            <Select
              value={draft.send_to}
              onValueChange={(v) => setDraft({ ...draft, send_to: v as typeof draft.send_to })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="host">Host</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch
              checked={draft.is_active}
              onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
            />
          </div>
          <Button
            className="w-full"
            disabled={!draft.name || draft.channels.length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            <Plus className="h-4 w-4 mr-2" /> Save rule
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function formatOffset(min: number): string {
  if (min === 0) return "at start";
  const abs = Math.abs(min);
  const suffix = min < 0 ? "before" : "after";
  if (abs % 1440 === 0) return `${abs / 1440}d ${suffix}`;
  if (abs % 60 === 0) return `${abs / 60}h ${suffix}`;
  return `${abs}m ${suffix}`;
}

// ─── Templates ────────────────────────────────────────────────────────────
function TemplatesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotificationTemplates);
  const upsertFn = useServerFn(upsertNotificationTemplate);
  const delFn = useServerFn(deleteNotificationTemplate);
  const { data: templates = [] } = useQuery({
    queryKey: ["booking", "notif-templates"],
    queryFn: () => listFn({ data: {} }),
  });
  const [draft, setDraft] = useState<{
    id?: string;
    kind: Kind;
    channel: Channel;
    subject: string;
    body: string;
    is_active: boolean;
  }>({ kind: "confirmation", channel: "email", subject: "", body: "", is_active: true });

  const save = useMutation({
    mutationFn: () => upsertFn({ data: { ...draft, subject: draft.subject || undefined } }),
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["booking", "notif-templates"] });
      setDraft({ kind: "confirmation", channel: "email", subject: "", body: "", is_active: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking", "notif-templates"] }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>
            Use {"{{customer_name}}"}, {"{{start_at}}"}, {"{{join_url}}"}, {"{{manage_url}}"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No custom templates. Defaults are used until you add one.
            </p>
          )}
          {templates.map((t) => (
            <div key={t.id} className="flex items-start justify-between border rounded-control p-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{t.kind}</Badge>
                  <Badge>{t.channel}</Badge>
                  {!t.is_active && <Badge variant="secondary">Paused</Badge>}
                </div>
                {t.subject && <div className="text-sm font-medium">{t.subject}</div>}
                <div className="text-xs text-muted-foreground line-clamp-2">{t.body}</div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      id: t.id,
                      kind: t.kind as Kind,
                      channel: t.channel as Channel,
                      subject: t.subject ?? "",
                      body: t.body,
                      is_active: t.is_active,
                    })
                  }
                >
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove.mutate(t.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{draft.id ? "Edit template" : "New template"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Kind</Label>
            <Select
              value={draft.kind}
              onValueChange={(v) => setDraft({ ...draft, kind: v as Kind })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.v} value={k.v}>
                    {k.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Channel</Label>
            <Select
              value={draft.channel}
              onValueChange={(v) => setDraft({ ...draft, channel: v as Channel })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c.v} value={c.v}>
                    {c.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(draft.channel === "email" ||
            draft.channel === "push" ||
            draft.channel === "in_app") && (
            <div>
              <Label>Subject</Label>
              <Input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              />
            </div>
          )}
          <div>
            <Label>Body</Label>
            <RichTextarea
              rows={6}
              value={draft.body}
              onChange={(v) => setDraft({ ...draft, body: v })}
              placeholder="Hi {{customer_name}}, your appointment is confirmed for {{start_at}}."
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch
              checked={draft.is_active}
              onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
            />
          </div>
          <Button
            className="w-full"
            disabled={!draft.body || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save className="h-4 w-4 mr-2" /> {draft.id ? "Update template" : "Save template"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
