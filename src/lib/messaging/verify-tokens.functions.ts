/**
 * Pending webhook verify tokens.
 *
 * Meta validates the callback URL (GET hub.challenge) BEFORE the WhatsApp
 * channel account exists in WACRM, so the token has to be known server-side
 * up front. The setup wizard registers it here; `handleVerify` falls back to
 * this table when no `channel_accounts` row matches yet.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RegisterSchema = z.object({
  workspaceId: z.string().uuid(),
  token: z.string().min(8).max(128),
  provider: z.string().min(1).max(64).optional(),
});

export const registerWebhookVerifyToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => RegisterSchema.parse(input))
  .handler(async ({ data, context }) => {
    const provider = data.provider ?? "whatsapp_cloud";
    const { error } = await context.supabase
      .from("webhook_verify_tokens" as never)
      .upsert(
        {
          workspace_id: data.workspaceId,
          provider,
          token: data.token,
          created_by: context.userId,
          expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        } as never,
        { onConflict: "token" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, provider };
  });
