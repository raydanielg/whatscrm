import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Mail, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { broadcastNotification } from "@/lib/admin/communications.functions";
import { TranslationsEditor } from "./translations-editor";
import type { Translations } from "@/lib/i18n/languages";

export function NotificationsBroadcaster() {
  const send = useServerFn(broadcastNotification);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"in_app" | "email">("in_app");
  const [audience, setAudience] = useState<"all" | "owners" | "admins">("all");
  const [category, setCategory] = useState("system");
  const [actionUrl, setActionUrl] = useState("");
  const [translations, setTranslations] = useState<Translations>({});

  const mSend = useMutation({
    mutationFn: async () =>
      send({
        data: {
          title,
          body: body || undefined,
          channel,
          audience,
          category,
          action_url: actionUrl || undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Delivered to ${res.sent} recipient${res.sent === 1 ? "" : "s"}`);
      setTitle("");
      setBody("");
      setActionUrl("");
      setTranslations({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 rounded-control border border-border bg-surface p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
            {channel === "email" ? <Mail className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-display font-semibold">Broadcast notification</div>
            <div className="text-xs text-muted-foreground">
              Reach every tenant instantly, in-app or by email.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as "in_app" | "email")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_app">In-app</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Audience</Label>
            <Select
              value={audience}
              onValueChange={(v) => setAudience(v as "all" | "owners" | "admins")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="owners">Workspace owners</SelectItem>
                <SelectItem value="admins">Workspace admins</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="product">Product update</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="security">Security</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Title (English)</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short headline"
          />
        </div>
        <div>
          <Label className="text-xs">Body (English)</Label>
          <RichTextarea
            rows={4}
            value={body}
            onChange={(v) => setBody(v)}
            placeholder="Optional message body"
          />
        </div>
        <div>
          <Label className="text-xs">Action URL (optional)</Label>
          <Input
            value={actionUrl}
            onChange={(e) => setActionUrl(e.target.value)}
            placeholder="https://"
          />
        </div>

        <TranslationsEditor translations={translations} onChange={setTranslations} />

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button
            onClick={() => mSend.mutate()}
            disabled={!title.trim() || mSend.isPending}
            className="gap-1.5"
          >
            {mSend.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send now
          </Button>
        </div>
      </div>

      <div className="rounded-control border border-border bg-surface p-5 space-y-3">
        <div className="font-display font-semibold">Preview</div>
        <div className="rounded-control border border-border bg-muted/20 p-3">
          <div className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-control bg-accent/10 text-accent grid place-items-center shrink-0">
              <Bell className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{title || "Notification title"}</div>
              {body && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-3">{body}</div>
              )}
              <div className="text-[11px] text-muted-foreground mt-2 ">{category}</div>
            </div>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Recipients receive the localized version matching their profile language, falling back to
          English.
        </div>
      </div>
    </div>
  );
}
