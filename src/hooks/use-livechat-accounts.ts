/**
 * Live Chat "accounts" for the omnichannel inbox.
 *
 * Live Chat has no `channel_accounts` row: a website widget is a *chatbot*
 * deployment, so the account a conversation belongs to is the chatbot that
 * served the widget. This hook projects widget-enabled chatbots into the same
 * shape the inbox selector already understands (`ChannelAccountRow`), using a
 * `livechat:<chatbotId>` synthetic id so it can never collide with a real
 * `channel_accounts.id`.
 *
 * Conversation filtering for these ids is handled in `use-conversations`
 * (`metadata->>chatbot_id`), because they are not stored on
 * `conversations.channel_account_id`.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ChannelAccountRow } from "@/hooks/use-channel-accounts";

/** Prefix marking a synthetic Live Chat account id. */
export const LIVECHAT_ACCOUNT_PREFIX = "livechat:";

export function isLiveChatAccountId(id?: string | null): boolean {
  return typeof id === "string" && id.startsWith(LIVECHAT_ACCOUNT_PREFIX);
}

/** `livechat:<uuid>` → `<uuid>` (null when the id is not a live chat account). */
export function liveChatBotId(id?: string | null): string | null {
  return isLiveChatAccountId(id) ? id!.slice(LIVECHAT_ACCOUNT_PREFIX.length) : null;
}

export function liveChatAccountId(botId: string): string {
  return `${LIVECHAT_ACCOUNT_PREFIX}${botId}`;
}

type BotRow = {
  id: string;
  name: string | null;
  status: string | null;
  disabled_at: string | null;
  widget_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  workspace_id: string;
};

/** Widget-enabled chatbots, shaped as inbox accounts. */
export function useLiveChatAccounts(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["livechat-accounts", workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async (): Promise<ChannelAccountRow[]> => {
      const { data, error } = await supabase
        .from("chatbots")
        .select(
          "id, name, status, disabled_at, widget_config, created_at, updated_at, workspace_id",
        )
        .eq("workspace_id", workspaceId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;

      return (((data ?? []) as unknown) as BotRow[]).map((b) => {
        // A bot only serves the widget while it is explicitly active: draft,
        // paused and archived bots must read as disabled, otherwise the
        // Live Chat Bots toggle (which writes `status`) appears to do nothing.
        const status = b.status ?? "active";
        const connected = !b.disabled_at && status === "active";
        return {
          id: liveChatAccountId(b.id),
          workspace_id: b.workspace_id,
          inbox_id: null,
          provider: "live_chat",
          display_name: b.name?.trim() || "Website widget",
          phone_number: null,
          phone_number_id: null,
          waba_id: null,
          business_id: null,
          access_token_secret_name: null,
          app_secret_name: null,
          verify_token: null,
          status: connected ? "connected" : "disconnected",
          status_reason: b.disabled_at
            ? "Chatbot disabled"
            : status === "active"
              ? null
              : status === "paused"
                ? "Paused"
                : status === "draft"
                  ? "Draft — not published"
                  : "Archived",
          metadata: { chatbot_id: b.id, widget_config: b.widget_config ?? {} },
          is_default: false,
          last_verified_at: null,
          created_at: b.created_at,
          updated_at: b.updated_at,
        } satisfies ChannelAccountRow;
      });
    },
  });
}
