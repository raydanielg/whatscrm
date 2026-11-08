/**
 * Email channel account management — list, connect, update, disconnect.
 *
 * An "email account" is the sender identity a workspace uses in the inbox:
 * the from address emails go out as, plus (optionally) the inbound routing
 * address replies arrive on. Conversations link to it through
 * `conversations.metadata.account_id`, exactly like Telegram/Messenger, so
 * the Inbox selector can filter by a real account instead of a placeholder.
 *
 * Resend accounts also carry an encrypted API key (outbound) and a webhook
 * secret (inbound Postmark/Mailgun posts); both stay out of client reads.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface EmailAccountSummary {
  id: string;
  provider: string;
  display_name: string;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  inbound_address: string | null;
  status: string;
  status_reason: string | null;
  connected_at: string;
  last_verified_at: string | null;
}

const SELECT =
  "id, provider, display_name, from_email, from_name, reply_to, inbound_address, status, status_reason, connected_at, last_verified_at";

const emailField = z.string().trim().toLowerCase().email().max(255);

export const listEmailAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("email_accounts" as never)
      .select(SELECT)
      .eq("workspace_id", data.workspaceId)
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { accounts: (rows ?? []) as unknown as EmailAccountSummary[] };
  });

export const connectEmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      workspaceId: string;
      displayName: string;
      fromEmail: string;
      fromName?: string | null;
      replyTo?: string | null;
      inboundAddress?: string | null;
      provider?: "smtp" | "resend";
      apiKey?: string | null;
    }) =>
      z
        .object({
          workspaceId: z.string().uuid(),
          displayName: z.string().trim().min(1).max(120),
          fromEmail: emailField,
          fromName: z.string().trim().max(120).nullish(),
          replyTo: emailField.nullish(),
          inboundAddress: emailField.nullish(),
          provider: z.enum(["smtp", "resend"]).default("resend"),
          apiKey: z.string().trim().max(400).nullish(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const isResend = data.provider === "resend";
    if (isResend && !data.apiKey) throw new Error("A Resend API key is required.");
    let apiKeyCipher: string | null = null;
    let webhookSecret: string | null = null;
    if (isResend) {
      const { encryptToken } = await import("@/lib/instagram/token-crypto.server");
      apiKeyCipher = encryptToken(data.apiKey!);
      webhookSecret = (await import("node:crypto")).randomBytes(24).toString("base64url");
    }

    // RLS (workspace admin/owner) authorizes the write — no admin client.
    const { data: saved, error } = await context.supabase
      .from("email_accounts" as never)
      .insert({
        workspace_id: data.workspaceId,
        provider: data.provider ?? "resend",
        display_name: data.displayName,
        from_email: data.fromEmail,
        from_name: data.fromName ?? null,
        reply_to: data.replyTo ?? null,
        inbound_address: data.inboundAddress ?? null,
        api_key_ciphertext: apiKeyCipher,
        webhook_secret: webhookSecret,
        // Only Resend has a send path and an inbound webhook. The key is saved
        // but not verified until the first send, so say so rather than imply it.
        // Other providers are not wired, so they stay Pending.
        status: isResend ? "connected" : "pending",
        status_reason: isResend
          ? "API key saved; it is first verified when an email is sent."
          : "Sender saved. Only the Resend provider can send and receive email in this version.",
        connected_by: context.userId,
        last_verified_at: null,
      } as never)
      .select(SELECT)
      .maybeSingle();

    if (error) {
      if (String(error.message).toLowerCase().includes("duplicate")) {
        throw new Error("That sender address is already connected in this workspace.");
      }
      throw new Error(error.message);
    }
    const account = saved as unknown as EmailAccountSummary;
    return { account, webhookUrlPath: isResend ? emailWebhookPath(account.id, webhookSecret!) : null };
  });

function emailWebhookPath(accountId: string, secret: string): string {
  return `/api/public/webhooks/email/${accountId}?token=${encodeURIComponent(secret)}`;
}

/** Inbound webhook path (with secret) for an account the caller can manage. */
export const getEmailWebhookInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // RLS decides whether the caller may see this account at all.
    const { data: visible } = await context.supabase
      .from("email_accounts" as never)
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (!visible) throw new Error("Email account not found.");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: row } = await supabaseAdmin
      .from("email_accounts" as never)
      .select("webhook_secret")
      .eq("id", data.id)
      .maybeSingle();
    const secret = (row as unknown as { webhook_secret: string | null } | null)?.webhook_secret;
    if (!secret) throw new Error("This account has no inbound webhook (Resend accounts only).");
    return { webhookUrlPath: emailWebhookPath(data.id, secret) };
  });

export const updateEmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      displayName?: string;
      fromName?: string | null;
      replyTo?: string | null;
      inboundAddress?: string | null;
      status?: "connected" | "disconnected";
    }) =>
      z
        .object({
          id: z.string().uuid(),
          displayName: z.string().trim().min(1).max(120).optional(),
          fromName: z.string().trim().max(120).nullish(),
          replyTo: emailField.nullish(),
          inboundAddress: emailField.nullish(),
          status: z.enum(["connected", "disconnected"]).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Only a Resend account with a stored API key can send and receive, so
    // only that kind may be switched to "connected". Disabling is always fine.
    if (data.status === "connected") {
      const { data: visible } = await context.supabase
        .from("email_accounts" as never)
        .select("id")
        .eq("id", data.id)
        .maybeSingle();
      if (!visible) throw new Error("Email account not found, or you cannot manage it.");
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const { data: row } = await supabaseAdmin
        .from("email_accounts" as never)
        .select("provider, api_key_ciphertext")
        .eq("id", data.id)
        .maybeSingle();
      const acc = row as unknown as { provider: string; api_key_ciphertext: string | null } | null;
      if (!acc || acc.provider !== "resend" || !acc.api_key_ciphertext) {
        throw new Error(
          "Only a Resend account with an API key can be connected. Reconnect this sender with Resend.",
        );
      }
    }
    const patch: Record<string, unknown> = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.fromName !== undefined) patch.from_name = data.fromName;
    if (data.replyTo !== undefined) patch.reply_to = data.replyTo;
    if (data.inboundAddress !== undefined) patch.inbound_address = data.inboundAddress;
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.status_reason = data.status === "disconnected" ? "Disabled by an administrator" : null;
    }

    const { data: saved, error } = await context.supabase
      .from("email_accounts" as never)
      .update(patch as never)
      .eq("id", data.id)
      .select(SELECT)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Email account not found, or you cannot manage it.");
    return { account: saved as unknown as EmailAccountSummary };
  });

export const deleteEmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_accounts" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
