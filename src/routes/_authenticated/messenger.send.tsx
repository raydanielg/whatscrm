import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Send,
  CalendarClock,
  Paperclip,
  X,
  Trash2,
  Loader2,
  RefreshCw,
  MessageCircle,
  Settings,
} from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DateTimePicker,
  fromLocalDateTimeString,
  toLocalDateTimeString,
} from "@/shared/components";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { listMessengerAccounts } from "@/lib/messenger/accounts.functions";
import { syncMessengerConversations } from "@/lib/messenger/sync.functions";
import {
  sendMessengerNow,
  scheduleMessengerSend,
  listMessengerScheduled,
  cancelMessengerScheduled,
  listMessengerConversationsForSend,
} from "@/lib/messenger/send.functions";

export const Route = createFileRoute("/_authenticated/messenger/send")({
  head: () => ({
    meta: [
      { title: "Messenger — Send & Schedule" },
      {
        name: "description",
        content:
          "Send and schedule Facebook Messenger messages from your CRM using connected Page tokens.",
      },
    ],
  }),
  component: MessengerSendPage,
});

type AttachmentType = "image" | "video" | "audio" | "file";

function MessengerSendPage() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id;

  const listAccounts = useServerFn(listMessengerAccounts);
  const listConvs = useServerFn(listMessengerConversationsForSend);
  const listSched = useServerFn(listMessengerScheduled);
  const cancelSched = useServerFn(cancelMessengerScheduled);
  const sendNow = useServerFn(sendMessengerNow);
  const schedule = useServerFn(scheduleMessengerSend);
  const syncConvs = useServerFn(syncMessengerConversations);

  const accountsQ = useQuery({
    queryKey: ["messenger", "accounts", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listAccounts({ data: { workspaceId: workspaceId! } }),
  });

  const [accountId, setAccountId] = useState<string>("");
  const activeAccountId = accountId || (accountsQ.data?.accounts?.[0]?.id ?? "");

  const [recipientMode, setRecipientMode] = useState<"conversation" | "psid">("conversation");
  const [conversationId, setConversationId] = useState<string>("");
  const [recipientPsid, setRecipientPsid] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [attachmentType, setAttachmentType] = useState<AttachmentType | "none">("none");
  const [attachmentUrl, setAttachmentUrl] = useState<string>("");
  const [messagingType, setMessagingType] = useState<"RESPONSE" | "UPDATE" | "MESSAGE_TAG">(
    "RESPONSE",
  );
  const [tag, setTag] = useState<string>("");
  const [scheduledFor, setScheduledFor] = useState<string>("");

  const convsQ = useQuery({
    queryKey: ["messenger", "conversations", workspaceId, activeAccountId],
    enabled: !!workspaceId && !!activeAccountId && recipientMode === "conversation",
    queryFn: () =>
      listConvs({ data: { workspaceId: workspaceId!, messengerAccountId: activeAccountId } }),
  });

  const schedQ = useQuery({
    queryKey: ["messenger", "scheduled", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listSched({ data: { workspaceId: workspaceId! } }),
    refetchInterval: 15_000,
  });

  const attachment = useMemo(() => {
    if (attachmentType === "none" || !attachmentUrl.trim()) return null;
    return { type: attachmentType, url: attachmentUrl.trim() };
  }, [attachmentType, attachmentUrl]);

  const canSubmit = useMemo(() => {
    if (!workspaceId || !activeAccountId) return false;
    if (recipientMode === "conversation" && !conversationId) return false;
    if (recipientMode === "psid" && !recipientPsid.trim()) return false;
    if (!text.trim() && !attachment) return false;
    if (messagingType === "MESSAGE_TAG" && !tag.trim()) return false;
    return true;
  }, [
    workspaceId,
    activeAccountId,
    recipientMode,
    conversationId,
    recipientPsid,
    text,
    attachment,
    messagingType,
    tag,
  ]);

  function resetForm() {
    setText("");
    setAttachmentType("none");
    setAttachmentUrl("");
    setScheduledFor("");
  }

  const sendMut = useMutation({
    mutationFn: async () => {
      return sendNow({
        data: {
          workspaceId: workspaceId!,
          messengerAccountId: activeAccountId,
          conversationId: recipientMode === "conversation" ? conversationId : undefined,
          recipientPsid: recipientMode === "psid" ? recipientPsid.trim() : undefined,
          text: text.trim() ? text : null,
          attachment,
          messagingType,
          tag: messagingType === "MESSAGE_TAG" ? tag.trim() : null,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Sent • message ${r.messageId || "delivered"}`);
      resetForm();
      qc.invalidateQueries({ queryKey: ["messenger"] });
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scheduleMut = useMutation({
    mutationFn: async () => {
      if (!scheduledFor) throw new Error("Pick a date & time");
      return schedule({
        data: {
          workspaceId: workspaceId!,
          messengerAccountId: activeAccountId,
          conversationId: recipientMode === "conversation" ? conversationId : undefined,
          recipientPsid: recipientMode === "psid" ? recipientPsid.trim() : undefined,
          text: text.trim() ? text : null,
          attachment,
          messagingType,
          tag: messagingType === "MESSAGE_TAG" ? tag.trim() : null,
          scheduledFor: new Date(scheduledFor).toISOString(),
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Scheduled for ${new Date(r.scheduledFor).toLocaleString()}`);
      resetForm();
      qc.invalidateQueries({ queryKey: ["messenger", "scheduled"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMut = useMutation({
    mutationFn: async () => syncConvs({ data: { accountId: activeAccountId } }),
    onSuccess: () => {
      toast.success("Messenger conversations synced");
      qc.invalidateQueries({ queryKey: ["messenger", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => cancelSched({ data: { id, workspaceId: workspaceId! } }),
    onSuccess: () => {
      toast.success("Scheduled message cancelled");
      qc.invalidateQueries({ queryKey: ["messenger", "scheduled"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accounts = accountsQ.data?.accounts ?? [];
  const convs = convsQ.data?.conversations ?? [];
  const scheduled = schedQ.data?.rows ?? [];

  const minLocal = new Date(Date.now() + 60_000).toISOString().slice(0, 16);

  return (
    <>
      <AppTopbar
        title="Send Messenger message"
        subtitle="Send or schedule messages from your connected Facebook Pages. Uses the stored Page access token."
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {accounts.length === 0 ? (
          <Card className="rounded-control">
            <CardContent className="py-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageCircle className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="font-bold text-lg mb-1">No connected Facebook Pages</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
                Connect a Facebook Page to send and schedule Messenger messages directly from your
                workspace.
              </p>
              <Button asChild>
                <Link to="/settings">
                  <Settings className="w-4 h-4 mr-2" /> Go to Settings → Messenger
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="rounded-control">
              <CardHeader>
                <CardTitle className="text-base">Compose</CardTitle>
                <CardDescription>Message a customer directly on Messenger.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>From page</Label>
                    <Select value={activeAccountId} onValueChange={setAccountId}>
                      <SelectTrigger className="rounded-control">
                        <SelectValue placeholder="Select page" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.page_name ?? a.page_id}{" "}
                            {a.status !== "connected" ? `(${a.status})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Messaging type</Label>
                    <Select
                      value={messagingType}
                      onValueChange={(v) => setMessagingType(v as typeof messagingType)}
                    >
                      <SelectTrigger className="rounded-control">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RESPONSE">RESPONSE (24-hour window)</SelectItem>
                        <SelectItem value="UPDATE">UPDATE</SelectItem>
                        <SelectItem value="MESSAGE_TAG">MESSAGE_TAG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {messagingType === "MESSAGE_TAG" && (
                  <div className="space-y-1.5">
                    <Label>Message tag</Label>
                    <Select value={tag} onValueChange={setTag}>
                      <SelectTrigger className="rounded-control">
                        <SelectValue placeholder="Select tag" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CONFIRMED_EVENT_UPDATE">
                          CONFIRMED_EVENT_UPDATE
                        </SelectItem>
                        <SelectItem value="POST_PURCHASE_UPDATE">POST_PURCHASE_UPDATE</SelectItem>
                        <SelectItem value="ACCOUNT_UPDATE">ACCOUNT_UPDATE</SelectItem>
                        <SelectItem value="HUMAN_AGENT">HUMAN_AGENT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Recipient</Label>
                  <RadioGroup
                    value={recipientMode}
                    onValueChange={(v) => setRecipientMode(v as "conversation" | "psid")}
                    className="flex gap-6"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="conversation" /> Existing conversation
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="psid" /> PSID
                    </label>
                  </RadioGroup>

                  {recipientMode === "conversation" ? (
                    <div className="space-y-2">
                      <Select value={conversationId} onValueChange={setConversationId}>
                        <SelectTrigger className="rounded-control">
                          <SelectValue
                            placeholder={convsQ.isLoading ? "Loading" : "Select conversation"}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {convs.length === 0 && (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                              No Messenger conversations yet for this Page.
                            </div>
                          )}
                          {convs.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.contact?.name || c.contact?.phone || "Unknown"}{" "}
                              {c.last_message_preview
                                ? `— ${c.last_message_preview.slice(0, 40)}`
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {convs.length === 0 && !convsQ.isLoading && (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-control"
                            disabled={!activeAccountId || syncMut.isPending}
                            onClick={() => syncMut.mutate()}
                          >
                            {syncMut.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Sync conversations
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            Pulls recent Messenger threads for the selected Page.
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Input
                        className="rounded-control"
                        placeholder="Page-scoped ID (PSID), e.g. 6109839239...834"
                        value={recipientPsid}
                        onChange={(e) => setRecipientPsid(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        A PSID is page-scoped and only exists after the person messages this Page. A
                        Facebook profile ID or Page ID will be rejected by Meta with error #100.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Message</Label>
                  <Textarea
                    className="rounded-control min-h-[120px]"
                    placeholder="Write your message"
                    maxLength={2000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <div className="text-xs text-muted-foreground text-right">{text.length}/2000</div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4" /> Attachment (optional)
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
                    <Select
                      value={attachmentType}
                      onValueChange={(v) => setAttachmentType(v as AttachmentType | "none")}
                    >
                      <SelectTrigger className="rounded-control">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="audio">Audio</SelectItem>
                        <SelectItem value="file">File</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="rounded-control"
                      placeholder="Public URL (https://)"
                      disabled={attachmentType === "none"}
                      value={attachmentUrl}
                      onChange={(e) => setAttachmentUrl(e.target.value)}
                    />
                    {attachmentUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setAttachmentUrl("");
                          setAttachmentType("none");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Meta fetches attachments from the URL you provide. It must be publicly
                    reachable.
                  </p>
                </div>

                <Separator />

                <Tabs defaultValue="now">
                  <TabsList className="rounded-control">
                    <TabsTrigger value="now" className="rounded-control">
                      <Send className="h-4 w-4 mr-2" />
                      Send now
                    </TabsTrigger>
                    <TabsTrigger value="later" className="rounded-control">
                      <CalendarClock className="h-4 w-4 mr-2" />
                      Schedule
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="now" className="pt-3">
                    <Button
                      className="rounded-control"
                      disabled={!canSubmit || sendMut.isPending}
                      onClick={() => sendMut.mutate()}
                    >
                      {sendMut.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Send message
                    </Button>
                  </TabsContent>
                  <TabsContent value="later" className="pt-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label>Scheduled time</Label>
                      <DateTimePicker
                        className="max-w-xs"
                        fromDate={minLocal ? fromLocalDateTimeString(minLocal) : new Date()}
                        value={fromLocalDateTimeString(scheduledFor)}
                        onChange={(d) => setScheduledFor(toLocalDateTimeString(d))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Only conversations already known to the CRM can be scheduled. New PSIDs must
                        be messaged live first.
                      </p>
                    </div>
                    <Button
                      className="rounded-control"
                      disabled={
                        !canSubmit ||
                        !scheduledFor ||
                        recipientMode !== "conversation" ||
                        scheduleMut.isPending
                      }
                      onClick={() => scheduleMut.mutate()}
                    >
                      {scheduleMut.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CalendarClock className="h-4 w-4 mr-2" />
                      )}
                      Schedule
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card className="rounded-control h-fit">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Upcoming</CardTitle>
                  <CardDescription>Scheduled Messenger sends</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => qc.invalidateQueries({ queryKey: ["messenger", "scheduled"] })}
                  aria-label="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {scheduled.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No scheduled messages.
                  </p>
                )}
                {scheduled.map((row) => {
                  const r = row as {
                    id: string;
                    body: string;
                    scheduled_for: string;
                    status: string;
                    error?: string | null;
                    message_type?: string;
                  };
                  return (
                    <div
                      key={r.id}
                      className="flex items-start justify-between gap-2 border rounded-control p-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <Badge
                            variant={
                              r.status === "pending"
                                ? "secondary"
                                : r.status === "sent"
                                  ? "default"
                                  : "destructive"
                            }
                            className="rounded-control"
                          >
                            {r.status}
                          </Badge>
                          <span className="text-muted-foreground">
                            {new Date(r.scheduled_for).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm truncate">
                          {r.body || `[${r.message_type ?? "attachment"}]`}
                        </p>
                        {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                      </div>
                      {r.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => cancelMut.mutate(r.id)}
                          aria-label="Cancel scheduled message"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
