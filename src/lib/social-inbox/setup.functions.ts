import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { SOCIAL_INBOX_PLATFORMS, type SocialInboxPlatform } from "./normalize";

export interface SocialInboxAccountStatus {
  id: string;
  source: "messenger_accounts" | "social_channels" | "tiktok_business_accounts";
  name: string;
  handle: string | null;
  status: string;
  lastSyncedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastResult: SyncResultSummary;
}

export interface SyncResultSummary {
  fetched?: number;
  inserted?: number;
  skipped?: number;
  failed?: number;
}

export interface SocialInboxPlatformSetup {
  platform: SocialInboxPlatform;
  /** Server has the platform app credentials it needs (values never returned). */
  appConfigured: boolean;
  missingEnv: string[];
  accounts: SocialInboxAccountStatus[];
}

const REQUIRED_ENV: Record<SocialInboxPlatform, string[]> = {
  facebook: ["META_APP_ID", "META_APP_SECRET"],
  // Google OAuth app for auto-renewing connections (a pasted token still works without it).
  youtube: [],
  linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  // Comments use the TikTok API for Business app (same connection as TikTok Messages).
  tiktok: ["TIKTOK_BUSINESS_APP_ID", "TIKTOK_BUSINESS_APP_SECRET"],
};

function summarize(raw: unknown): SyncResultSummary {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" ? v : undefined);
  return { fetched: n(r.fetched), inserted: n(r.inserted), skipped: n(r.skipped), failed: n(r.failed) };
}

export const getSocialInboxSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<SocialInboxPlatformSetup[]> => {
    const db = sbAny(context.supabase);
    const { data: member } = await db
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .eq("status", "active")
      .maybeSingle();
    if (!member) throw new Error("You are not a member of this workspace.");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const admin = sbAny(supabaseAdmin);
    const [pages, channels, states, tiktok] = await Promise.all([
      admin
        .from("messenger_accounts")
        .select("id, page_name, page_id, status")
        .eq("workspace_id", data.workspaceId),
      admin
        .from("social_channels")
        .select("id, platform, name, username, external_id, status")
        .eq("workspace_id", data.workspaceId)
        .in("platform", ["facebook", "youtube", "linkedin"]),
      admin
        .from("social_inbox_sync_state")
        .select("account_source, account_id, last_synced_at, last_success_at, last_error, last_result")
        .eq("workspace_id", data.workspaceId),
      admin
        .from("tiktok_business_accounts")
        .select("id, business_id, username, display_name, status")
        .eq("workspace_id", data.workspaceId)
        .neq("status", "disconnected"),
    ]);

    const stateFor = (source: string, id: string) =>
      ((states.data ?? []) as Array<Record<string, unknown>>).find(
        (s) => s.account_source === source && s.account_id === id,
      );
    const withState = (
      base: Omit<SocialInboxAccountStatus, "lastSyncedAt" | "lastSuccessAt" | "lastError" | "lastResult">,
    ): SocialInboxAccountStatus => {
      const s = stateFor(base.source, base.id);
      return {
        ...base,
        lastSyncedAt: (s?.last_synced_at as string | null) ?? null,
        lastSuccessAt: (s?.last_success_at as string | null) ?? null,
        lastError: (s?.last_error as string | null) ?? null,
        lastResult: summarize(s?.last_result),
      };
    };

    const pageRows = (pages.data ?? []) as Array<{ id: string; page_name: string | null; page_id: string | null; status: string | null }>;
    const pageIds = new Set(pageRows.map((p) => p.page_id));
    const channelRows = (channels.data ?? []) as Array<{
      id: string;
      platform: SocialInboxPlatform;
      name: string | null;
      username: string | null;
      external_id: string | null;
      status: string | null;
    }>;

    return SOCIAL_INBOX_PLATFORMS.map((platform) => {
      const missingEnv = REQUIRED_ENV[platform].filter((k) => !process.env[k]?.trim());
      const accounts: SocialInboxAccountStatus[] = [];
      if (platform === "facebook") {
        for (const p of pageRows) {
          accounts.push(
            withState({
              id: p.id,
              source: "messenger_accounts",
              name: p.page_name?.trim() || "Facebook Page",
              handle: p.page_id,
              status: p.status ?? "unknown",
            }),
          );
        }
      }
      if (platform === "tiktok") {
        for (const t of (tiktok.data ?? []) as Array<Record<string, string | null>>) {
          accounts.push(
            withState({
              id: t.id!,
              source: "tiktok_business_accounts",
              name: t.display_name?.trim() || t.username || "TikTok account",
              handle: t.username ? `@${t.username}` : t.business_id,
              status: t.status === "active" ? "connected" : (t.status ?? "unknown"),
            }),
          );
        }
      }
      for (const c of channelRows.filter((r) => r.platform === platform)) {
        if (platform === "facebook" && pageIds.has(c.external_id)) continue;
        accounts.push(
          withState({
            id: c.id,
            source: "social_channels",
            name: c.name?.trim() || c.username || platform,
            handle: c.username ? `@${c.username.replace(/^@/, "")}` : c.external_id,
            status: c.status ?? "unknown",
          }),
        );
      }
      return { platform, appConfigured: missingEnv.length === 0, missingEnv, accounts };
    });
  });
