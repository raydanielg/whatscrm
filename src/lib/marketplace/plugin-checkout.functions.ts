/**
 * Client-callable entry point for marketplace Buy-now.
 * Server-only Stripe/admin code is imported inside the handler so the
 * secret-bearing module never enters a client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const startPluginCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        pluginId: z.string().uuid(),
        origin: z.string().url(),
        workspaceId: z.string().uuid().optional(),
        seats: z.number().int().min(1).max(500).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let workspaceId = data.workspaceId;
    if (!workspaceId) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      workspaceId = (member as { workspace_id?: string } | null)?.workspace_id;
    }
    if (!workspaceId) throw new Error("No workspace found for your account");

    const { startPluginCheckoutServer } = await import("./plugin-checkout.server");
    return startPluginCheckoutServer(supabase, userId, {
      pluginId: data.pluginId,
      workspaceId,
      origin: data.origin.replace(/\/$/, ""),
      seats: data.seats,
    });
  });
