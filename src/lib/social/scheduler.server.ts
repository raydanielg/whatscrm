/**
 * Social post scheduler / auto-poster engine.
 *
 * Claims due scheduled posts and dispatches them through the provider layer.
 * Runs inside the public cron route and can also be invoked directly.
 */

import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { publishSocialPostInternal } from "./publish.server";

interface DuePost {
  id: string;
  workspace_id: string;
}

export interface ProcessResult {
  claimed: number;
  published: number;
  failed: number;
  skipped: number;
}

export async function processDueSocialPosts(batch = 50): Promise<ProcessResult> {
  const result: ProcessResult = { claimed: 0, published: 0, failed: 0, skipped: 0 };
  const nowIso = new Date().toISOString();

  // Fetch candidates. publishSocialPostInternal owns the atomic status claim
  // for both manual and scheduled sends, so the scheduler must not pre-claim.
  const { data: due, error } = await supabaseAdmin
    .from("social_posts" as never)
    .select("id, workspace_id")
    .eq("status", "scheduled")
    .in("approval_status", ["not_required", "approved"])
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(batch);

  if (error) throw new Error(`Failed to fetch scheduled posts: ${error.message}`);
  const rows = (due ?? []) as unknown as DuePost[];
  if (!rows.length) return result;

  for (const row of rows) {
    try {
      const res = await publishSocialPostInternal(
        supabaseAdmin,
        supabaseAdmin,
        row.id,
        row.workspace_id,
      );

      if (res.results.some((item) => item.error?.includes("already in progress"))) {
        result.skipped++;
        continue;
      }
      result.claimed++;

      if (res.ok) {
        result.published++;
      } else {
        result.failed++;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // If the shared publisher never claimed the row, it is safe to fail.
      // Once publishing began, provider delivery may be uncertain; preserve
      // that reservation for manual reconciliation instead of auto-retrying.
      const { data: unclaimed } = await supabaseAdmin
        .from("social_posts" as never)
        .update({ status: "failed", last_error: message } as never)
        .eq("id", row.id)
        .eq("status", "scheduled")
        .select("id");
      if (!unclaimed?.length) {
        await supabaseAdmin
          .from("social_posts" as never)
          .update({ last_error: message } as never)
          .eq("id", row.id)
          .eq("status", "publishing");
      }
      result.failed++;
    }
  }

  return result;
}
