/**
 * The messaging channel a workflow node belongs to, read from its type name
 * (e.g. "action.whatsapp.send_template" -> "whatsapp"). Returns null for nodes
 * that are not tied to one channel, which keep their plain icon.
 */
const CHANNEL_NEEDLES: Array<[needle: string, channel: string]> = [
  ["whatsapp", "whatsapp"],
  ["messenger", "messenger"],
  ["instagram", "instagram"],
  ["telegram", "telegram"],
  ["sms", "sms"],
  ["email", "email"],
  ["livechat", "livechat"],
];

export function nodeChannel(type: string): string | null {
  const t = type.toLowerCase();
  for (const [needle, channel] of CHANNEL_NEEDLES) {
    if (t.includes(needle)) return channel;
  }
  return null;
}
