import { parseExternalAccountId } from "./external-account-ids";

export function conversationMatchesScope(
  conversation: { channel: string; channel_account_id?: string | null; metadata?: unknown },
  scope: { channels: string[]; accountId: string | null },
): boolean {
  if (scope.channels.length && !scope.channels.includes(conversation.channel)) return false;
  if (!scope.accountId) return true;
  const metadata = (conversation.metadata ?? {}) as Record<string, unknown>;
  const external = parseExternalAccountId(scope.accountId);
  if (external)
    return conversation.channel === external.channel && metadata.account_id === external.rowId;
  if (scope.accountId.startsWith("livechat:"))
    return metadata.chatbot_id === scope.accountId.slice("livechat:".length);
  return conversation.channel_account_id === scope.accountId;
}
