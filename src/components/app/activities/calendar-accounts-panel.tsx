import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Trash2, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { CalendarAccount, CalendarProvider } from "@/hooks/use-sales-activities";
import {
  useCalendarAccounts, useConnectCalendarAccount, useUpdateCalendarAccount, useDisconnectCalendarAccount,
} from "@/hooks/use-sales-activities";

const PROVIDER_LABELS: Record<CalendarProvider, string> = {
  google: "Google Calendar",
  outlook: "Microsoft Outlook",
  ical: "iCalendar (ICS)",
  apple: "Apple Calendar",
};

export function CalendarAccountsPanel() {
  const { data: accounts = [] } = useCalendarAccounts();
  const connect = useConnectCalendarAccount();
  const update = useUpdateCalendarAccount();
  const disconnect = useDisconnectCalendarAccount();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<CalendarProvider>("google");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [direction, setDirection] = useState<CalendarAccount["sync_direction"]>("both");

  const submit = async () => {
    if (!email) { toast.error("Email required"); return; }
    try {
      await connect.mutateAsync({ provider, account_email: email, display_name: displayName || null, sync_direction: direction });
      toast.success("Calendar connected");
      setOpen(false); setEmail(""); setDisplayName("");
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Calendar className="h-4 w-4" />Calendar sync</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Sync activities with external calendars.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>Connect calendar</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No calendars connected yet.</p>
        ) : accounts.map(a => (
          <div key={a.id} className="flex items-center justify-between rounded-control border p-3 gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{PROVIDER_LABELS[a.provider]}</span>
                {a.is_primary && <Badge variant="secondary" className="text-[11px]">primary</Badge>}
                {a.enabled ? (
                  <Badge variant="outline" className="text-[11px] gap-1"><CheckCircle2 className="h-3 w-3" />enabled</Badge>
                ) : (
                  <Badge variant="outline" className="text-[11px]">disabled</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.account_email}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Sync: {a.sync_direction} · {a.last_synced_at ? `Last synced ${new Date(a.last_synced_at).toLocaleString()}` : "Never synced"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Switch checked={a.enabled} onCheckedChange={(v) => update.mutate({ id: a.id, patch: { enabled: v } })} />
              <Button variant="ghost" size="icon" onClick={() => update.mutate({ id: a.id, patch: { last_synced_at: new Date().toISOString() } })}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="text-destructive"
                onClick={() => { if (confirm("Disconnect calendar?")) disconnect.mutate(a.id); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connect a calendar</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as CalendarProvider)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROVIDER_LABELS) as CalendarProvider[]).map(p =>
                    <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Account email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <Label>Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Work calendar" />
            </div>
            <div>
              <Label>Sync direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as CalendarAccount["sync_direction"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Two-way sync</SelectItem>
                  <SelectItem value="pull">Import from calendar only</SelectItem>
                  <SelectItem value="push">Export to calendar only</SelectItem>
                  <SelectItem value="none">No auto sync</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Sync runs in the background. OAuth setup for Google or Outlook is completed by your workspace admin
              from Integrations. You can add an iCal feed URL later from the connected account.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={connect.isPending}>Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
