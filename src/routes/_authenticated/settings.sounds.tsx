import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, MessageCircle, Play, Volume2 } from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useChannelAccounts } from "@/hooks/use-channel-accounts";
import { useExternalChannelAccounts } from "@/hooks/use-external-accounts";
import { useLiveChatAccounts } from "@/hooks/use-livechat-accounts";
import { FILTERABLE_CHANNELS, channelLabel, providerToChannel } from "@/lib/inbox/channel-capabilities";
import { isInboundSoundEnabled, setInboundSoundEnabled } from "@/lib/notifications/inbound-sound";
import {
  SOUND_PRESETS,
  getNotificationSoundVolume,
  getInboxAccountPreset,
  getInboxChannelPreset,
  getReminderSoundPreset,
  playSoundPreset,
  setInboxAccountPreset,
  setInboxChannelPreset,
  setReminderSoundPreset,
  setNotificationSoundVolume,
  type SoundPresetId,
} from "@/lib/notifications/sound-presets";
import { isTaskReminderSoundEnabled, setTaskReminderSoundEnabled } from "@/lib/tasks/reminder-sound";

export const Route = createFileRoute("/_authenticated/settings/sounds")({
  component: SoundSettings,
  head: () => ({ meta: [{ title: "Notification sounds — Account Settings" }] }),
});

const SOUND_CHANNELS = [...FILTERABLE_CHANNELS, "voice", "other"];

function SoundChoice({ value, onChange, label, inherit, inheritedPreset }: {
  value: SoundPresetId | "inherit";
  onChange: (value: SoundPresetId | "inherit") => void;
  label: string;
  inherit?: string;
  inheritedPreset?: SoundPresetId;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Select value={value} onValueChange={(next) => onChange(next as SoundPresetId | "inherit")}>
        <SelectTrigger aria-label={label} className="min-w-0 w-40 sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {inherit && <SelectItem value="inherit">{inherit}</SelectItem>}
          {SOUND_PRESETS.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" size="icon" aria-label={`Preview ${label}`} title={`Preview ${label}`}
        onClick={() => playSoundPreset(value === "inherit" ? inheritedPreset ?? "bright" : value)}>
        <Play className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SoundSettings() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const whatsapp = useChannelAccounts(workspaceId);
  const external = useExternalChannelAccounts(workspaceId);
  const livechat = useLiveChatAccounts(workspaceId);
  const [ready, setReady] = useState(false);
  const [, setRevision] = useState(0);
  const [inboxOn, setInboxOn] = useState(true);
  const [reminderOn, setReminderOn] = useState(false);
  const [volume, setVolume] = useState(70);

  useEffect(() => {
    setInboxOn(isInboundSoundEnabled());
    setReminderOn(isTaskReminderSoundEnabled());
    setVolume(getNotificationSoundVolume());
    setReady(true);
  }, []);

  const accounts = useMemo(() => [
    ...(whatsapp.data?.accounts ?? []),
    ...(external.data ?? []),
    ...(livechat.data ?? []),
  ].filter((account) => account.status === "connected")
    .sort((a, b) => a.display_name.localeCompare(b.display_name)),
  [whatsapp.data, external.data, livechat.data]);

  const changed = () => setRevision((n) => n + 1);
  // Message handlers read browser storage live. Selecting a sound rerenders
  // the controls immediately without a network request.

  return (
    <>
      <AppTopbar title="Notification sounds" subtitle="Choose a sound for each inbox channel and task reminders" />
      <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <div className="rounded-control border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Volume2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-semibold">Sound library</h2>
              <p className="mt-1 text-sm text-muted-foreground">12 original tones. Preview a sound before choosing it. Your selections are saved in this browser for the current workspace.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-control border border-border bg-muted/30 p-3">
            <label htmlFor="notification-sound-volume" className="min-w-28 text-sm font-medium">Sound volume</label>
            <Slider
              id="notification-sound-volume"
              aria-label="Notification sound volume"
              className="min-w-32 flex-1"
              min={0}
              max={100}
              step={1}
              value={[volume]}
              onValueChange={([next]) => { setVolume(next); setNotificationSoundVolume(next); }}
            />
            <output htmlFor="notification-sound-volume" className="w-10 text-right text-sm tabular-nums">{volume}%</output>
            <p className="w-full text-xs text-muted-foreground">Applies to previews, inbox messages, and task reminders in this browser. 0% is silent.</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {SOUND_PRESETS.map((preset) => (
              <Button key={preset.id} type="button" variant="outline" className="justify-between" onClick={() => playSoundPreset(preset.id)}>
                <span>{preset.name}</span><Play className="h-3.5 w-3.5" />
              </Button>
            ))}
          </div>
        </div>

        <section className="rounded-control border border-border bg-surface p-4 sm:p-5" aria-labelledby="inbox-sounds-title">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 id="inbox-sounds-title" className="font-semibold">Inbox messages</h2>
                <p className="mt-1 text-sm text-muted-foreground">Rings for new incoming messages. Muted conversations stay silent.</p>
              </div>
            </div>
            <Switch checked={ready && inboxOn} onCheckedChange={(on) => { setInboxOn(on); setInboundSoundEnabled(on); }} aria-label="Play inbox message sounds" />
          </div>
          {workspaceId ? (
            <div className="mt-5 space-y-5">
              <div>
                <h3 className="mb-2 text-sm font-medium">Channel defaults</h3>
                <div className="divide-y divide-border rounded-control border border-border">
                  {SOUND_CHANNELS.map((channel) => (
                    <div key={channel} className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <span className="text-sm">{channelLabel(channel)}</span>
                      <SoundChoice label={`${channelLabel(channel)} sound`} value={ready ? getInboxChannelPreset(workspaceId, channel) : "bright"}
                        onChange={(id) => { if (id !== "inherit") { setInboxChannelPreset(workspaceId, channel, id); changed(); } }} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Connected accounts</h3>
                <p className="mb-3 text-xs text-muted-foreground">Override one account or inherit its channel sound.</p>
                {(whatsapp.isLoading || external.isLoading || livechat.isLoading) && <p className="text-sm text-muted-foreground">Loading channels…</p>}
                {(whatsapp.isError || external.isError || livechat.isError || whatsapp.data?.error) &&
                  <p role="alert" className="text-sm text-destructive">Some connected channels could not load. Channel defaults still work.</p>}
                {accounts.length ? (
                  <div className="divide-y divide-border rounded-control border border-border">
                    {accounts.map((account) => {
                      const channel = providerToChannel(account.provider);
                      const accountPreset = ready ? getInboxAccountPreset(workspaceId, account.id) : null;
                      return (
                        <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium" title={account.display_name}>{account.display_name}</div>
                            <div className="text-xs text-muted-foreground">{channelLabel(channel)}</div>
                          </div>
                          <SoundChoice label={`${account.display_name} sound`} value={accountPreset ?? "inherit"}
                            inherit={`Use ${channelLabel(channel)} default`}
                            inheritedPreset={getInboxChannelPreset(workspaceId, channel)}
                            onChange={(id) => { setInboxAccountPreset(workspaceId, account.id, id === "inherit" ? null : id); changed(); }} />
                        </div>
                      );
                    })}
                  </div>
                ) : (!whatsapp.isLoading && !external.isLoading && !livechat.isLoading &&
                  <p className="text-sm text-muted-foreground">No connected accounts in this workspace.</p>)}
              </div>
            </div>
          ) : <p className="mt-4 text-sm text-muted-foreground">Choose a workspace to set channel sounds.</p>}
        </section>

        <section className="rounded-control border border-border bg-surface p-4 sm:p-5" aria-labelledby="reminder-sounds-title">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 id="reminder-sounds-title" className="font-semibold">Task reminders</h2>
                <p className="mt-1 text-sm text-muted-foreground">Plays while this app is open when a CRM or Project task reminder arrives.</p>
              </div>
            </div>
            <Switch checked={ready && reminderOn} onCheckedChange={(on) => { setReminderOn(on); setTaskReminderSoundEnabled(on); }} aria-label="Play task reminder sound" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-3">
            <span className="text-sm">Reminder sound</span>
            <SoundChoice label="Task reminder sound" value={ready ? getReminderSoundPreset() : "orbit"}
              onChange={(id) => { if (id !== "inherit") { setReminderSoundPreset(id); changed(); } }} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Reminder times and email delivery: <Link to="/settings/task-reminders" className="text-primary underline-offset-2 hover:underline">Task reminder settings</Link></p>
        </section>
      </main>
    </>
  );
}
