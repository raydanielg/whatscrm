/**
 * Provider-agnostic messaging types.
 *
 * Every messaging provider (WhatsApp Cloud, Twilio, 360dialog, custom) implements
 * `MessagingProvider`. All service code (queue worker, webhook handler, media
 * service, template service) speaks these types — never provider-specific ones.
 *
 * This is the seam that lets us add Twilio/360dialog later without touching
 * UI, hooks, or DB schema.
 */

export type ProviderName = "whatsapp_cloud" | "twilio" | "dialog360" | "custom";

export type MessageDirection = "inbound" | "outbound";

export type NormalizedMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "template"
  | "interactive"
  | "reaction"
  | "unknown";

/**
 * Provider-neutral outbound payload. Providers translate this into their
 * wire format inside `send()`.
 */
export interface OutboundPayload {
  to: string;
  type: NormalizedMessageType;
  text?: { body: string; preview_url?: boolean };
  media?: {
    kind: "image" | "video" | "audio" | "document" | "sticker";
    /** Either a public URL, provider media id, or storage_path (resolved later). */
    url?: string;
    mediaId?: string;
    storagePath?: string;
    filename?: string;
    caption?: string;
    mimeType?: string;
  };
  template?: {
    name: string;
    language: string;
    components?: Array<Record<string, unknown>>;
  };
  interactive?: Record<string, unknown>;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { messageId: string; emoji: string };
  /** WhatsApp contacts card (array of contact objects per Meta spec). */
  contacts?: Array<Record<string, unknown>>;
  contextMessageId?: string; // reply-to
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  externalMessageId: string;
  status: "sent" | "queued";
  raw?: unknown;
}

/**
 * Normalized inbound event, produced by a provider's webhook parser.
 * The webhook service persists it into `messages`/`conversations`.
 */
export interface NormalizedInboundMessage {
  kind: "message";
  externalMessageId: string;
  channelAccountId: string;
  from: string;
  to: string;
  contactName?: string;
  timestamp: string; // ISO
  /**
   * "outbound" marks a WhatsApp Coexistence echo: a message the business sent
   * from the linked phone's native WhatsApp app/Web, not through this app.
   * Meta delivers these via a separate `smb_message_echoes` webhook field,
   * `from`/`to` swapped versus a normal customer message. Absent (= inbound)
   * for every other provider and for ordinary customer messages.
   */
  direction?: "inbound" | "outbound";
  type: NormalizedMessageType;
  text?: string;
  media?: {
    kind: "image" | "video" | "audio" | "document" | "sticker";
    externalMediaId: string;
    mimeType?: string;
    filename?: string;
    caption?: string;
    sha256?: string;
  };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contextMessageId?: string;
  raw?: unknown;
}

export interface NormalizedStatusEvent {
  kind: "status";
  externalMessageId: string;
  channelAccountId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient?: string;
  errorCode?: string;
  errorMessage?: string;
  raw?: unknown;
}

export interface NormalizedTemplateStatusEvent {
  kind: "template_status";
  channelAccountId: string;
  externalTemplateId?: string;
  name: string;
  language?: string;
  status: string;
  category?: string;
  reason?: string;
  timestamp: string;
  raw?: unknown;
}

export interface NormalizedContactUpdateEvent {
  kind: "contact_update";
  channelAccountId: string;
  waId: string;
  displayName?: string;
  profilePictureUrl?: string;
  timestamp: string;
  raw?: unknown;
}

export interface NormalizedAccountUpdateEvent {
  kind: "account_update";
  channelAccountId: string;
  /** e.g. phone_number_name_update, business_capability_update, account_review_update */
  subtype: string;
  patch: Record<string, unknown>;
  timestamp: string;
  raw?: unknown;
}

export interface NormalizedUnknownEvent {
  kind: "unknown";
  channelAccountId?: string;
  eventType: string;
  raw: unknown;
}

export type NormalizedInboundEvent =
  | NormalizedInboundMessage
  | NormalizedStatusEvent
  | NormalizedTemplateStatusEvent
  | NormalizedContactUpdateEvent
  | NormalizedAccountUpdateEvent
  | NormalizedUnknownEvent;

export interface ProviderCredentials {
  accessToken: string;
  appSecret?: string;
  phoneNumberId?: string;
  wabaId?: string;
  businessId?: string;
  extra?: Record<string, string>;
}

export interface ChannelAccountRecord {
  id: string;
  workspaceId: string;
  provider: ProviderName;
  phoneNumberId: string | null;
  wabaId: string | null;
  verifyToken: string | null;
  webhookSignatureAlgo: string;
  accessTokenSecretName: string | null;
  appSecretName: string | null;
  externalAccountId: string | null;
  /**
   * Connection state from `channel_accounts.status`.
   *
   * Callers gate sending on this. It was absent from the record while
   * `deliverCampaignTemplate` already compared against it, so the comparison
   * read `undefined !== "connected"` and every campaign send was rejected as
   * "account is not connected". Present here so that check means what it says.
   */
  status: string | null;
  displayName: string | null;
  phoneNumber: string | null;
}

export interface WebhookVerifyInput {
  mode?: string | null;
  token?: string | null;
  challenge?: string | null;
}

export interface WebhookRequest {
  headers: Headers;
  rawBody: string;
  url: URL;
}

export interface MessagingProvider {
  readonly name: ProviderName;

  /** Send a normalized outbound message. Throws ProviderError on failure. */
  send(payload: OutboundPayload, ctx: ProviderCallContext): Promise<SendResult>;

  /** Optional: fetch a media asset by external id (returns bytes + mime). */
  fetchMedia?(
    externalMediaId: string,
    ctx: ProviderCallContext,
  ): Promise<{ bytes: Uint8Array; mimeType: string; filename?: string }>;

  /**
   * Verify a webhook subscription (GET challenge for Meta). Returns the
   * challenge string to echo back or null if invalid.
   */
  verifySubscription?(input: WebhookVerifyInput, account: ChannelAccountRecord): string | null;

  /** Validate a webhook POST signature against the raw body. */
  verifySignature?(req: WebhookRequest, credentials: ProviderCredentials): Promise<boolean>;

  /**
   * Route a webhook body to the channel account it targets. For Meta this
   * matches `phone_number_id`; for others, whatever identifier the provider
   * uses.
   */
  extractAccountRouting?(body: unknown): {
    externalAccountId?: string;
    phoneNumberId?: string;
  } | null;

  /** Parse a raw webhook body into normalized events. */
  parseWebhook(body: unknown, account: ChannelAccountRecord): NormalizedInboundEvent[];

  /** Sync approved templates from the provider (optional). */
  listTemplates?(ctx: ProviderCallContext): Promise<
    Array<{
      externalTemplateId: string;
      name: string;
      language: string;
      category: string;
      status: string;
      components: unknown[];
    }>
  >;

  /** Create a template with the provider. Returns the provider-assigned id + status. */
  createTemplate?(
    input: { name: string; language: string; category: string; components: unknown[] },
    ctx: ProviderCallContext,
  ): Promise<{ externalTemplateId: string; status: string }>;

  /**
   * Update an already-created template at the provider. Meta only accepts
   * category/components on edit — name and language are immutable.
   */
  updateTemplate?(
    input: { externalTemplateId: string; category: string; components: unknown[] },
    ctx: ProviderCallContext,
  ): Promise<{ externalTemplateId: string; status: string }>;

  /** Delete a template by name (optionally by external id) at the provider. */
  deleteTemplate?(
    input: { name: string; externalTemplateId?: string },
    ctx: ProviderCallContext,
  ): Promise<void>;
}

export interface ProviderCallContext {
  account: ChannelAccountRecord;
  credentials: ProviderCredentials;
  correlationId: string;
  /** Callback for structured logs. */
  log: (
    level: "debug" | "info" | "warn" | "error",
    scope: string,
    message: string,
    data?: Record<string, unknown>,
  ) => void;
}
