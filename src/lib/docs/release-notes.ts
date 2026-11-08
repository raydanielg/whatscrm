import { APP_RELEASE_CHANNEL, APP_VERSION } from "@/lib/app-version";
import type { PdfBlock } from "@/lib/docs/simple-pdf";

export interface ReleaseNotes {
  version: string;
  date: string;
  headline: string;
  sections: { title: string; items: string[] }[];
}

/** Release notes for the current version, mirroring docs/changelog.html. */
export const CURRENT_RELEASE_NOTES: ReleaseNotes = {
  version: APP_VERSION,
  date: "2026-10-26",
  headline:
    "Version 6.8.9 adds tenant-owned AI keys, social comments and TikTok messages in the Inbox, a TikTok chatbot, long-lived YouTube connections and unified notifications.",
  sections: [
    {
      title: "AI",
      items: [
        "Bring your own OpenAI or Gemini API key, encrypted in Supabase Vault and billed to the key owner.",
        "Choose from a cost-tiered model catalog; replies fall back to another model when a provider is busy.",
        "Show clear messages for exhausted credits, invalid keys and temporary provider outages.",
      ],
    },
    {
      title: "Inbox and channels",
      items: [
        "Receive Facebook Page, YouTube, LinkedIn and TikTok comments in the Inbox and reply from it.",
        "Receive and answer TikTok Business direct messages, with an optional AI chatbot and human handoff.",
        "Connect YouTube with Google once; the connection renews itself automatically.",
        "Use a responsive inbox layout with conversation row actions on every screen size.",
      ],
    },
    {
      title: "Notifications and workspace",
      items: [
        "See notifications from every module in the header, grouped by category with working deep links.",
        "Show member names in ownership transfer and load long activity timelines page by page.",
        "Group TikTok settings in their own section and open one settings group at a time.",
      ],
    },
    {
      title: "Upgrade notes",
      items: [
        "Apply pending migrations through 20261026003000_byok_reuse_orphan_vault_secret.sql to the linked Supabase project.",
        "Set TIKTOK_BUSINESS_APP_ID/SECRET and YOUTUBE_CLIENT_ID/SECRET to enable the new TikTok and YouTube connections.",
        "Store the cron Vault secrets wacrm_cron_base_url and wacrm_cron_token so scheduled jobs reach the app.",
        "Read docs/releases/v6.8.9.md for detailed changes and outstanding live verification.",
      ],
    },
  ],
};

export function releaseNotesToPdfBlocks(notes: ReleaseNotes, brandName: string): PdfBlock[] {
  const blocks: PdfBlock[] = [
    { type: "title", text: `${brandName} v${notes.version}` },
    { type: "subtitle", text: `Release notes \u00b7 ${APP_RELEASE_CHANNEL} \u00b7 ${notes.date}` },
    { type: "rule" },
    { type: "text", text: notes.headline },
  ];
  for (const section of notes.sections) {
    blocks.push({ type: "heading", text: section.title });
    for (const item of section.items) blocks.push({ type: "bullet", text: item });
  }
  blocks.push({ type: "space", size: 14 });
  blocks.push({ type: "rule" });
  blocks.push({
    type: "subtitle",
    text: `Full history: /docs/changelog.html \u00b7 (c) 2026 ${brandName}`,
  });
  return blocks;
}
