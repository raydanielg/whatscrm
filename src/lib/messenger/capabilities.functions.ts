/**
 * Client-callable server functions for the Facebook Pages manager:
 * per-Page Messenger capability status, webhook subscription toggling, and
 * a settings-preserving reconnect.
 *
 * Reconnect / disconnect NEVER delete the `messenger_accounts` row, so every
 * Inbox artefact keyed to it (conversations, contacts, assignments, chatbot
 * routing, saved page metadata) survives the round trip.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

export interface PageCapabilityReport {
  accountId: string;
  pageId: string;
  tokenOk: boolean;
  tokenReason: string | null;
  subscribed: boolean;
  subscribedFields: string[];
  missingFields: string[];
  canMessage: boolean;
  subscriptionError: string | null;
  conversations: number;
  unread: number;
}

const WorkspaceInput = z.object({ workspaceId: z.string().uuid() });
const AccountInput = z.object({ accountId: z.string().uuid() });

async function loadAccount(
  supabase: { from: (t: string) => any },
  accountId: string,
): Promise<{ id: string; page_id: string; workspace_id: string; scopes: string[]; status: string }> {
  const { data, error } = await supabase
    .from("messenger_accounts")
    .select("id, page_id, workspace_id, scopes, status")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !data) throw new Error("Facebook Page not found in this workspace");
  return data as never;
}

async function cipherFor(accountId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await (sbAny(supabaseAdmin).from("messenger_accounts" as never) as any)
    .select("access_token_ciphertext")
    .eq("id", accountId)
    .maybeSingle();
  return (data?.access_token_ciphertext as string | undefined) ?? null;
}

/** Meta's Page webhook subscription is shared by every linked workspace and channel. */
async function pageSubscriptionConsumers(pageId: string, excludingMessengerId: string) {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const [messenger, instagram] = await Promise.all([
    sbAny(supabaseAdmin)
      .from("messenger_accounts")
      .select("id")
      .eq("page_id", pageId)
      .neq("id", excludingMessengerId)
      .neq("status", "disconnected")
      .limit(1),
    sbAny(supabaseAdmin)
      .from("instagram_accounts")
      .select("id")
      .eq("page_id", pageId)
      .neq("status", "disconnected")
      .limit(1),
  ]);
  if (messenger.error || instagram.error) {
    throw new Error("Could not check whether another channel uses this Page webhook subscription.");
  }
  return {
    messenger: (messenger.data ?? []).length > 0,
    instagram: (instagram.data ?? []).length > 0,
  };
}

/**
 * Capability matrix for every linked Page in the workspace: token health,
 * webhook subscription, granted messaging permission, and the Inbox volume
 * that would be preserved across a disconnect/reconnect.
 */
export const getMessengerCapabilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => WorkspaceInput.parse(input))
  .handler(async ({ data, context }): Promise<{ reports: PageCapabilityReport[] }> => {
    const { data: rows, error } = await context.supabase
      .from("messenger_accounts")
      .select("id, page_id, scopes, status")
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);

    const accounts = (rows ?? []) as Array<{
      id: string;
      page_id: string;
      scopes: string[] | null;
      status: string;
    }>;
    if (accounts.length === 0) return { reports: [] };

    const { readPageSubscription } = await import("./capabilities.server");
    const { verifyMessengerPageToken } = await import("./token.server");

    const reports: PageCapabilityReport[] = [];
    for (const acc of accounts) {
      const cipher = await cipherFor(acc.id);

      // Conversation volume that survives a reconnect (linked by page_id).
      const { count: convCount } = await context.supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId)
        .eq("channel", "messenger")
        .contains("metadata", { page_id: acc.page_id });
      const { count: unreadCount } = await context.supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId)
        .eq("channel", "messenger")
        .contains("metadata", { page_id: acc.page_id })
        .gt("unread_count", 0);

      const base = {
        accountId: acc.id,
        pageId: acc.page_id,
        canMessage: (acc.scopes ?? []).includes("pages_messaging"),
        conversations: convCount ?? 0,
        unread: unreadCount ?? 0,
      };

      if (!cipher) {
        reports.push({
          ...base,
          tokenOk: false,
          tokenReason: "No stored Page token — reconnect required.",
          subscribed: false,
          subscribedFields: [],
          missingFields: [],
          subscriptionError: null,
        });
        continue;
      }

      const token = await verifyMessengerPageToken(acc.page_id, cipher);
      if (!token.ok) {
        reports.push({
          ...base,
          tokenOk: false,
          tokenReason: token.reason,
          subscribed: false,
          subscribedFields: [],
          missingFields: [],
          subscriptionError: null,
        });
        continue;
      }

      const sub = await readPageSubscription(acc.page_id, cipher);
      reports.push({
        ...base,
        tokenOk: true,
        tokenReason: null,
        subscribed: sub.subscribed,
        subscribedFields: sub.subscribedFields,
        missingFields: sub.missingFields,
        subscriptionError: sub.error,
      });
    }

    return { reports };
  });

/** Subscribe or unsubscribe this app from a Page's Messenger webhooks. */
export const setMessengerPageSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => AccountInput.extend({ subscribe: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const acc = await loadAccount(context.supabase as never, data.accountId);
    const cipher = await cipherFor(acc.id);
    if (!cipher) throw new Error("No stored Page token — reconnect this Page first.");

    if (!data.subscribe) {
      const consumers = await pageSubscriptionConsumers(acc.page_id, acc.id);
      if (consumers.messenger || consumers.instagram) {
        throw new Error(
          "This Page is still used by another Messenger workspace or Instagram account. Disconnect this account locally without removing the shared Meta webhook subscription.",
        );
      }
    }

    const { setPageSubscription } = await import("./capabilities.server");
    const res = await setPageSubscription(acc.page_id, cipher, data.subscribe);
    if (!res.ok) throw new Error(res.error ?? "Meta rejected the subscription change");
    return { ok: true, subscribed: data.subscribe };
  });

/**
 * Reconnect a previously disconnected / errored Page.
 *
 * Re-uses the stored token when Meta still accepts it: the row is flipped back
 * to `connected` and its webhook subscription re-armed, so conversations,
 * contacts, assignments and chatbot routing stay exactly as they were.
 * Only when Meta rejects the token do we ask for a fresh OAuth pass.
 */
export const reconnectMessengerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => AccountInput.parse(input))
  .handler(async ({ data, context }) => {
    const acc = await loadAccount(context.supabase as never, data.accountId);
    const cipher = await cipherFor(acc.id);
    if (!cipher) {
      return { ok: false, needsOAuth: true, reason: "No stored Page token — re-authorize with Facebook." };
    }

    const { verifyMessengerPageToken, markMessengerAccountConnected, markMessengerAccountExpired } =
      await import("./token.server");
    const token = await verifyMessengerPageToken(acc.page_id, cipher);
    if (!token.ok) {
      await markMessengerAccountExpired(acc.id, token.reason ?? "Token invalid");
      return { ok: false, needsOAuth: true, reason: token.reason ?? "Meta rejected the stored Page token." };
    }

    const { setPageSubscription } = await import("./capabilities.server");
    const sub = await setPageSubscription(acc.page_id, cipher, true);
    await markMessengerAccountConnected(acc.id, {
      expiresAt: token.expiresAt,
      scopes: token.scopes,
    });

    return {
      ok: true,
      needsOAuth: false,
      resubscribed: sub.ok,
      reason: sub.ok ? null : sub.error,
    };
  });

/**
 * Disconnect a Page: pauses delivery by removing the app's webhook
 * subscription and marking the row disconnected. All Inbox data and settings
 * are retained so a later reconnect restores the exact same state.
 */
export const pauseMessengerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => AccountInput.parse(input))
  .handler(async ({ data, context }) => {
    const acc = await loadAccount(context.supabase as never, data.accountId);
    const cipher = await cipherFor(acc.id);

    // The app subscription is per Page, not per workspace. If another
    // workspace still has this Page connected, unsubscribing would silently
    // cut off its inbox too — the webhook already skips disconnected rows.
    const consumers = await pageSubscriptionConsumers(acc.page_id, acc.id);

    let unsubscribed = false;
    let warning: string | null = null;
    if (consumers.messenger || consumers.instagram) {
      warning =
        "Another Messenger workspace or Instagram account still uses this Page, so its Meta webhook subscription stays on. This workspace will stop receiving its Messenger messages.";
    } else if (cipher) {
      const { setPageSubscription } = await import("./capabilities.server");
      const res = await setPageSubscription(acc.page_id, cipher, false);
      unsubscribed = res.ok;
      warning = res.ok ? null : res.error;
    }

    const { error } = await context.supabase
      .from("messenger_accounts")
      .update({
        status: "disconnected",
        status_reason: "Disconnected by user — settings and conversations preserved",
      })
      .eq("id", acc.id);
    if (error) throw new Error(error.message);

    return { ok: true, unsubscribed, warning };
  });
