/**
 * Social channel CRUD.
 *
 * The `access_token` column is not readable or writable by the `authenticated`
 * database role, so any mutation carrying a token runs through the service
 * client — gated on an explicit workspace-admin check first. Mutations without
 * a token stay on the caller's RLS-bound client so ordinary members can still
 * rename or relabel their channels.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

const schema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  platform: z.enum(["facebook", "instagram", "linkedin", "x", "tiktok", "youtube", "threads"]),
  name: z.string().min(1).max(200),
  external_id: z.string().max(200).nullable().optional(),
  username: z.string().max(200).nullable().optional(),
  access_token: z.string().min(1).max(4000).optional(),
});

export const saveSocialChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => schema.parse(v))
  .handler(async ({ data, context }) => {
    const { id, workspaceId, access_token, ...rest } = data;
    const payload: Record<string, unknown> = {
      workspace_id: workspaceId,
      platform: rest.platform,
      name: rest.name.trim(),
      external_id: rest.external_id?.trim() || null,
      username: rest.username?.trim() || null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let client: any = context.supabase;
    if (access_token) {
      const { data: isAdmin } = await sbAny(context.supabase).rpc("is_workspace_admin" as never, {
        _workspace_id: workspaceId,
        _user_id: context.userId,
      } as never);
      if (!isAdmin)
        throw new Error("Only workspace owners and admins can set channel access tokens");
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      client = supabaseAdmin;
      payload.access_token = access_token;
    }

    if (id) {
      const { error } = await client
        .from("social_channels")
        .update(payload)
        .eq("id", id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: inserted, error } = await client
      .from("social_channels")
      .insert({ ...payload, status: "connected", created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (inserted as { id: string }).id };
  });
