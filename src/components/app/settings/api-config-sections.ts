import { Activity, Bell, Bot, ClipboardList, Code2, Facebook, FileText, Flame, HeartPulse, Instagram, Key, Linkedin, Mail, MessageCircle, MessageSquare, MessagesSquare, Music2, Plug, QrCode, RefreshCw, Send, ShieldCheck, Smartphone, Youtube } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Canonical catalog of the "API Configurations" panels.
 *
 * Single source of truth shared by the sidebar (`API_CONFIG_CHILDREN`) and the
 * `/api-config/$section` route, so a panel can never exist in one place and be
 * unreachable from the other. Each `id` IS the URL segment: `/api-config/<id>`.
 */
export type ApiConfigSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Short description used for per-section page metadata. */
  description: string;
};

export const API_CONFIG_SECTIONS: ApiConfigSection[] = [
  { id: "ai", label: "AI", icon: Bot, description: "Configure AI providers, models and usage limits." },
  { id: "wa-health", label: "WhatsApp Health", icon: HeartPulse, description: "Monitor the health of your WhatsApp integration." },
  { id: "whatsapp", label: "WhatsApp Accounts", icon: MessageSquare, description: "Connect and manage WhatsApp Business accounts." },
  { id: "wa-webhook", label: "WhatsApp Webhook", icon: Plug, description: "Configure and verify the WhatsApp webhook endpoint." },
  { id: "wa-qr", label: "QR WhatsApp Login", icon: QrCode, description: "Link WhatsApp devices with a QR session." },
  { id: "wa-devices", label: "WhatsApp Devices", icon: Smartphone, description: "Manage linked WhatsApp devices and sessions." },
  { id: "wa-warmer", label: "WhatsApp Warmer", icon: Flame, description: "Warm up numbers to protect sending reputation." },
  { id: "instagram", label: "Instagram", icon: Instagram, description: "Connect Instagram professional accounts." },
  { id: "instagram-bot", label: "Instagram Chatbot", icon: Bot, description: "Automate Instagram direct message replies." },
  { id: "instagram-comments", label: "Instagram Comment Automation", icon: MessagesSquare, description: "Automate replies to Instagram comments." },
  { id: "meta-app", label: "Meta App", icon: ShieldCheck, description: "Store Meta app credentials securely and verify the Messenger connection." },
  { id: "messenger", label: "Messenger Accounts", icon: MessageCircle, description: "Connect Facebook Pages for Messenger." },
  { id: "messenger-bot", label: "Messenger Chatbot", icon: Bot, description: "Automate Messenger conversations." },
  { id: "facebook-comments", label: "Facebook Comments", icon: Facebook, description: "Bring Facebook Page post comments into the Inbox and reply publicly." },
  { id: "youtube", label: "YouTube Comments", icon: Youtube, description: "Bring YouTube video comments into the Inbox and reply from it." },
  { id: "linkedin", label: "LinkedIn Comments", icon: Linkedin, description: "Bring LinkedIn post comments into the Inbox and reply from it." },
  { id: "tiktok", label: "TikTok Comments", icon: Music2, description: "Bring TikTok Business video comments into the Inbox and reply from it." },
  { id: "tiktok-dm", label: "TikTok Messages", icon: MessagesSquare, description: "Receive and reply to TikTok Business direct messages from the Inbox." },
  { id: "tiktok-bot", label: "TikTok Chatbot", icon: Bot, description: "Answer TikTok direct messages automatically with an AI chatbot." },
  { id: "telegram", label: "Telegram Bots", icon: Send, description: "Connect Telegram bots and route chats into the Inbox." },
  { id: "email", label: "Email Accounts", icon: Mail, description: "Connect sender identities and inbound addresses for email conversations." },
  { id: "sms", label: "SMS Numbers", icon: MessageSquare, description: "Connect SMS numbers so inbound texts route into the Inbox." },
  { id: "wa-forms", label: "WhatsApp Forms", icon: ClipboardList, description: "Build interactive WhatsApp flows and forms." },
  { id: "wa-rest", label: "REST API", icon: Code2, description: "Send messages over the REST API." },
  { id: "wa-conversational", label: "Conversational API", icon: MessagesSquare, description: "Drive conversations programmatically." },
  { id: "wa-template-api", label: "Template API", icon: FileText, description: "Manage message templates over the API." },
  { id: "wa-api-dashboard", label: "API Dashboard", icon: Activity, description: "Inspect API traffic, errors and latency." },
  { id: "templates", label: "Message Templates", icon: FileText, description: "Create and sync WhatsApp message templates." },
  { id: "sync", label: "Synchronization", icon: RefreshCw, description: "Run and monitor provider synchronization jobs." },
  { id: "provider", label: "Provider Registry", icon: Plug, description: "Review available messaging providers." },
  { id: "api", label: "API keys", icon: Key, description: "Generate and manage workspace API keys." },
];

/** Notifications panel lives under Account, not API Configurations. */
export const NOTIFICATIONS_ICON = Bell;

export const DEFAULT_API_CONFIG_SECTION = "ai";

const SECTION_IDS = new Set(API_CONFIG_SECTIONS.map((s) => s.id));

export function isApiConfigSection(id: string | undefined | null): boolean {
  return !!id && SECTION_IDS.has(id);
}

export function getApiConfigSection(id: string): ApiConfigSection | undefined {
  return API_CONFIG_SECTIONS.find((s) => s.id === id);
}
