import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/app/app-topbar";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, Code2, Trash2, ExternalLink, Globe, CalendarClock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listChatbots } from "@/lib/chatbots/chatbots.functions";
import {
  listChatWidgets,
  createChatWidget,
  updateChatWidget,
  deleteChatWidget,
} from "@/lib/widgets/widgets.functions";
import { evaluateSchedule, mergeSchedule } from "@/lib/widgets/schedule";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";

export const Route = createFileRoute("/_authenticated/widgets")({
  head: () => ({
    meta: [
      { title: "Chat Widgets — Embedded Systems" },
      {
        name: "description",
        content:
          "Manage embeddable chat widgets, install snippets, appearance, routing rules, and analytics.",
      },
    ],
  }),
  loader: () => ({
    breadcrumbs: [{ label: "Extensions" }, { label: "Chat Widgets" }],
  }),
  component: WidgetsListPage,
});

type WidgetRow = {
  id: string;
  name: string;
  chatbot_id: string | null;
  is_active: boolean;
  allowed_domains: string[];
  schedule: unknown;
  updated_at: string;
  created_at: string;
};

function WidgetsListPage() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [chatbotId, setChatbotId] = useState<string>("");
  const [pending, setPending] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WidgetRow | null>(null);

  const widgetsQ = useQuery({
    queryKey: ["chat-widgets", workspaceId],
    queryFn: () => listChatWidgets({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
  const botsQ = useQuery({
    queryKey: ["chatbots-min", workspaceId],
    queryFn: () => listChatbots({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createChatWidget({ data: { workspaceId: workspaceId!, name, chatbotId: chatbotId || null } }),
    onSuccess: ({ id }) => {
      toast.success("Widget created");
      setOpen(false);
      setName("");
      setChatbotId("");
      qc.invalidateQueries({ queryKey: ["chat-widgets", workspaceId] });
      navigate({ to: "/widgets/$widgetId", params: { widgetId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (row: WidgetRow) =>
      updateChatWidget({ data: { widgetId: row.id, patch: { isActive: !row.is_active } } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["chat-widgets", workspaceId] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteChatWidget({ data: { widgetId: id } }),
    onSuccess: () => {
      toast.success("Widget deleted");
      qc.invalidateQueries({ queryKey: ["chat-widgets", workspaceId] });
      setConfirmDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (widgetsQ.data ?? []) as WidgetRow[];
  const bots = botsQ.data ?? [];

  return (
    <div className="flex flex-col">
      <AppTopbar
        title="Chat Widgets"
        subtitle="Embed AI chat on any website with a single snippet."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 size-4" /> New widget
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
        <div className="mt-6 grid gap-3">
          {widgetsQ.isLoading && (
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
          )}
          {!widgetsQ.isLoading && rows.length === 0 && (
            <Card className="p-10 text-center">
              <Code2 className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 font-bold text-lg">No widgets yet</p>
              <p className="mt-1 text-muted-foreground text-sm">
                Create your first embeddable chat widget.
              </p>
              <Button className="mt-4" onClick={() => setOpen(true)}>
                <Plus className="mr-2 size-4" /> Create widget
              </Button>
            </Card>
          )}
          {rows.map((r) => {
            const sched = mergeSchedule(r.schedule);
            const evalResult = evaluateSchedule(sched);
            const liveNow = r.is_active && (!sched.enabled || evalResult.active);
            return (
              <Card key={r.id} className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to="/widgets/$widgetId"
                      params={{ widgetId: r.id }}
                      className="font-bold text-lg hover:underline"
                    >
                      {r.name}
                    </Link>
                    {!r.is_active ? (
                      <Badge variant="secondary">Off</Badge>
                    ) : liveNow ? (
                      <Badge variant="default">Live</Badge>
                    ) : (
                      <Badge variant="outline">Scheduled off</Badge>
                    )}
                    {sched.enabled && (
                      <Badge variant="outline" className="gap-1">
                        <CalendarClock className="size-3" /> {sched.timezone}
                      </Badge>
                    )}
                    {r.allowed_domains.length > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Globe className="size-3" /> {r.allowed_domains.length} domain
                        {r.allowed_domains.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-muted-foreground text-xs">
                    ID: <code>{r.id}</code>
                  </p>
                </div>
                <Switch
                  checked={r.is_active}
                  disabled={pending === r.id}
                  onCheckedChange={() => {
                    setPending(r.id);
                    toggleMut.mutate(r, { onSettled: () => setPending(null) });
                  }}
                  aria-label="Active"
                />
                <Link to="/widgets/$widgetId" params={{ widgetId: r.id }}>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-2 size-4" /> Manage
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                  onClick={() => setConfirmDelete(r)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </Card>
            );
          })}
        </div>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a chat widget</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Widget name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marketing site chat"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Default chatbot</label>
              <Select value={chatbotId} onValueChange={setChatbotId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a chatbot" />
                </SelectTrigger>
                <SelectContent>
                  {bots
                    .filter((b) => (b as { status: string }).status === "active")
                    .map((b) => (
                      <SelectItem key={(b as { id: string }).id} value={(b as { id: string }).id}>
                        {(b as { name: string }).name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!name.trim() || createMut.isPending}
            >
              {createMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o: boolean) => {
          if (!o) setConfirmDelete(null);
        }}
        title="Delete widget?"
        description={
          confirmDelete
            ? `This will permanently delete "${confirmDelete.name}" and stop any embeds using it.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) deleteMut.mutate(confirmDelete.id);
        }}
      />
    </div>
  );
}
