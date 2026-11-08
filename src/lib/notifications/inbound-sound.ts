/** Browser-local inbound sound toggle and per-workspace sound selection. */
import { playSoundPreset, resolveInboxSoundPreset } from "@/lib/notifications/sound-presets";

const SOUND_KEY = "wacrm.inbox.sound";

export function isInboundSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setInboundSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    /* storage blocked: the choice simply won't persist */
  }
}

export function playInboundChime(channel?: string, workspaceId?: string, channelAccountId?: string | null): void {
  if (typeof window === "undefined" || !isInboundSoundEnabled()) return;
  playSoundPreset(resolveInboxSoundPreset(workspaceId, channel, channelAccountId));
}
