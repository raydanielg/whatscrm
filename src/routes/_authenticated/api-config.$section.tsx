import { Brand } from "@/components/brand";
import type React from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { cn } from "@/lib/utils";
import {
  API_CONFIG_SECTIONS,
  DEFAULT_API_CONFIG_SECTION,
  getApiConfigSection,
  isApiConfigSection,
} from "@/components/app/settings/api-config-sections";
import { WhatsAppRestApiPanel } from "@/components/app/whatsapp/whatsapp-rest-api-panel";
import { WhatsAppConversationalApiPanel } from "@/components/app/whatsapp/whatsapp-conversational-api-panel";
import { WhatsAppTemplateApiPanel } from "@/components/app/whatsapp/whatsapp-template-api-panel";
import { WhatsAppApiDashboardPanel } from "@/components/app/whatsapp/whatsapp-api-dashboard-panel";
import { WhatsAppQrPanel } from "@/components/app/whatsapp/whatsapp-qr-panel";
import { WhatsAppDevicesPanel } from "@/components/app/whatsapp/whatsapp-devices-panel";
import { WhatsAppWarmerPanel } from "@/components/app/whatsapp/whatsapp-warmer-panel";
import { WhatsAppAccountsPanel } from "@/components/app/whatsapp/whatsapp-accounts-panel";
import { WhatsAppTemplatesPanel } from "@/components/app/whatsapp/whatsapp-templates-panel";
import { SyncDashboard } from "@/components/app/whatsapp/sync-dashboard";
import { WhatsAppIntegrationHealth } from "@/components/app/whatsapp/integration-health";
import { AiSettingsPanel } from "@/components/app/ai/ai-settings-panel";
import { InstagramAccountsPanel } from "@/components/app/instagram/instagram-accounts-panel";
import { InstagramChatbotsPanel } from "@/components/app/instagram/instagram-chatbots-panel";
import { InstagramCommentAutomationsPanel } from "@/components/app/instagram/instagram-comment-automations-panel";
import { MetaAppSettingsPanel } from "@/components/app/messenger/meta-app-settings-panel";
import { MessengerAccountsPanel } from "@/components/app/messenger/messenger-accounts-panel";
import { MessengerChatbotsPanel } from "@/components/app/messenger/messenger-chatbots-panel";
import { TelegramAccountsPanel } from "@/components/app/telegram/telegram-accounts-panel";
import { EmailAccountsPanel } from "@/components/app/email/email-accounts-panel";
import { SmsAccountsPanel } from "@/components/app/sms/sms-accounts-panel";
import { WhatsAppFormsPanel } from "@/components/app/whatsapp/whatsapp-forms-panel";
import { WhatsAppWebhookPanel } from "@/components/app/whatsapp/whatsapp-webhook-panel";
import { ApiKeysManager } from "@/components/app/developer/api-keys-manager";
import {
  FacebookCommentsPanel,
  LinkedInCommentsPanel,
  TikTokCommentsPanel,
  YouTubeCommentsPanel,
} from "@/components/app/social-inbox/social-inbox-channel-panel";
import { TikTokDmPanel } from "@/components/app/social-inbox/tiktok-dm-panel";
import { TikTokChatbotPanel } from "@/components/app/social-inbox/tiktok-chatbot-panel";
import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/_authenticated/api-config/$section")({
  beforeLoad: ({ params }) => {
    if (!isApiConfigSection(params.section)) {
      throw redirect({
        to: "/api-config/$section",
        params: { section: DEFAULT_API_CONFIG_SECTION },
      });
    }
  },
  head: ({ params }) => {
    const section = getApiConfigSection(params.section);
    const title = `${section?.label ?? "API Configurations"} — API Configurations`;
    const description =
      section?.description ?? "Configure channels, providers and API access for your workspace.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: ApiConfigPage,
});

function ProviderRegistryPanel() {
  return (
    <div className="space-y-4">
      <h2 className="font-bold text-xl">Provider registry</h2>
      <p className="text-sm text-muted-foreground">
        <Brand /> routes every conversation through a provider abstraction. Meta WhatsApp Cloud API
        ships enabled; Twilio and 360dialog slots are reserved.
      </p>
      <div className="grid gap-3">
        {[
          {
            name: "Meta WhatsApp Cloud API",
            status: "Enabled",
            desc: "Official Cloud API — configure accounts in the WhatsApp Accounts tab.",
          },
          {
            name: "Twilio WhatsApp",
            status: "Reserved",
            desc: "Provider slot ready for a future implementation.",
          },
          {
            name: "360dialog",
            status: "Reserved",
            desc: "Provider slot ready for a future implementation.",
          },
          {
            name: "Mock provider",
            status: "Testing only",
            desc: "Simulates delivery for local development.",
          },
        ].map((p) => (
          <div
            key={p.name}
            className="flex items-center justify-between rounded-control border border-border p-4"
          >
            <div>
              <div className="font-medium text-sm">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.desc}</div>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-control ${p.status === "Enabled" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
            >
              {p.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApiKeysPanel() {
  return (
    <div className="space-y-4">
      <h2 className="font-bold text-xl">API keys</h2>
      <p className="text-sm text-muted-foreground">
        Generate keys for programmatic access to your workspace.
      </p>
      <ApiKeysManager />
    </div>
  );
}

/** Panel renderer per section id — keys must match API_CONFIG_SECTIONS. */
const PANELS: Record<string, React.ComponentType> = {
  ai: AiSettingsPanel,
  "wa-health": WhatsAppIntegrationHealth,
  whatsapp: WhatsAppAccountsPanel,
  "wa-webhook": WhatsAppWebhookPanel,
  "wa-qr": WhatsAppQrPanel,
  "wa-devices": WhatsAppDevicesPanel,
  "wa-warmer": WhatsAppWarmerPanel,
  instagram: InstagramAccountsPanel,
  "instagram-bot": InstagramChatbotsPanel,
  "instagram-comments": InstagramCommentAutomationsPanel,
  "meta-app": MetaAppSettingsPanel,
  messenger: MessengerAccountsPanel,
  "messenger-bot": MessengerChatbotsPanel,
  "facebook-comments": FacebookCommentsPanel,
  youtube: YouTubeCommentsPanel,
  linkedin: LinkedInCommentsPanel,
  tiktok: TikTokCommentsPanel,
  "tiktok-dm": TikTokDmPanel,
  "tiktok-bot": TikTokChatbotPanel,
  telegram: TelegramAccountsPanel,
  email: EmailAccountsPanel,
  sms: SmsAccountsPanel,
  "wa-forms": WhatsAppFormsPanel,
  "wa-rest": WhatsAppRestApiPanel,
  "wa-conversational": WhatsAppConversationalApiPanel,
  "wa-template-api": WhatsAppTemplateApiPanel,
  "wa-api-dashboard": WhatsAppApiDashboardPanel,
  templates: WhatsAppTemplatesPanel,
  sync: SyncDashboard,
  provider: ProviderRegistryPanel,
  api: ApiKeysPanel,
} as unknown as Record<string, React.ComponentType>;

const NAV_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Platform", ids: ["ai", "api", "provider", "sync"] },
  {
    label: "WhatsApp",
    ids: [
      "whatsapp",
      "wa-health",
      "wa-webhook",
      "wa-qr",
      "wa-devices",
      "wa-warmer",
      "wa-forms",
      "templates",
    ],
  },
  {
    label: "WhatsApp API",
    ids: ["wa-rest", "wa-conversational", "wa-template-api", "wa-api-dashboard"],
  },
  { label: "Meta & Messenger", ids: ["meta-app", "messenger", "messenger-bot"] },
  { label: "Instagram", ids: ["instagram", "instagram-bot", "instagram-comments"] },
  { label: "Social Inbox", ids: ["facebook-comments", "youtube", "linkedin"] },
  { label: "TikTok", ids: ["tiktok", "tiktok-dm", "tiktok-bot"] },
  { label: "Telegram", ids: ["telegram"] },
  { label: "Email & SMS", ids: ["email", "sms"] },
];

const groupOf = (id: string) => NAV_GROUPS.find((g) => g.ids.includes(id))?.label ?? "";

function ApiConfigPage() {
  const { section } = Route.useParams();
  const current = getApiConfigSection(section);
  const Panel = PANELS[section] ?? PANELS[DEFAULT_API_CONFIG_SECTION];
  // Accordion: exactly one group open — the one holding the current page by default.
  const [openGroup, setOpenGroup] = useState(() => groupOf(section));
  useEffect(() => setOpenGroup(groupOf(section)), [section]);

  return (
    <>
      <AppTopbar
        title={current?.label ?? "API Configurations"}
        subtitle={current?.description ?? "Channels, providers and API access"}
      />
      <main className="p-6 max-w-7xl mx-auto w-full flex flex-col md:flex-row items-start gap-6">
        <nav
          className="md:w-56 w-full shrink-0 md:sticky md:top-[calc(3.75rem+1.5rem)] md:self-start"
          aria-label="API configurations"
        >
          <Accordion
            type="single"
            collapsible
            value={openGroup}
            onValueChange={setOpenGroup}
            className="space-y-1"
          >
          {NAV_GROUPS.map((group) => {
            const items = group.ids
              .map((id) => getApiConfigSection(id))
              .filter((s): s is NonNullable<typeof s> => !!s);
            if (!items.length) return null;
            const active = group.ids.includes(section);
            return (
              <AccordionItem key={group.label} value={group.label} className="border-b-0">
                <AccordionTrigger
                  className={cn(
                    "rounded-control px-3 py-2 text-[11px] font-semibold uppercase tracking-wide hover:bg-muted hover:no-underline [&>svg]:h-3.5 [&>svg]:w-3.5",
                    active ? "text-foreground" : "text-muted-foreground/80",
                  )}
                >
                  {group.label}
                </AccordionTrigger>
                <AccordionContent className="pb-1 pt-0.5">
                <div className="space-y-px">
                  {items.map((s) => (
                    <Link
                      key={s.id}
                      to="/api-config/$section"
                      params={{ section: s.id }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-control text-xs font-medium text-left transition-colors",
                        section === s.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-foreground/80",
                      )}
                      aria-current={section === s.id ? "page" : undefined}
                    >
                      <s.icon className="w-4 h-4 shrink-0" />
                      {s.label}
                    </Link>
                  ))}
                </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
          </Accordion>
        </nav>

        <div className="flex-1 min-w-0 rounded-control border border-border bg-surface shadow-sm p-6">
          <Panel />
        </div>
      </main>
    </>
  );
}
