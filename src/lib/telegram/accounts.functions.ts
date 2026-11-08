/**
 * Telegram bot account management — connect, list, verify, disconnect.
 *
 * The workspace pastes a BotFather token; we call `getMe` to validate it,
 * register the webhook with a per-account secret, and persist the token
 * encrypted at rest.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface TelegramAccountSummary {
  id: string;
  bot_id: string;
  bot_username: string | null;
  bot_name: string | null;
  status: string;
  status_reason: string | null;
  connected_at: string;
  last_verified_at: string | null;
}

const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;

export const listTelegramAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("telegram_accounts" as never)
      .select(
        "id, bot_id, bot_username, bot_name, status, status_reason, connected_at, last_verified_at",
      )
      .eq("workspace_id", data.workspaceId)
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Audit mass secret view
    if (rows && rows.length > 0) {
      const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
      void recordServerAuditEvent({
        eventType: "secrets.list",
        severity: "warning",
        workspaceId: data.workspaceId,
        actorId: context.userId,
        resourceType: "telegram_account",
        data: { count: rows.length },
      });
    }

    return { accounts: (rows ?? []) as unknown as TelegramAccountSummary[] };
  });

/** Tells the UI whether a TELEGRAM_BOT_TOKEN secret is configured server-side. */
export const hasStoredTelegramToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const raw = (process.env["TELEGRAM_BOT_TOKEN"] ?? "").trim();
    return { available: TOKEN_RE.test(raw) };
  });

export const connectTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string; botToken?: string; origin: string }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        botToken: z.string().trim().min(20).max(200).optional(),
        origin: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const botToken = (data.botToken ?? process.env["TELEGRAM_BOT_TOKEN"] ?? "").trim();
    if (!botToken) {
      throw new Error(
        "No bot token provided and no TELEGRAM_BOT_TOKEN secret is configured for this project.",
      );
    }
    if (!TOKEN_RE.test(botToken)) {
      throw new Error("That does not look like a BotFather token (expected 123456:ABC-).");
    }

    const { callTelegramRaw } = await import("./send.server");
    const me = await callTelegramRaw<{ id: number; username?: string; first_name?: string }>(
      botToken,
      "getMe",
      {},
    );

    const { encryptToken } = await import("@/lib/instagram/token-crypto.server");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const { randomBytes } = await import("node:crypto");
    const webhookSecret = randomBytes(24).toString("base64url");
    const botId = String(me.id);

    // Multiple bots per workspace are supported; re-pasting a token for a bot
    // that is already linked refreshes it instead of creating a duplicate.
    const { data: existingRaw } = await supabaseAdmin
      .from("telegram_accounts" as never)
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("bot_id", botId)
      .maybeSingle();
    const alreadyConnected = !!existingRaw;

    const { data: saved, error } = await supabaseAdmin
      .from("telegram_accounts" as never)
      .upsert(
        {
          workspace_id: data.workspaceId,
          bot_id: botId,
          bot_username: me.username ?? null,
          bot_name: me.first_name ?? null,
          bot_token_ciphertext: encryptToken(botToken),
          webhook_secret: webhookSecret,
          status: "connected",
          status_reason: null,
          connected_by: context.userId,
          last_verified_at: new Date().toISOString(),
        } as never,
        { onConflict: "workspace_id,bot_id" },
      )
      .select("id, bot_id, bot_username, bot_name, status")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const account = saved as unknown as { id: string } | null;
    if (!account) throw new Error("Could not save the Telegram bot");

    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    void recordServerAuditEvent({
      eventType: "telegram_account.connect",
      severity: "info",
      workspaceId: data.workspaceId,
      actorId: context.userId,
      resourceType: "telegram_account",
      resourceId: account.id,
      data: { bot_id: botId, bot_username: me.username },
    });

    const webhookUrl = `${data.origin.replace(/\/$/, "")}/api/public/webhooks/telegram/${account.id}`;
    try {
      await callTelegramRaw(botToken, "setWebhook", {
        url: webhookUrl,
        secret_token: webhookSecret,
        // "message_reaction" must be listed explicitly — Telegram omits it
        // from the default update set (it's opt-in, for privacy), so without
        // this a customer tapping an emoji on a message never reaches us.
        allowed_updates: ["message", "edited_message", "channel_post", "message_reaction"],
        drop_pending_updates: false,
      });
    } catch (err) {
      await supabaseAdmin
        .from("telegram_accounts" as never)
        .update({
          status: "webhook_not_set",
          status_reason: (err as Error).message.slice(0, 500),
        } as never)
        .eq("id", account.id);
      throw new Error(`Bot verified, but webhook registration failed: ${(err as Error).message}`);
    }

    return {
      account: saved as unknown as TelegramAccountSummary,
      webhookUrl,
      alreadyConnected,
      botUsername: me.username ?? null,
    };
  });

export const verifyTelegramAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string; origin: string }) =>
    z.object({ accountId: z.string().uuid(), origin: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rowRaw, error } = await context.supabase
      .from("telegram_accounts" as never)
      .select("id, workspace_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rowRaw) throw new Error("Telegram bot not found");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: secretRaw } = await supabaseAdmin
      .from("telegram_accounts" as never)
      .select("bot_token_ciphertext")
      .eq("id", data.accountId)
      .maybeSingle();
    const cipher = (secretRaw as unknown as { bot_token_ciphertext: string } | null)
      ?.bot_token_ciphertext;
    if (!cipher) throw new Error("Stored bot token missing — reconnect the bot");

    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    void recordServerAuditEvent({
      eventType: "secrets.view",
      severity: "warning",
      workspaceId: (rowRaw as unknown as { workspace_id: string }).workspace_id,
      actorId: context.userId,
      resourceType: "telegram_account",
      resourceId: data.accountId,
    });

    const { callTelegram } = await import("./send.server");
    try {
      const info = await callTelegram<{
        url?: string;
        pending_update_count?: number;
        last_error_message?: string;
      }>(cipher, "getWebhookInfo", {});
      const expected = `${data.origin.replace(/\/$/, "")}/api/public/webhooks/telegram/${data.accountId}`;
      const ok = info.url === expected && !info.last_error_message;
      const nextStatus = ok ? "connected" : "webhook_not_set";
      await supabaseAdmin
        .from("telegram_accounts" as never)
        .update({
          status: nextStatus,
          status_reason: ok
            ? null
            : (info.last_error_message ?? `Webhook points at ${info.url || "nothing"}`).slice(
                0,
                500,
              ),
          last_verified_at: new Date().toISOString(),
        } as never)
        .eq("id", data.accountId);
      return {
        ok,
        status: nextStatus,
        webhookUrl: info.url ?? null,
        expectedUrl: expected,
        pendingUpdates: info.pending_update_count ?? 0,
        lastError: info.last_error_message ?? null,
      };
    } catch (err) {
      const msg = (err as Error).message;
      const authFailed = /401|403|unauthorized|forbidden|bot token/i.test(msg);
      await supabaseAdmin
        .from("telegram_accounts" as never)
        .update({
          status: authFailed ? "token_invalid" : "error",
          status_reason: msg.slice(0, 500),
          last_verified_at: new Date().toISOString(),
        } as never)
        .eq("id", data.accountId);
      throw new Error((err as Error).message);
    }
  });

export const deleteTelegramAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Best-effort webhook removal before dropping the row.
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: allowed } = await context.supabase
      .from("telegram_accounts" as never)
      .select("id, workspace_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (!allowed) throw new Error("Telegram bot not found");

    const { data: secretRaw } = await supabaseAdmin
      .from("telegram_accounts" as never)
      .select("bot_token_ciphertext")
      .eq("id", data.accountId)
      .maybeSingle();
    const cipher = (secretRaw as unknown as { bot_token_ciphertext: string } | null)
      ?.bot_token_ciphertext;
    if (cipher) {
      try {
        const { callTelegram } = await import("./send.server");
        await callTelegram(cipher, "deleteWebhook", { drop_pending_updates: false });
      } catch {
        /* ignore — the row is going away regardless */
      }
    }

    const { error } = await context.supabase
      .from("telegram_accounts" as never)
      .delete()
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);

    const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
    void recordServerAuditEvent({
      eventType: "telegram_account.delete",
      severity: "warning",
      workspaceId: (allowed as unknown as { workspace_id: string }).workspace_id,
      actorId: context.userId,
      resourceType: "telegram_account",
      resourceId: data.accountId,
    });

    return { ok: true };
  });
