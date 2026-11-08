import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import {
  Bot,
  ChevronDown,
  ListPlus,

  Loader2,
  MessageSquareDashed,
  Search,
  Send,
  Smartphone,
  User,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useMessages } from "@/hooks/use-messages";
import { useRealtimeSubscription } from "@/hooks/use-realtime-subscription";
import { sendWaAgentReply, setWaBotPaused } from "@/lib/messaging/wa-inbox.functions";
import {
  assignWaHandoff,
  getWaHandoffOverview,
  routeWaConversationToAgent,
} from "@/lib/messaging/wa-handoff.functions";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type WaConversation = {
  id: string;
  contact_id: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_from: string | null;
  metadata: Record<string, unknown> | null;
  contact: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;
};

type Instance = { id: string; phone_number: string | null; display_name?: string | null };

function contactName(c: WaConversation["contact"]): string {
  if (!c) return "Unknown";
  return (
    c.display_name ||
    [c.first_name, c.last_name].filter(Boolean).join(" ") ||
    c.phone ||
    "Unknown"
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function WaConversationInbox({ instances }: { instances: Instance[] }) {
  const qc = useQueryClient();
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id ?? null;

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const listKey = ["wa-inbox-conversations", workspaceId] as const;

  const { data: conversations = [], isLoading } = useQuery<WaConversation[]>({
    enabled: !!workspaceId,
    queryKey: listKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `id, contact_id, status, unread_count, last_message_at, last_message_preview,
           last_message_from, metadata,
           contact:contacts!conversations_contact_id_fkey(id, display_name, first_name, last_name, phone, avatar_url)`,
        )
        .eq("workspace_id", workspaceId!)
        .eq("channel", "whatsapp")
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as WaConversation[];
    },
  });

  // Live list refresh when new WhatsApp traffic lands.
  const bindings = useMemo(
    () => [
      {
        event: "*" as const,
        schema: "public",
        table: "conversations",
        filter: workspaceId ? `workspace_id=eq.${workspaceId}` : undefined,
      },
    ],
    [workspaceId],
  );

  useRealtimeSubscription({
    key: workspaceId ? `wa-inbox:${workspaceId}` : null,
    bindings,
    onChange: () => qc.invalidateQueries({ queryKey: listKey }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = contactName(c.contact).toLowerCase();
      return (
        name.includes(q) ||
        (c.contact?.phone ?? "").toLowerCase().includes(q) ||
        (c.last_message_preview ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversations, search]);

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const { messages, isLoading: messagesLoading } = useMessages(selected?.id);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, selectedId]);

  // Clear unread when opening a thread.
  useEffect(() => {
    if (!selected || selected.unread_count === 0) return;
    supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", selected.id)
      .then(() => qc.invalidateQueries({ queryKey: listKey }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const sendFn = useServerFn(sendWaAgentReply);
  const pauseFn = useServerFn(setWaBotPaused);

  const send = useMutation({
    mutationFn: async (body: string) => {
      if (!selected) throw new Error("No conversation selected");
      return sendFn({ data: { conversationId: selected.id, body } });
    },
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["messages", selected?.id] });
      qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (e: Error) => toast.error(e.message || "Could not send the reply"),
  });

  const pause = useMutation({
    mutationFn: async (paused: boolean) => {
      if (!selected) throw new Error("No conversation selected");
      return pauseFn({ data: { conversationId: selected.id, paused } });
    },
    onSuccess: (_r, paused) => {
      toast.success(paused ? "Bot paused for this chat" : "Bot resumed");
      qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const routeFn = useServerFn(routeWaConversationToAgent);
  const assignFn = useServerFn(assignWaHandoff);
  const overviewFn = useServerFn(getWaHandoffOverview);


  /** Agent pool for the "Assign to" menu (also powers the queue counter). */
  const { data: overview } = useQuery({
    enabled: !!workspaceId,
    queryKey: ["wa-handoff-overview", workspaceId],
    queryFn: () => overviewFn({ data: { workspaceId: workspaceId! } }),
  });

  function reportOutcome(res: { status: string; queuePosition: number | null; reason: string }) {
    if (res.status === "assigned") toast.success("Conversation assigned");
    else if (res.status === "queued")
      toast.info(
        res.queuePosition ? `Queued — position ${res.queuePosition}` : "Already in the queue",
      );
    else toast.warning(res.reason || "No agent was assigned");
    qc.invalidateQueries({ queryKey: listKey });
    qc.invalidateQueries({ queryKey: ["wa-handoff-overview", workspaceId] });
  }

  /** Manual handoff — applies the workspace strategy (round robin / skills). */
  const route = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No conversation selected");
      return routeFn({ data: { conversationId: selected.id } });
    },
    onSuccess: (res) => {
      if (res.status === "assigned") toast.success("Assigned to the next eligible agent");
      else reportOutcome(res);
      qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (e: Error) => toast.error(e.message || "Could not assign an agent"),
  });

  /** Explicit routing — a named agent, or straight into the waiting queue. */
  const assign = useMutation({
    mutationFn: async (target: { type: "agent"; agentId: string } | { type: "queue" }) => {
      if (!selected) throw new Error("No conversation selected");
      return assignFn({ data: { conversationId: selected.id, target } });
    },
    onSuccess: reportOutcome,
    onError: (e: Error) => toast.error(e.message || "Could not route the handoff"),
  });

  const busy = route.isPending || assign.isPending;


  const botPaused = selected?.metadata?.["wa_bot_paused"] === true;
  const sessionId =
    typeof selected?.metadata?.["wa_session_id"] === "string"
      ? (selected!.metadata!["wa_session_id"] as string)
      : null;
  const instance = instances.find((i) => i.id === sessionId);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Conversations</CardTitle>
          <CardDescription>
            Inbound WhatsApp chats for this workspace. Reply as an agent or pause the bot per chat.
          </CardDescription>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats"
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] border-t min-h-[520px]">
          {/* Thread list */}
          <div className="border-b md:border-b-0 md:border-r">
            <ScrollArea className="h-[240px] md:h-[520px]">
              {isLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Loading</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <MessageSquareDashed className="mx-auto mb-2 h-6 w-6" />
                  No WhatsApp conversations yet.
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((c) => {
                    const name = contactName(c.contact);
                    const isActive = c.id === selectedId;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          className={cn(
                            "w-full text-left px-3 py-3 flex gap-3 items-start transition-colors",
                            isActive ? "bg-muted" : "hover:bg-muted/60",
                          )}
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            {initials(name) || <User className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium">{name}</span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {timeAgo(c.last_message_at)}
                              </span>
                            </span>
                            <span className="mt-0.5 flex items-center gap-2">
                              <span className="truncate text-xs text-muted-foreground">
                                {c.last_message_preview || "No messages yet"}
                              </span>
                              {c.unread_count > 0 && (
                                <Badge className="rounded-control px-1.5 py-0 text-[11px]">
                                  {c.unread_count}
                                </Badge>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>

          {/* Thread view */}
          <div className="flex min-h-[420px] flex-col">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                Select a conversation to view the chat.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {contactName(selected.contact)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{selected.contact?.phone ?? "—"}</span>
                      {instance && (
                        <Badge variant="outline" className="rounded-control gap-1">
                          <Smartphone className="h-3 w-3" />
                          {instance.display_name || instance.phone_number || "instance"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={busy}>
                          <UserPlus className="h-3.5 w-3.5" />
                          {busy ? "Routing" : "Assign to"}
                          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" scrollable={false} className="w-64">
                        <DropdownMenuLabel>Route this handoff</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => route.mutate()}>
                          <Bot className="h-3.5 w-3.5" />
                          Auto — use workspace strategy
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => assign.mutate({ type: "queue" })}>
                          <ListPlus className="h-3.5 w-3.5" />
                          Add to queue
                          {!!overview?.waitingInQueue && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {overview.waitingInQueue} waiting
                            </span>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Specific agent</DropdownMenuLabel>
                        <ScrollArea className="max-h-56">
                          {(overview?.agents ?? []).length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                              No agents configured yet — add them under Handoff.
                            </div>
                          ) : (
                            (overview?.agents ?? []).map((a) => (
                              <DropdownMenuItem
                                key={a.userId}
                                onSelect={() =>
                                  assign.mutate({ type: "agent", agentId: a.userId })
                                }
                              >
                                <User className="h-3.5 w-3.5" />
                                <span className="truncate">{a.name}</span>
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {a.presence === "online" ? "online" : a.presence} ·{" "}
                                  {a.currentLoad}/{a.maxConcurrent}
                                </span>
                              </DropdownMenuItem>
                            ))
                          )}
                        </ScrollArea>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="wa-bot-pause" className="text-xs text-muted-foreground">
                      {botPaused ? "Bot paused" : "Bot active"}
                    </Label>
                    <Switch
                      id="wa-bot-pause"
                      checked={!botPaused}
                      disabled={pause.isPending}
                      onCheckedChange={(v) => pause.mutate(!v)}
                    />
                  </div>

                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2 max-h-[380px]">
                  {messagesLoading ? (
                    <div className="text-center text-sm text-muted-foreground">Loading messages</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground">No messages yet.</div>
                  ) : (
                    messages.map((m) => {
                      const outbound = m.direction === "outbound";
                      const fromBot =
                        (m.metadata as Record<string, unknown> | null)?.source === "wa_bot";
                      return (
                        <div
                          key={m.id}
                          className={cn("flex", outbound ? "justify-end" : "justify-start")}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded px-3 py-2 text-sm [overflow-wrap:anywhere]",
                              outbound
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground",
                            )}
                          >
                            {m.body || (m.media_url ? `[${m.message_type}]` : "")}
                            <div
                              className={cn(
                                "mt-1 flex items-center gap-1 text-[11px]",
                                outbound ? "text-primary-foreground/70" : "text-muted-foreground",
                              )}
                            >
                              {outbound && (fromBot ? "Bot" : "Agent")}
                              {outbound && " · "}
                              {timeAgo(m.created_at)}
                              {m.status === "failed" && " · failed"}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="border-t p-3">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write a reply"
                      rows={2}
                      className="resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (draft.trim()) send.mutate(draft.trim());
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={!draft.trim() || send.isPending}
                      onClick={() => send.mutate(draft.trim())}
                    >
                      {send.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {!botPaused && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      The bot still auto-replies on this chat. Turn it off above to take over.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
