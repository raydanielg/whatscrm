/**
 * Event Catalog — canonical, typed event names for every core domain.
 *
 * Plugins subscribe using these constants so string typos become type errors.
 * Every domain follows the shape `<domain>.<entity>.<verb>` and every mutation
 * emits a `before`/`after` pair the platform fires around core writes.
 *
 * Third parties may still emit ad-hoc string events — the bus accepts any
 * string — but core code and reviewed plugins should stick to this catalog.
 */

// ---------- Global / system ----------
export const GlobalEvents = {
  AppBoot: 'app.boot',
  AppReady: 'app.ready',
  AppShutdown: 'app.shutdown',
  UserSignedIn: 'app.user.signed_in',
  UserSignedOut: 'app.user.signed_out',
  ErrorCaptured: 'app.error.captured',
} as const;

// ---------- Organization / tenant ----------
export const OrganizationEvents = {
  Created: 'org.created',
  Updated: 'org.updated',
  Deleted: 'org.deleted',
  MemberInvited: 'org.member.invited',
  MemberJoined: 'org.member.joined',
  MemberRemoved: 'org.member.removed',
  RoleChanged: 'org.member.role_changed',
} as const;

// ---------- Workspace ----------
export const WorkspaceEvents = {
  Created: 'workspace.created',
  Updated: 'workspace.updated',
  Deleted: 'workspace.deleted',
  Switched: 'workspace.switched',
  SettingsChanged: 'workspace.settings.changed',
} as const;

// ---------- Conversation / Omnichannel ----------
export const ConversationEvents = {
  Created: 'conversation.created',
  Assigned: 'conversation.assigned',
  Unassigned: 'conversation.unassigned',
  Reopened: 'conversation.reopened',
  Closed: 'conversation.closed',
  Tagged: 'conversation.tagged',
  MessageReceived: 'conversation.message.received',
  MessageSent: 'conversation.message.sent',
  MessageFailed: 'conversation.message.failed',
  MessageRead: 'conversation.message.read',
  TypingStarted: 'conversation.typing.started',
  HandoffRequested: 'conversation.handoff.requested',
} as const;

// ---------- CRM ----------
export const CrmEvents = {
  ContactCreated: 'crm.contact.created',
  ContactUpdated: 'crm.contact.updated',
  ContactMerged: 'crm.contact.merged',
  ContactDeleted: 'crm.contact.deleted',
  LeadQualified: 'crm.lead.qualified',
  LeadDisqualified: 'crm.lead.disqualified',
  DealCreated: 'crm.deal.created',
  DealStageChanged: 'crm.deal.stage_changed',
  DealWon: 'crm.deal.won',
  DealLost: 'crm.deal.lost',
  NoteAdded: 'crm.note.added',
  TaskCreated: 'crm.task.created',
  TaskCompleted: 'crm.task.completed',
} as const;

// ---------- Workflow automation ----------
export const WorkflowEvents = {
  Published: 'workflow.published',
  RunStarted: 'workflow.run.started',
  RunFinished: 'workflow.run.finished',
  RunFailed: 'workflow.run.failed',
  StepStarted: 'workflow.step.started',
  StepFinished: 'workflow.step.finished',
  TriggerFired: 'workflow.trigger.fired',
} as const;

// ---------- Commerce ----------
export const CommerceEvents = {
  ProductCreated: 'commerce.product.created',
  ProductUpdated: 'commerce.product.updated',
  CatalogSynced: 'commerce.catalog.synced',
  CartUpdated: 'commerce.cart.updated',
  OrderCreated: 'commerce.order.created',
  OrderPaid: 'commerce.order.paid',
  OrderFulfilled: 'commerce.order.fulfilled',
  OrderCancelled: 'commerce.order.cancelled',
  RefundIssued: 'commerce.refund.issued',
} as const;

// ---------- Billing / SaaS ----------
export const BillingEvents = {
  SubscriptionCreated: 'billing.subscription.created',
  SubscriptionUpdated: 'billing.subscription.updated',
  SubscriptionCancelled: 'billing.subscription.cancelled',
  SubscriptionRenewed: 'billing.subscription.renewed',
  InvoiceIssued: 'billing.invoice.issued',
  InvoicePaid: 'billing.invoice.paid',
  InvoiceFailed: 'billing.invoice.failed',
  PaymentSucceeded: 'billing.payment.succeeded',
  PaymentFailed: 'billing.payment.failed',
  UsageRecorded: 'billing.usage.recorded',
  QuotaExceeded: 'billing.quota.exceeded',
} as const;

// ---------- AI ----------
export const AiEvents = {
  RequestStarted: 'ai.request.started',
  RequestFinished: 'ai.request.finished',
  RequestFailed: 'ai.request.failed',
  TokensConsumed: 'ai.tokens.consumed',
  ToolInvoked: 'ai.tool.invoked',
  EmbeddingCreated: 'ai.embedding.created',
  KbIndexed: 'ai.kb.indexed',
  ReplyDrafted: 'ai.reply.drafted',
} as const;

/** Every domain flattened for iteration (settings UI, docs, etc). */
export const EventCatalog = {
  Global: GlobalEvents,
  Organization: OrganizationEvents,
  Workspace: WorkspaceEvents,
  Conversation: ConversationEvents,
  Crm: CrmEvents,
  Workflow: WorkflowEvents,
  Commerce: CommerceEvents,
  Billing: BillingEvents,
  Ai: AiEvents,
} as const;

/** Union of every well-known event name. */
export type CatalogEvent =
  | (typeof GlobalEvents)[keyof typeof GlobalEvents]
  | (typeof OrganizationEvents)[keyof typeof OrganizationEvents]
  | (typeof WorkspaceEvents)[keyof typeof WorkspaceEvents]
  | (typeof ConversationEvents)[keyof typeof ConversationEvents]
  | (typeof CrmEvents)[keyof typeof CrmEvents]
  | (typeof WorkflowEvents)[keyof typeof WorkflowEvents]
  | (typeof CommerceEvents)[keyof typeof CommerceEvents]
  | (typeof BillingEvents)[keyof typeof BillingEvents]
  | (typeof AiEvents)[keyof typeof AiEvents];

/** Compose the `before:` / `after:` variant of an event name. */
export const beforeEvent = <E extends string>(e: E) => `before:${e}` as const;
export const afterEvent = <E extends string>(e: E) => `after:${e}` as const;
