/**
 * Channel registry — the ONE map from `ChannelKind` → implementation.
 *
 * Adding a new provider:
 *   1. Create `./providers/<kind>.ts` implementing `ChannelProvider`.
 *   2. Import and register it here.
 *   3. Done — engines, UI, DB all pick it up automatically.
 */

import type { ChannelKind } from "../types";
import type { ChannelProvider } from "./channel";
import { stubChannel } from "./channel";
import { whatsappCloudChannel } from "./providers/whatsapp-cloud";
import { whatsappQrChannel } from "./providers/whatsapp-qr";
import { instagramChannel } from "./providers/instagram";
import { messengerChannel } from "./providers/messenger";
import { telegramChannel } from "./providers/telegram";
import { emailChannel } from "./providers/email";
import { liveChatChannel } from "./providers/live-chat";
import { smsChannel } from "./providers/sms";

const channels: Record<ChannelKind, ChannelProvider> = {
  // Active
  whatsapp_cloud: whatsappCloudChannel,
  whatsapp_qr: whatsappQrChannel,
  instagram: instagramChannel,
  messenger: messengerChannel,
  telegram: telegramChannel,
  email: emailChannel,
  live_chat: liveChatChannel,
  sms: smsChannel,
  // Future — scaffolded stubs; light them up by dropping a real implementation.
  discord: stubChannel("discord", "Discord", ["text", "emoji", "image", "reaction", "reply_quote"]),
  slack: stubChannel("slack", "Slack", ["text", "emoji", "image", "document", "reaction", "reply_quote", "threads"]),
  teams: stubChannel("teams", "Microsoft Teams", ["text", "emoji", "image", "document", "reaction", "reply_quote", "threads"]),
  apple_business: stubChannel("apple_business", "Apple Business Messages", ["text", "image", "interactive_list", "interactive_buttons"]),
  google_business: stubChannel("google_business", "Google Business Messages", ["text", "image", "interactive_buttons"]),
  line: stubChannel("line", "LINE", ["text", "emoji", "image", "video", "audio", "location", "template"]),
  viber: stubChannel("viber", "Viber", ["text", "emoji", "image", "video", "audio", "location"]),
  wechat: stubChannel("wechat", "WeChat", ["text", "emoji", "image", "video", "audio", "location"]),
};

export function getChannel(kind: ChannelKind): ChannelProvider {
  const c = channels[kind];
  if (!c) throw new Error(`Unknown channel: ${kind}`);
  return c;
}

export function listChannels(): ChannelProvider[] {
  return Object.values(channels);
}

export function listImplementedChannels(): ChannelProvider[] {
  return listChannels().filter((c) => c.implemented);
}

export function channelSupports(kind: ChannelKind, cap: Parameters<ChannelProvider["capabilities"]["has"]>[0]): boolean {
  return getChannel(kind).capabilities.has(cap);
}
