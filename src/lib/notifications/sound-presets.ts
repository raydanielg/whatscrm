/** Twelve original Web Audio tones. No downloaded or third-party audio assets. */
export const SOUND_PRESETS = [
  { id: "bright", name: "Bright", notes: [659, 880], wave: "sine", step: 0.12, length: 0.15 },
  { id: "soft", name: "Soft", notes: [523, 659], wave: "sine", step: 0.16, length: 0.19 },
  { id: "glass", name: "Glass", notes: [784, 1175], wave: "triangle", step: 0.13, length: 0.17 },
  { id: "pulse", name: "Pulse", notes: [587, 587, 784], wave: "sine", step: 0.13, length: 0.11 },
  { id: "rise", name: "Rise", notes: [494, 659, 988], wave: "sine", step: 0.13, length: 0.16 },
  { id: "drop", name: "Drop", notes: [988, 740, 587], wave: "triangle", step: 0.13, length: 0.16 },
  { id: "marimba", name: "Marimba", notes: [523, 784], wave: "sine", step: 0.18, length: 0.22 },
  { id: "bell", name: "Bell", notes: [880, 1175, 880], wave: "sine", step: 0.18, length: 0.22 },
  { id: "spark", name: "Spark", notes: [1047, 1319, 1568], wave: "triangle", step: 0.09, length: 0.11 },
  { id: "warm", name: "Warm", notes: [392, 523, 659], wave: "sine", step: 0.17, length: 0.21 },
  { id: "signal", name: "Signal", notes: [698, 698, 932], wave: "triangle", step: 0.15, length: 0.12 },
  { id: "orbit", name: "Orbit", notes: [587, 784, 1047, 784], wave: "sine", step: 0.12, length: 0.15 },
] as const;

export type SoundPresetId = (typeof SOUND_PRESETS)[number]["id"];
const SOUND_IDS = new Set<string>(SOUND_PRESETS.map((preset) => preset.id));
const REMINDER_KEY = "wacrm.task-reminders.sound-preset";
const INBOX_KEY_PREFIX = "wacrm.inbox.sound-presets.";
const VOLUME_KEY = "wacrm.notification-sounds.volume";
const DEFAULT_VOLUME = 70;
// Give short tones enough headroom while keeping their sustained peaks staggered.
const MAX_NOTE_GAIN = 0.6;

type InboxChoices = { channels: Record<string, SoundPresetId>; accounts: Record<string, SoundPresetId> };
const EMPTY_CHOICES = (): InboxChoices => ({ channels: {}, accounts: {} });

function stored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function save(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch { /* browser storage unavailable */ }
}

export function isSoundPresetId(value: unknown): value is SoundPresetId {
  return typeof value === "string" && SOUND_IDS.has(value);
}

export function getReminderSoundPreset(): SoundPresetId {
  const value = stored(REMINDER_KEY);
  return isSoundPresetId(value) ? value : "orbit";
}

export function setReminderSoundPreset(id: SoundPresetId): void {
  save(REMINDER_KEY, id);
}

/** One browser-local level for previews, inbox alerts, and task reminders. */
export function getNotificationSoundVolume(): number {
  const value = stored(VOLUME_KEY);
  if (value === null || value.trim() === "") return DEFAULT_VOLUME;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : DEFAULT_VOLUME;
}

export function setNotificationSoundVolume(value: number): void {
  if (!Number.isFinite(value)) return;
  save(VOLUME_KEY, String(Math.round(Math.min(100, Math.max(0, value)))));
}

function inboxChoices(workspaceId: string): InboxChoices {
  try {
    const parsed: unknown = JSON.parse(stored(`${INBOX_KEY_PREFIX}${workspaceId}`) ?? "null");
    if (!parsed || typeof parsed !== "object") return EMPTY_CHOICES();
    const value = parsed as Partial<InboxChoices>;
    const clean = (input: unknown): Record<string, SoundPresetId> => {
      if (!input || typeof input !== "object") return {};
      return Object.fromEntries(Object.entries(input).filter(([, id]) => isSoundPresetId(id))) as Record<string, SoundPresetId>;
    };
    return { channels: clean(value.channels), accounts: clean(value.accounts) };
  } catch { return EMPTY_CHOICES(); }
}

/** Defaults preserve distinct audible cues for the existing inbox channels. */
const CHANNEL_DEFAULTS: Record<string, SoundPresetId> = {
  whatsapp: "bright", messenger: "soft", instagram: "glass", telegram: "pulse",
  email: "warm", sms: "signal", webchat: "spark", livechat: "spark", voice: "bell",
};

function soundChannel(channel: string): string {
  const normalized = channel.toLowerCase();
  return normalized === "livechat" ? "webchat" : normalized;
}

export function getInboxChannelPreset(workspaceId: string, channel: string): SoundPresetId {
  const normalized = soundChannel(channel);
  return inboxChoices(workspaceId).channels[normalized] ?? CHANNEL_DEFAULTS[normalized] ?? "bright";
}

export function setInboxChannelPreset(workspaceId: string, channel: string, id: SoundPresetId): void {
  const choices = inboxChoices(workspaceId);
  choices.channels[soundChannel(channel)] = id;
  save(`${INBOX_KEY_PREFIX}${workspaceId}`, JSON.stringify(choices));
}

export function getInboxAccountPreset(workspaceId: string, accountId: string): SoundPresetId | null {
  return inboxChoices(workspaceId).accounts[accountId] ?? null;
}

export function setInboxAccountPreset(workspaceId: string, accountId: string, id: SoundPresetId | null): void {
  const choices = inboxChoices(workspaceId);
  if (id) choices.accounts[accountId] = id;
  else delete choices.accounts[accountId];
  save(`${INBOX_KEY_PREFIX}${workspaceId}`, JSON.stringify(choices));
}

export function resolveInboxSoundPreset(workspaceId: string | undefined, channel: string | undefined, accountId?: string | null): SoundPresetId {
  const normalized = soundChannel(channel ?? "");
  if (!workspaceId) return CHANNEL_DEFAULTS[normalized] ?? "bright";
  const choices = inboxChoices(workspaceId);
  return (accountId && choices.accounts[accountId]) || choices.channels[normalized] || CHANNEL_DEFAULTS[normalized] || "bright";
}

let audioContext: AudioContext | null = null;

/** A preview call also unlocks audio after the browser's first user gesture. */
export function playSoundPreset(id: SoundPresetId): void {
  if (typeof window === "undefined") return;
  const volume = getNotificationSoundVolume();
  if (volume === 0) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext ??= new Ctor();
    if (audioContext.state === "suspended") void audioContext.resume();
    const preset = SOUND_PRESETS.find((entry) => entry.id === id) ?? SOUND_PRESETS[0];
    const start = audioContext.currentTime;
    preset.notes.forEach((frequency, index) => {
      const oscillator = audioContext!.createOscillator();
      const gain = audioContext!.createGain();
      const at = start + index * preset.step;
      const peak = (volume / 100) * MAX_NOTE_GAIN;
      oscillator.type = preset.wave;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.015);
      gain.gain.setValueAtTime(peak, at + preset.length * 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + preset.length);
      oscillator.connect(gain).connect(audioContext!.destination);
      oscillator.start(at);
      oscillator.stop(at + preset.length + 0.01);
    });
  } catch { /* Browser audio may be unavailable or blocked until interaction. */ }
}
