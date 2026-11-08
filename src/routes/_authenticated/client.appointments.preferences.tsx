import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getMyReminderPreferences, saveMyReminderPreferences } from "@/lib/client-portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/client/appointments/preferences")({
  component: ReminderPreferencesPage,
});

type Prefs = {
  channels: { email: boolean; sms: boolean; whatsapp: boolean; push: boolean };
  timings: { one_hour: boolean; twenty_four_hours: boolean; three_days: boolean };
};

function ReminderPreferencesPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyReminderPreferences);
  const saveFn = useServerFn(saveMyReminderPreferences);
  const q = useQuery({ queryKey: ["portal-reminder-prefs"], queryFn: () => getFn() });
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => { if (q.data) setPrefs(q.data as Prefs); }, [q.data]);

  const mut = useMutation({
    mutationFn: (p: Prefs) => saveFn({ data: p }),
    onSuccess: () => { toast.success("Preferences saved"); qc.invalidateQueries({ queryKey: ["portal-reminder-prefs"] }); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading || !prefs) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading</div>;

  const channels: { key: keyof Prefs["channels"]; label: string; hint: string }[] = [
    { key: "email", label: "Email", hint: "Reminders to your registered email" },
    { key: "whatsapp", label: "WhatsApp", hint: "Message on WhatsApp" },
    { key: "sms", label: "SMS", hint: "Text message to your phone" },
    { key: "push", label: "Push notifications", hint: "In-browser or mobile push" },
  ];
  const timings: { key: keyof Prefs["timings"]; label: string; hint: string }[] = [
    { key: "one_hour", label: "1 hour before", hint: "Just before your meeting" },
    { key: "twenty_four_hours", label: "24 hours before", hint: "The day before" },
    { key: "three_days", label: "3 days before", hint: "Advance notice" },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <Link to="/client/appointments" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back to appointments</Link>

      <header>
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2"><Bell className="w-5 h-5" /> Reminder preferences</h2>
        <p className="text-sm text-muted-foreground mt-1">Choose how and when to be reminded of upcoming appointments.</p>
      </header>

      <section className="rounded-control border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold mb-3">Channels</h3>
        <div className="divide-y divide-border">
          {channels.map((c) => (
            <label key={c.key} className="flex items-center justify-between py-3 gap-4">
              <div>
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.hint}</p>
              </div>
              <Switch checked={prefs.channels[c.key]} onCheckedChange={(v) => setPrefs({ ...prefs, channels: { ...prefs.channels, [c.key]: v } })} />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-control border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold mb-3">Timing</h3>
        <div className="divide-y divide-border">
          {timings.map((t) => (
            <label key={t.key} className="flex items-center justify-between py-3 gap-4">
              <div>
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.hint}</p>
              </div>
              <Switch checked={prefs.timings[t.key]} onCheckedChange={(v) => setPrefs({ ...prefs, timings: { ...prefs.timings, [t.key]: v } })} />
            </label>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate(prefs)} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null} Save preferences
        </Button>
      </div>
    </div>
  );
}
