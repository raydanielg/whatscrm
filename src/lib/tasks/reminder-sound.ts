import { getReminderSoundPreset, playSoundPreset } from "@/lib/notifications/sound-presets";

const SOUND_KEY = "wacrm.task-reminders.sound";

export function isTaskReminderSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function setTaskReminderSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, enabled ? "1" : "0");
  } catch {
    // Browsers can disable local storage; the current setting still works.
  }
}

export function playTaskReminderSound(preview = false): void {
  if (typeof window === "undefined" || (!preview && !isTaskReminderSoundEnabled())) return;
  playSoundPreset(getReminderSoundPreset());
}
