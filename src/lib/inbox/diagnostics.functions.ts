/**
 * Per-conversation link diagnostics.
 *
 * Answers "why doesn't this conversation behave like a properly linked
 * thread?" — missing widget session, missing `metadata.chatbot_id` /
 * `metadata.account_id`, a deleted/disabled account, a conversation that
 * belongs to another workspace, or an unlinked contact.
 *
 * Read-only. Runs as the caller (RLS), so it can never leak another
 * tenant's rows.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  conversationId: z.string().uuid(),
  /** Workspace the Inbox is currently showing. */
  workspaceId: z.string().uuid(),
});

export type DiagnosticStatus = "ok" | "warn" | "fail";

export type DiagnosticCheck = {
  id: string;
  label: string;
  status: DiagnosticStatus;
  /** What we found. */
  detail: string;
  /** What the user should do next (omitted when everything is fine). */
  action?: string;
};

export type ConversationDiagnostics = {
  conversationId: string;
  channel: string;
  linked: boolean;
  summary: string;
  checks: DiagnosticCheck[];
};

type ConversationRow = {
  id: string;
  workspace_id: string;
  channel: string;
  contact_id: string | null;
  channel_account_id: string | null;
  external_conversation_id: string | null;
  handoff_state: string | null;
  metadata: Record<string, unknown> | null;
};

const WEBCHAT_CHANNELS = new Set(["webchat"]);

export const diagnoseConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<ConversationDiagnostics> => {
    const db = context.supabase;
    const checks: DiagnosticCheck[] = [];

    const { data: row, error } = await db
      .from("conversations")
      .select(
        "id, workspace_id, channel, contact_id, channel_account_id, external_conversation_id, handoff_state, metadata",
      )
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!row) {
      return {
        conversationId: data.conversationId,
        channel: "unknown",
        linked: false,
        summary: "This conversation is not readable by your account.",
        checks: [
          {
            id: "visibility",
            label: "Conversation visibility",
            status: "fail",
            detail:
              "The conversation was not returned by the database. It either belongs to another workspace or was deleted.",
            action:
              "Switch to the workspace that owns the conversation, or ask an admin to confirm your membership.",
          },
        ],
      };
    }

    const c = (row as unknown) as ConversationRow;
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    const isWebchat = WEBCHAT_CHANNELS.has(c.channel);

    // 1. Workspace match
    if (c.workspace_id === data.workspaceId) {
      checks.push({
        id: "workspace",
        label: "Workspace",
        status: "ok",
        detail: "The conversation belongs to the workspace you are viewing.",
      });
    } else {
      checks.push({
        id: "workspace",
        label: "Workspace",
        status: "fail",
        detail: "The conversation belongs to a different workspace than the one selected in the Inbox.",
        action: "Switch workspace in the top bar to see this thread in its natural context.",
      });
    }

    // 2. Contact link
    if (c.contact_id) {
      const { data: contact } = await db
        .from("contacts")
        .select("id, name, source")
        .eq("id", c.contact_id)
        .maybeSingle();
      const ct = contact as { name?: string | null; source?: string | null } | null;
      checks.push({
        id: "contact",
        label: "Contact",
        status: ct ? "ok" : "fail",
        detail: ct
          ? `Linked to "${ct.name?.trim() || "Unnamed contact"}"${ct.source ? ` (source: ${ct.source})` : ""}.`
          : "The referenced contact row is missing or not visible to you.",
        action: ct ? undefined : "Use “Link contact” in the header to attach an existing contact.",
      });
    } else {
      checks.push({
        id: "contact",
        label: "Contact",
        status: "fail",
        detail: "No contact is attached to this conversation.",
        action: "Use “Link contact” in the conversation header to attach or create a contact.",
      });
    }

    if (isWebchat) {
      // 3a. Live Chat account mapping (metadata.chatbot_id → chatbots row)
      const chatbotId = typeof meta.chatbot_id === "string" ? meta.chatbot_id : null;
      if (!chatbotId) {
        checks.push({
          id: "account",
          label: "Live Chat account mapping",
          status: "fail",
          detail:
            "metadata.chatbot_id is missing, so the Inbox cannot map this thread to a Live Chat account and it disappears when you filter by channel/account.",
          action:
            "Open the Inbox once with this workspace active to run the automatic backfill, or re-send a message from the widget so the bridge re-stamps the metadata.",
        });
      } else {
        const { data: bot } = await db
          .from("chatbots")
          .select("id, name, disabled_at, deleted_at, workspace_id")
          .eq("id", chatbotId)
          .maybeSingle();
        const b = bot as
          | { name?: string | null; disabled_at?: string | null; deleted_at?: string | null }
          | null;
        if (!b) {
          checks.push({
            id: "account",
            label: "Live Chat account mapping",
            status: "fail",
            detail: `metadata.chatbot_id points to ${chatbotId}, but no readable chatbot has that id.`,
            action: "Re-create the widget chatbot, or re-link the conversation to an existing bot.",
          });
        } else if (b.deleted_at || b.disabled_at) {
          checks.push({
            id: "account",
            label: "Live Chat account mapping",
            status: "warn",
            detail: `Mapped to "${b.name ?? "Website widget"}", which is currently ${b.deleted_at ? "deleted" : "disabled"}.`,
            action: "Re-enable the bot under Communications → Live Chat Bots so it appears as a connected account.",
          });
        } else {
          checks.push({
            id: "account",
            label: "Live Chat account mapping",
            status: "ok",
            detail: `Mapped to "${b.name ?? "Website widget"}" (livechat:${chatbotId}).`,
          });
        }
      }

      // 4a. Widget session link
      const { data: sessions } = await db
        .from("chatbot_sessions")
        .select("id, status, handoff_reason, message_count")
        .eq("conversation_id", c.id)
        .limit(1);
      const sess = ((sessions ?? []) as unknown) as {
        id: string;
        status: string | null;
        message_count: number | null;
      }[];
      if (sess.length === 0) {
        checks.push({
          id: "session",
          label: "Widget session",
          status: "fail",
          detail:
            "No chatbot_sessions row points at this conversation, so new widget messages will not be mirrored into this thread.",
          action:
            "Reload the Inbox to trigger the automatic Live Chat backfill; if the visitor is still online, their next message re-links the session.",
        });
      } else {
        checks.push({
          id: "session",
          label: "Widget session",
          status: "ok",
          detail: `Linked to session ${sess[0].id.slice(0, 8)} (status: ${sess[0].status ?? "unknown"}, ${sess[0].message_count ?? 0} widget messages).`,
        });
      }
    } else {
      // 3b. External channel account mapping
      const accountId =
        c.channel_account_id ?? (typeof meta.account_id === "string" ? meta.account_id : null);
      if (!accountId) {
        checks.push({
          id: "account",
          label: "Channel account",
          status: "fail",
          detail:
            "Neither channel_account_id nor metadata.account_id is set, so this thread is hidden whenever you filter the Inbox by account.",
          action:
            "Connect (or re-connect) the account for this channel in Settings → API Config, then reply once so the thread is re-stamped.",
        });
      } else {
        const { data: acct } = await db
          .from("channel_accounts")
          .select("id, display_name, provider, status")
          .eq("id", accountId)
          .maybeSingle();
        const a = acct as
          | { display_name?: string | null; provider?: string | null; status?: string | null }
          | null;
        if (!a) {
          checks.push({
            id: "account",
            label: "Channel account",
            status: "warn",
            detail: `Account id ${accountId} is referenced but no channel_accounts row matches it (it may be an external account table row).`,
            action: "Verify the account still exists under Settings → API Config for this channel.",
          });
        } else {
          const bad = a.status && a.status !== "connected";
          checks.push({
            id: "account",
            label: "Channel account",
            status: bad ? "warn" : "ok",
            detail: `Mapped to "${a.display_name ?? a.provider ?? "account"}" (status: ${a.status ?? "unknown"}).`,
            action: bad ? "Re-authenticate the account so outbound replies can be delivered." : undefined,
          });
        }
      }

      // 4b. External thread id
      checks.push({
        id: "thread",
        label: "External thread id",
        status: c.external_conversation_id ? "ok" : "warn",
        detail: c.external_conversation_id
          ? `Deduplicated on external id ${c.external_conversation_id}.`
          : "No external_conversation_id, so future webhook events may create a duplicate conversation.",
        action: c.external_conversation_id
          ? undefined
          : "Send or receive one more message on this thread — the dedup helper stamps the external id on the next event.",
      });
    }

    // 5. Message mirroring
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", c.id);
    checks.push({
      id: "messages",
      label: "Messages",
      status: (count ?? 0) > 0 ? "ok" : "warn",
      detail:
        (count ?? 0) > 0
          ? `${count} message(s) mirrored into the unified Inbox.`
          : "No messages are mirrored into this conversation yet.",
      action:
        (count ?? 0) > 0
          ? undefined
          : "If the visitor already chatted, reload the Inbox to run the Live Chat backfill and replay the transcript.",
    });

    const failed = checks.filter((k) => k.status === "fail");
    const warned = checks.filter((k) => k.status === "warn");
    const summary = failed.length
      ? `${failed.length} blocking issue${failed.length > 1 ? "s" : ""} keep this conversation from being fully linked.`
      : warned.length
      ? `Linked, with ${warned.length} thing${warned.length > 1 ? "s" : ""} worth checking.`
      : "Fully linked — routing, account mapping and message mirroring all look correct.";

    return {
      conversationId: c.id,
      channel: c.channel,
      linked: failed.length === 0,
      summary,
      checks,
    };
  });
