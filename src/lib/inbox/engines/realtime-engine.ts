/**
 * Realtime Engine — one Supabase Realtime channel per workspace, fanned
 * out to per-conversation subscribers on the client.
 *
 * Channels:
 *   - workspace:{id}:inbox      → list-level events (new conv, unread++)
 *   - conversation:{id}         → message-level events (new msg, status, typing)
 *   - presence:{workspaceId}    → agent presence & typing
 *
 * The engine is transport-agnostic: swap Supabase Realtime for
 * Pusher/Ably by replacing this module only.
 */

export const RealtimeTopics = {
  inbox: (workspaceId: string) => `workspace:${workspaceId}:inbox`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  presence: (workspaceId: string) => `presence:${workspaceId}`,
} as const;

export type RealtimeEvent =
  | { kind: "message.new"; conversationId: string; messageId: string }
  | { kind: "message.status"; messageId: string; status: string }
  | { kind: "message.deleted"; messageId: string }
  | { kind: "message.edited"; messageId: string }
  | { kind: "message.reaction"; messageId: string; emoji: string; userId: string }
  | { kind: "conversation.updated"; conversationId: string }
  | { kind: "typing"; conversationId: string; who: "customer" | "agent"; userId?: string }
  | { kind: "presence"; userId: string; state: "online" | "away" | "offline" };
