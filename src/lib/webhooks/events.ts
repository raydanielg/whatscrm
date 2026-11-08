/** Client-safe: list of available webhook event types (used by the UI). */
export const WEBHOOK_EVENTS = [
  "contact.created", "contact.updated", "contact.deleted",
  "conversation.created", "conversation.assigned", "conversation.resolved",
  "message.sent", "message.received", "message.failed",
  "deal.created", "deal.updated", "deal.stage_changed", "deal.won", "deal.lost",
  "campaign.sent", "campaign.completed",
  "invoice.paid", "invoice.overdue",
  "workflow.completed", "workflow.failed",
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENTS[number];
