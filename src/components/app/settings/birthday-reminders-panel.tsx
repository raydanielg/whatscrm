import { useEffect, useState } from "react";
import { Cake, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  useBirthdayReminderSettings,
  useUpsertBirthdayReminderSettings,
  useRunBirthdayRemindersNow,
  useUpcomingBirthdays,
} from "@/hooks/use-birthday-reminders";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const LEAD_CHOICES: Array<{ value: number; label: string }> = [
  { value: 0, label: "Same day" },
  { value: 1, label: "1 day before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "1 week before" },
  { value: 14, label: "2 weeks before" },
  { value: 30, label: "1 month before" },
];

export function BirthdayRemindersPanel() {
  const { active: ws } = useCurrentWorkspace();
  const wsId = ws?.id;
  const { data: settings, isLoading } = useBirthdayReminderSettings(wsId);
  const { data: upcoming } = useUpcomingBirthdays(wsId, 30);
  const upsert = useUpsertBirthdayReminderSettings();
  const runNow = useRunBirthdayRemindersNow();

  const [enabled, setEnabled] = useState(false);
  const [inapp, setInapp] = useState(true);
  const [email, setEmail] = useState(false);
  const [leadDays, setLeadDays] = useState<number[]>([0, 1, 7]);

  useEffect(() => {
    if (!settings) return;
    setEnabled(!!settings.enabled);
    setInapp(!!settings.inapp_enabled);
    setEmail(!!settings.email_enabled);
    setLeadDays(Array.isArray(settings.lead_days) ? settings.lead_days : [0, 1, 7]);
  }, [settings]);

  const toggleLead = (v: number) => {
    setLeadDays((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => a - b)
    );
  };

  const handleSave = async () => {
    if (!wsId) return;
    if (!leadDays.length) {
      toast.error("Pick at least one reminder timing");
      return;
    }
    try {
      await upsert.mutateAsync({
        workspace_id: wsId,
        enabled,
        lead_days: leadDays,
        email_enabled: email,
        inapp_enabled: inapp,
      });
      toast.success("Birthday reminders saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    }
  };

  const handleRunNow = async () => {
    if (!wsId) return;
    try {
      const res = await runNow.mutateAsync(wsId);
      toast.success(
        `Scan complete · ${res.contacts_matched} matched · ${res.notifications_created} alerts sent`
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Run failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <Cake className="w-5 h-5 text-primary" /> Birthday reminders
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Get alerted before your contacts' birthdays so you never miss a chance to reach out.
            Runs daily at 08:00 UTC.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunNow}
          disabled={runNow.isPending || !enabled}
        >
          {runNow.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Run scan now
        </Button>
      </div>

      <div className="rounded-control border p-4 flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">Enable birthday reminders</div>
          <div className="text-xs text-muted-foreground">
            Master switch. Turn off to pause all reminders without losing settings.
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isLoading} />
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium">Remind me</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LEAD_CHOICES.map((c) => {
            const on = leadDays.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleLead(c.value)}
                disabled={!enabled}
                className={`text-sm px-3 py-2 rounded-control border transition-colors text-left ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted border-border"
                } ${!enabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Delivery channels</Label>
        <div className="rounded-control border p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">In-app notification</div>
            <div className="text-xs text-muted-foreground">
              Shows in the bell menu and alerts panel.
            </div>
          </div>
          <Switch checked={inapp} onCheckedChange={setInapp} disabled={!enabled} />
        </div>
        <div className="rounded-control border p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">
              Email <span className="text-xs text-muted-foreground">(requires email setup)</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Sends to the contact's owner. Configure an email domain first to enable delivery.
            </div>
          </div>
          <Switch checked={email} onCheckedChange={setEmail} disabled={!enabled} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={upsert.isPending || isLoading}>
          {upsert.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Save changes
        </Button>
      </div>

      <div className="pt-2">
        <Label className="text-sm font-medium">Upcoming birthdays (next 30 days)</Label>
        <div className="mt-2 rounded-control border divide-y">
          {(upcoming ?? []).length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No birthdays in the next 30 days.
            </div>
          )}
          {(upcoming ?? []).map((u) => (
            <div key={u.id} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Cake className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{u.next_date}</div>
                </div>
              </div>
              <div className="text-xs font-medium text-primary shrink-0">
                {u.days_until === 0 ? "Today" : `in ${u.days_until}d`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
