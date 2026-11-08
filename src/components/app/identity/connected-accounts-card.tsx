import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  MessageCircle,
  Instagram,
  Facebook,
  Send,
  Mail,
  MessageSquare,
  Phone,
  Hash,
  Slack,
  Users,
  Circle,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useAttachIdentity,
  useChannelIdentities,
  useDetachIdentity,
} from "@/hooks/use-identity-engine";

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  whatsapp_cloud: MessageCircle,
  whatsapp_qr: MessageCircle,
  instagram: Instagram,
  messenger: Facebook,
  telegram: Send,
  email: Mail,
  live_chat: MessageSquare,
  sms: Phone,
  discord: Hash,
  slack: Slack,
  teams: Users,
};

/** Brand-ish accent per channel, used for the icon chip in the picker and account rows. */
const CHANNEL_COLORS: Record<string, string> = {
  whatsapp_cloud: "#25D366",
  whatsapp_qr: "#25D366",
  instagram: "#E4405F",
  messenger: "#0084FF",
  telegram: "#26A5E4",
  email: "#075E54",
  live_chat: "#6366F1",
  sms: "#F59E0B",
  discord: "#5865F2",
  slack: "#4A154B",
  teams: "#6264A7",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp_cloud: "WhatsApp",
  whatsapp_qr: "WhatsApp QR",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  email: "Email",
  live_chat: "Live Chat",
  sms: "SMS",
  discord: "Discord",
  slack: "Slack",
  teams: "Teams",
};

function ChannelChip({ channel, className }: { channel: string; className?: string }) {
  const Icon = CHANNEL_ICONS[channel] ?? Circle;
  const color = CHANNEL_COLORS[channel] ?? "#64748B";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-control bg-card", className)}
    >
      <Icon className="h-3.5 w-3.5" style={{ color }} />
    </span>
  );
}

export function ConnectedAccountsCard({ contactId }: { contactId: string }) {
  const { data: identities, isLoading } = useChannelIdentities(contactId);
  const detach = useDetachIdentity();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Connected accounts</CardTitle>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 " /> Link
        </Button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading</p>
        ) : !identities || identities.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No channels linked yet. This customer will get linked automatically the first time they message you.
          </p>
        ) : (
          identities.map((i) => {
            return (
              <div
                key={i.id}
                className="flex items-center gap-2 rounded-control border border-border p-2"
              >
                <ChannelChip channel={i.channel} className="h-7 w-7" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {CHANNEL_LABELS[i.channel] ?? i.channel}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{i.external_id}</p>
                </div>
                {i.verified && (
                  <Badge variant="secondary" className="text-[11px] h-4">
                    verified
                  </Badge>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={async () => {
                    try {
                      await detach.mutateAsync(i.id);
                      toast.success("Unlinked");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Unlink failed");
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
      <AddIdentityDialog contactId={contactId} open={addOpen} onOpenChange={setAddOpen} />
    </Card>
  );
}

function AddIdentityDialog({
  contactId,
  open,
  onOpenChange,
}: {
  contactId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [channel, setChannel] = useState("whatsapp_cloud");
  const [externalId, setExternalId] = useState("");
  const attach = useAttachIdentity();

  const submit = async () => {
    try {
      await attach.mutateAsync({ contactId, channel, externalId });
      toast.success("Channel linked");
      onOpenChange(false);
      setExternalId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a channel identity</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CHANNEL_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    <span className="flex items-center gap-2">
                      <ChannelChip channel={v} className="h-6 w-6" />
                      {l}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Handle / external id</Label>
            <Input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="+1555, @handle, user@example.com"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!externalId || attach.isPending}>
            Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
