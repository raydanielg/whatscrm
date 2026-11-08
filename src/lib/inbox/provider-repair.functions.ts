/**
 * Workspace-scoped repair of unsupported `channel_accounts.provider` values.
 *
 * Writes go through the caller's RLS-scoped client and are additionally gated
 * on workspace owner/admin membership, so a tenant can only ever repair its
 * own accounts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertWritableProvider,
  providerErrorResponse,
} from "@/lib/inbox/provider-validation";

export const repairWorkspaceProvider = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        fromProvider: z.string().min(1).max(120),
        action: z.enum(["remap", "disable"]),
        // Validated in the handler so an unknown target returns a clear 4xx.
        toProvider: z.string().max(120).optional(),
        accountIds: z.array(z.string().uuid()).min(1).max(200).optional(),
      })
      .parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.action === "remap" && !data.toProvider) {
      throw providerErrorResponse({
        ok: false,
        status: 400,
        code: "provider_required",
        message: "A target provider is required to remap accounts.",
      });
    }
    const toProvider =
      data.action === "remap" ? assertWritableProvider(data.toProvider, "toProvider") : undefined;

    const { data: member } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    const role = (member as { role?: string } | null)?.role;
    if (role !== "owner" && role !== "admin") {
      throw new Error("Forbidden — workspace admin required");
    }


    const patch =
      data.action === "remap"
        ? { provider: toProvider, updated_at: new Date().toISOString() }
        : {
            status: "disconnected",
            status_reason: `Disabled — unsupported channel type "${data.fromProvider}".`,
            updated_at: new Date().toISOString(),
          };

    let q = supabase
      .from("channel_accounts" as never)
      .update(patch as never)
      .eq("workspace_id", data.workspaceId)
      .eq("provider", data.fromProvider as never);
    if (data.accountIds && data.accountIds.length > 0) q = q.in("id", data.accountIds);

    const { data: updated, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { affected: (updated ?? []).length, action: data.action };
  });
