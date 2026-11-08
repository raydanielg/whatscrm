/**
 * Assignment Engine — picks the agent for a conversation.
 *
 * Strategies:
 *   - manual        : leave unassigned; agents self-claim
 *   - round_robin   : rotate across online agents in team
 *   - load_balanced : agent with fewest open conversations wins
 *   - skill_based   : match labels/skills → agent skill matrix
 *   - sticky        : reuse last agent who spoke with this customer
 *
 * Also owns re-assignment, transfer, handover to bot/human.
 */

import type { ConversationPriority } from "./conversation-engine";

export type AssignmentStrategy =
  | "manual" | "round_robin" | "load_balanced" | "skill_based" | "sticky";

export interface AssignmentInput {
  workspaceId: string;
  conversationId: string;
  channel: import("../types").ChannelKind;
  priority: ConversationPriority;
  labels: string[];
  strategy: AssignmentStrategy;
  teamId?: string;
}
