/**
 * Notification Engine — dispatches events to agents via:
 *   - In-app toast + inbox badge
 *   - Browser push (service worker)
 *   - Email digest
 *   - Slack / Teams webhooks (via integrations)
 *   - Mobile push (future)
 *
 * Rules honor: user preferences, do-not-disturb windows, assignment scope,
 * mentions, SLA breaches.
 */

export type NotificationChannel = "in_app" | "push" | "email" | "slack" | "teams" | "mobile";

export type NotificationTrigger =
  | "message.inbound"
  | "conversation.assigned"
  | "conversation.mentioned"
  | "sla.breach"
  | "sla.warning"
  | "internal.note"
  | "handover.requested";

export interface NotificationRule {
  trigger: NotificationTrigger;
  channels: NotificationChannel[];
  onlyIfAssignedToMe?: boolean;
  quietHours?: { fromHour: number; toHour: number; tz: string };
}
