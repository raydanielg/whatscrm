import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

/** Inbox-triggered syncs run at most this often per workspace. */
const MIN_INTERVAL_MS = 60_000;

export interface SocialInboxSyncSummary {
  ran: boolean;
  accounts: Array<{ platform: string; name: string; ok: boolean; inserted: number; error?: string }>;
}

/** Pull new comments for the caller's workspace now (throttled). */
export const syncSocialInboxNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ workspaceId: z.string().uuid(), force: z.boolean().optional() }).parse(v),
  )
  .handler(async ({ data, context }): Promise<SocialInboxSyncSummary> => {
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
    const admin = supabaseAdmin as never as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (!data.force) {
      const { data: recent } = await admin
        .from("social_inbox_sync_state")
        .select("last_synced_at")
        .eq("workspace_id", data.workspaceId)
        .gte("last_synced_at", new Date(Date.now() - MIN_INTERVAL_MS).toISOString())
        .limit(1);
      if ((recent ?? []).length > 0) return { ran: false, accounts: [] };
    }

    const { syncSocialInbox } = await import("./sync.server");
    const results = await syncSocialInbox(admin, { workspaceId: data.workspaceId });
    return {
      ran: true,
      accounts: results.map((r) => ({
        platform: r.platform,
        name: r.name,
        ok: r.ok,
        inserted: r.inserted ?? 0,
        ...(r.error ? { error: r.error } : {}),
      })),
    };
  });
