/**
 * Conversation Engine — owns lifecycle of a conversation:
 *   open → assigned → replied → resolved → reopened → archived
 *
 * Conversations are channel-agnostic. A single `customer_id` may have many
 * conversations across many channels; the Inbox Core links them into one
 * unified timeline via the Identity Engine.
 */

export type ConversationStatus =
  | "open"
  | "pending"
  | "assigned"
  | "snoozed"
  | "resolved"
  | "archived"
  | "spam";

export type ConversationPriority = "low" | "medium" | "high" | "urgent";

export interface Conversation {
  id: string;
  workspaceId: string;
  customerId: string;
  primaryChannel: import("../types").ChannelKind;
  channelAccountId: string;
  externalThreadId?: string;
  subject?: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  assignedUserId?: string;
  assignedTeamId?: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount: number;
  labels: string[];
  slaDueAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Resolve which conversation a new inbound message belongs to.
 * Rule: (workspace, customer, primary_channel, channel_account) with an
 * open/pending/assigned/snoozed conversation → reuse; else create.
 * This is the seam that keeps ONE timeline per customer while still
 * respecting per-channel session windows (WA 24h, IG 7d, etc.).
 */
export interface ConversationResolveInput {
  workspaceId: string;
  customerId: string;
  channel: import("../types").ChannelKind;
  channelAccountId: string;
  externalThreadId?: string;
}
