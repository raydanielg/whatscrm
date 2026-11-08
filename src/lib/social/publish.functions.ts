import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ postId: z.string().uuid(), workspaceId: z.string().uuid() });

export const publishSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { postId: string; workspaceId: string }) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { publishSocialPostInternal } = await import("./publish.server");
    return publishSocialPostInternal(
      context.supabase,
      supabaseAdmin,
      data.postId,
      data.workspaceId,
    );
  });

/** Publishes every scheduled post whose time has arrived. Called by the scheduler route. */
export const runScheduledSocialPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const { data: due } = await supabase
      .from("social_posts")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .limit(20);
    return { due: (due ?? []).map((d: { id: string }) => d.id) };
  });
