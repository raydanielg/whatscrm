import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

const idInput = z.object({ id: z.string().uuid() });

/**
 * Platform staff (superadmin or support). Uses a list query rather than
 * `.maybeSingle()`, which errored for users holding both roles.
 */
async function assertAdmin(supabase: unknown, userId: string) {
  const { assertPlatformStaff } = await import("@/lib/admin/platform-guard.server");
  await assertPlatformStaff(supabase, userId);
}

/** Service-role client — only call AFTER `assertAdmin`. */
async function adminClient() {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  return sbAny(supabaseAdmin);
}

export const getDeveloperOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const db = await adminClient();

    const [keys, secrets, events] = await Promise.all([
      db
        .from("api_keys")
        .select(
          "id, name, prefix, organization_id, scopes, last_used_at, expires_at, revoked_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("webhook_signing_secrets")
        .select("id, workspace_id, secret_prefix, is_primary, activated_at, retired_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("webhook_events")
        .select(
          "id, provider, event_type, signature_valid, processed, attempts, last_error, received_at",
        )
        .order("received_at", { ascending: false })
        .limit(100),
    ]);

    const activeKeys = (keys.data ?? []).filter(
      (k: any) => !k.revoked_at && (!k.expires_at || new Date(k.expires_at) > new Date()),
    ).length;
    const failedWebhooks = (events.data ?? []).filter(
      (e: any) => !e.processed && e.attempts > 0,
    ).length;
    const invalidSignatures = (events.data ?? []).filter(
      (e: any) => e.signature_valid === false,
    ).length;

    return {
      stats: {
        totalKeys: keys.data?.length ?? 0,
        activeKeys,
        signingSecrets: secrets.data?.length ?? 0,
        recentEvents: events.data?.length ?? 0,
        failedWebhooks,
        invalidSignatures,
      },
      apiKeys: keys.data ?? [],
      signingSecrets: secrets.data ?? [],
      webhookEvents: events.data ?? [],
    };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => idInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    // api_keys RLS only lets org owners/admins write, so platform staff must
    // use the service role (after the check above) — and confirm a row changed.
    const sb = await adminClient();
    const { data: row, error } = await sb
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("API key not found");
    return { ok: true };
  });

export const retryWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => idInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    // webhook_events has no UPDATE policy: use the service role (after the
    // check above) and confirm a row was actually reset.
    const sb = await adminClient();
    const { data: row, error } = await sb
      .from("webhook_events")
      .update({
        processed: false,
        next_attempt_at: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        locked_by: null,
      })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Webhook event not found");
    return { ok: true };
  });
