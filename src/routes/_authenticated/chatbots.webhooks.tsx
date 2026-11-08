import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listChatbotWebhooks,
  upsertChatbotWebhook,
  deleteChatbotWebhook,
  listChatbotWebhookDeliveries,
  testChatbotWebhook,
  CHATBOT_WEBHOOK_EVENTS,
  type ChatbotWebhook,
  type ChatbotWebhookDelivery,
} from "@/lib/chatbots/webhooks.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Plus, Send, Trash2, Webhook, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chatbots/webhooks")({
  head: () => ({
    meta: [
      { title: "Chatbot Webhooks" },
      {
        name: "description",
        content:
          "Receive real-time events when chatbots are created, updated, paused, restored, deleted, or duplicated.",
      },
    ],
  }),
  component: ChatbotWebhooksPage,
});

function ChatbotWebhooksPage() {
  const fmtZoned = useZonedDateFormatter();
  const ws = useCurrentWorkspace();
  const workspaceId = ws.active?.id ?? null;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ChatbotWebhook | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ChatbotWebhook | null>(null);
  const [selectedHook, setSelectedHook] = useState<string | null>(null);

  const webhooks = useQuery({
    queryKey: ["chatbot-webhooks", workspaceId],
    queryFn: () => listChatbotWebhooks({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const deliveries = useQuery({
    queryKey: ["chatbot-webhook-deliveries", workspaceId, selectedHook],
    queryFn: () =>
      listChatbotWebhookDeliveries({
        data: { workspaceId: workspaceId!, webhookId: selectedHook ?? undefined, limit: 50 },
      }),
    enabled: !!workspaceId,
    refetchInterval: 15_000,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteChatbotWebhook({ data: { id, workspaceId: workspaceId! } }),
    onSuccess: () => {
      toast.success("Webhook deleted");
      qc.invalidateQueries({ queryKey: ["chatbot-webhooks", workspaceId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const test = useMutation({
    mutationFn: (id: string) => testChatbotWebhook({ data: { id, workspaceId: workspaceId! } }),
    onSuccess: () => {
      toast.success("Test event sent");
      qc.invalidateQueries({ queryKey: ["chatbot-webhook-deliveries", workspaceId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Test failed"),
  });

  return (
    <>
      <AppTopbar
        title="Chatbot Webhooks"
        subtitle="Real-time lifecycle events for chatbots in this workspace."
        actions={
          <Button onClick={() => setCreating(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> New endpoint
          </Button>
        }
      />
      <main className="w-full max-w-7xl mx-auto p-6 space-y-6">
        <section className="rounded-control border border-border bg-card">
          <div className="p-4 border-b flex items-center gap-2">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-bold text-xl">Endpoints</h2>
          </div>
          <div className="divide-y">
            {webhooks.isLoading && (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </div>
            )}
            {webhooks.data?.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No webhook endpoints yet. Add one to receive real-time chatbot lifecycle events.
              </div>
            )}
            {webhooks.data?.map((hook) => (
              <div key={hook.id} className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{hook.name}</span>
                    <Badge variant={hook.active ? "default" : "secondary"} className="capitalize">
                      {hook.active ? "Active" : "Paused"}
                    </Badge>
                    {hook.failure_count > 0 && (
                      <Badge variant="destructive">{hook.failure_count} failing</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate mt-1">
                    {hook.url}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {hook.events.length} event{hook.events.length === 1 ? "" : "s"} ·{" "}
                    {hook.last_delivered_at
                      ? `Last delivery ${fmtZoned(new Date(hook.last_delivered_at), { dateStyle: "medium", timeStyle: "short" })}`
                      : "No deliveries yet"}
                    {hook.last_error ? ` · ${hook.last_error}` : ""}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedHook(hook.id === selectedHook ? null : hook.id)}
                  >
                    {hook.id === selectedHook ? "All logs" : "View logs"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => test.mutate(hook.id)}
                    disabled={test.isPending}
                  >
                    <Send className="h-3.5 w-3.5 " /> Test
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(hook)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPendingDelete(hook)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-control border border-border bg-card">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-xl">Recent deliveries</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                qc.invalidateQueries({ queryKey: ["chatbot-webhook-deliveries", workspaceId] })
              }
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="divide-y max-h-[520px] overflow-auto">
            {deliveries.data?.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No deliveries yet.
              </div>
            )}
            {deliveries.data?.map((d: ChatbotWebhookDelivery) => (
              <div key={d.id} className="p-3 flex items-center gap-3 text-sm">
                <Badge
                  variant={
                    d.status === "success"
                      ? "default"
                      : d.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                  className="capitalize"
                >
                  {d.status}
                </Badge>
                <span className="font-mono text-xs">{d.event}</span>
                <span className="text-muted-foreground text-xs">{d.response_status ?? "—"}</span>
                <span className="text-muted-foreground text-xs flex-1 truncate">
                  {d.error ?? d.response_body?.slice(0, 120) ?? ""}
                </span>
                <span className="text-muted-foreground text-xs">
                  {fmtZoned(new Date(d.created_at), { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {(creating || editing) && (
        <WebhookEditor
          workspaceId={workspaceId!}
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["chatbot-webhooks", workspaceId] });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete webhook endpoint?"
        description={`"${pendingDelete?.name}" will stop receiving events. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await remove.mutateAsync(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}

function WebhookEditor({
  workspaceId,
  initial,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  initial: ChatbotWebhook | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [events, setEvents] = useState<string[]>(initial?.events ?? [...CHATBOT_WEBHOOK_EVENTS]);
  const [rotate, setRotate] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      upsertChatbotWebhook({
        data: {
          id: initial?.id,
          workspaceId,
          name,
          url,
          active,
          events: events as (typeof CHATBOT_WEBHOOK_EVENTS)[number][],
          rotateSecret: rotate || undefined,
        },
      }),
    onSuccess: (row) => {
      toast.success(initial ? "Webhook updated" : "Webhook created");
      if (!initial && row?.secret) {
        navigator.clipboard.writeText(row.secret).catch(() => undefined);
        toast.info("Signing secret copied to clipboard");
      }
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const toggle = (evt: string) =>
    setEvents((s) => (s.includes(evt) ? s.filter((x) => x !== evt) : [...s, evt]));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit endpoint" : "New webhook endpoint"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ops notifier"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Endpoint URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks/wacrm"
            />
            <p className="text-xs text-muted-foreground">
              We POST signed JSON. Verify <code>x-wacrm-signature</code> using HMAC-SHA256(secret,
              `${"{"}ts{"}"}.body).
            </p>
          </div>
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <Label className="text-sm">Active</Label>
              <p className="text-xs text-muted-foreground">Deliver events to this endpoint.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          {initial && (
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <Label className="text-sm flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> Rotate signing secret
                </Label>
                <p className="text-xs text-muted-foreground">Generates a new secret on save.</p>
              </div>
              <Switch checked={rotate} onCheckedChange={setRotate} />
            </div>
          )}
          {initial?.secret && (
            <div className="rounded border p-3 flex items-center gap-2">
              <code className="text-xs flex-1 truncate">{initial.secret}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(initial.secret ?? "");
                  toast.success("Secret copied");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <div className="space-y-2">
            <Label>Events</Label>
            <div className="grid grid-cols-2 gap-2">
              {CHATBOT_WEBHOOK_EVENTS.map((evt) => (
                <label
                  key={evt}
                  className="flex items-center gap-2 text-sm rounded border p-2 cursor-pointer hover:bg-accent"
                >
                  <Checkbox checked={events.includes(evt)} onCheckedChange={() => toggle(evt)} />
                  <span className="font-mono text-xs">{evt}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!name.trim() || !url.trim() || events.length === 0 || save.isPending}
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {initial ? "Save" : "Create endpoint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
