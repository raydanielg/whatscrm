/**
 * WhatsApp Cloud API provider (Meta Graph API).
 *
 * Implements `MessagingProvider` for the official Meta WhatsApp Cloud API:
 *   - HMAC-SHA256 webhook signature verification (X-Hub-Signature-256)
 *   - GET challenge verification (hub.mode / hub.verify_token / hub.challenge)
 *   - Message send (text / media / template / interactive)
 *   - Media fetch (Graph /{media-id} -> signed URL -> download)
 *   - Webhook parser -> normalized inbound events (message + status)
 *   - Template list sync (WABA message_templates)
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import type {
  ChannelAccountRecord,
  MessagingProvider,
  NormalizedAccountUpdateEvent,
  NormalizedContactUpdateEvent,
  NormalizedInboundEvent,
  NormalizedInboundMessage,
  NormalizedMessageType,
  NormalizedStatusEvent,
  NormalizedTemplateStatusEvent,
  OutboundPayload,
  ProviderCallContext,
  ProviderCredentials,
  SendResult,
  WebhookRequest,
  WebhookVerifyInput,
} from "../types";
import { ProviderError, classifyHttpError } from "../errors";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function graphRequest<T>(
  path: string,
  init: RequestInit & { accessToken: string },
): Promise<T> {
  const { accessToken, headers, ...rest } = init;
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const b = body as {
      error?: { message?: string; code?: number; error_subcode?: number };
    } | null;
    const kind = classifyHttpError(res.status, body);
    const retryAfter = Number(res.headers.get("retry-after")) * 1000 || undefined;
    throw new ProviderError(kind, b?.error?.message ?? `WhatsApp Graph error (${res.status})`, {
      status: res.status,
      code: String(b?.error?.code ?? b?.error?.error_subcode ?? ""),
      retryAfterMs: retryAfter,
      raw: body,
    });
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// send payload builder
// ---------------------------------------------------------------------------

function buildSendBody(p: OutboundPayload): Record<string, unknown> {
  const base: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: p.to,
  };
  if (p.contextMessageId) {
    base.context = { message_id: p.contextMessageId };
  }

  switch (p.type) {
    case "text":
      return {
        ...base,
        type: "text",
        text: { body: p.text?.body ?? "", preview_url: p.text?.preview_url ?? false },
      };
    case "template":
      return {
        ...base,
        type: "template",
        template: {
          name: p.template?.name,
          language: { code: p.template?.language },
          components: p.template?.components ?? [],
        },
      };
    case "image":
    case "video":
    case "audio":
    case "document":
    case "sticker": {
      const kind = p.type;
      const media = p.media;
      const obj: Record<string, unknown> = {};
      if (media?.mediaId) obj.id = media.mediaId;
      else if (media?.url) obj.link = media.url;
      if (media?.caption && (kind === "image" || kind === "video" || kind === "document"))
        obj.caption = media.caption;
      if (media?.filename && kind === "document") obj.filename = media.filename;
      return { ...base, type: kind, [kind]: obj };
    }
    case "location":
      return { ...base, type: "location", location: p.location };
    case "contacts":
      return { ...base, type: "contacts", contacts: p.contacts ?? [] };
    case "reaction":
      return {
        ...base,
        type: "reaction",
        reaction: { message_id: p.reaction?.messageId, emoji: p.reaction?.emoji },
      };
    case "interactive":
      return { ...base, type: "interactive", interactive: p.interactive };
    default:
      throw new ProviderError("validation", `Unsupported outbound type: ${p.type}`);
  }
}

// ---------------------------------------------------------------------------
// webhook parsing
// ---------------------------------------------------------------------------

interface MetaWebhookEnvelope {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<Record<string, unknown>>;
        statuses?: Array<Record<string, unknown>>;
        errors?: Array<Record<string, unknown>>;
        [k: string]: unknown;
      };
    }>;
  }>;
}

function mapMessageType(t: unknown): NormalizedMessageType {
  const s = String(t ?? "").toLowerCase();
  const known: NormalizedMessageType[] = [
    "text",
    "image",
    "video",
    "audio",
    "document",
    "sticker",
    "location",
    "contacts",
    "template",
    "interactive",
    "reaction",
  ];
  return (known as string[]).includes(s) ? (s as NormalizedMessageType) : "unknown";
}

function parseInboundMessage(
  raw: Record<string, unknown>,
  contact: { profile?: { name?: string }; wa_id?: string } | undefined,
  toPhoneNumberId: string,
  account: ChannelAccountRecord,
): NormalizedInboundMessage {
  const type = mapMessageType(raw.type);
  const ts = raw.timestamp
    ? new Date(Number(raw.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  const msg: NormalizedInboundMessage = {
    kind: "message",
    externalMessageId: String(raw.id ?? ""),
    channelAccountId: account.id,
    from: String(raw.from ?? contact?.wa_id ?? ""),
    to: toPhoneNumberId,
    contactName: contact?.profile?.name,
    timestamp: ts,
    type,
    contextMessageId: (raw.context as { id?: string } | undefined)?.id,
    raw,
  };

  if (type === "text") {
    msg.text = (raw.text as { body?: string } | undefined)?.body ?? "";
  } else if (
    type === "image" ||
    type === "video" ||
    type === "audio" ||
    type === "document" ||
    type === "sticker"
  ) {
    const media = raw[type] as
      | { id?: string; mime_type?: string; filename?: string; caption?: string; sha256?: string }
      | undefined;
    if (media) {
      msg.media = {
        kind: type,
        externalMediaId: String(media.id ?? ""),
        mimeType: media.mime_type,
        filename: media.filename,
        caption: media.caption,
        sha256: media.sha256,
      };
      if (media.caption) msg.text = media.caption;
    }
  } else if (type === "location") {
    msg.location = raw.location as NormalizedInboundMessage["location"];
  } else if (type === "contacts") {
    const cs = raw.contacts as Array<{ name?: { formatted_name?: string } }> | undefined;
    msg.text =
      cs
        ?.map((c) => c?.name?.formatted_name)
        .filter(Boolean)
        .join(", ") || undefined;
  } else if (type === "interactive") {
    const ir = raw.interactive as
      | {
          button_reply?: { id?: string; title?: string };
          list_reply?: { id?: string; title?: string };
        }
      | undefined;
    msg.text = ir?.button_reply?.title ?? ir?.list_reply?.title;
  } else if (type === "reaction") {
    const r = raw.reaction as { emoji?: string; message_id?: string } | undefined;
    msg.text = r?.emoji;
    msg.contextMessageId = r?.message_id;
  }
  return msg;
}

function parseStatus(
  raw: Record<string, unknown>,
  account: ChannelAccountRecord,
): NormalizedStatusEvent {
  const status = String(raw.status ?? "").toLowerCase();
  const norm: NormalizedStatusEvent["status"] =
    status === "delivered"
      ? "delivered"
      : status === "read"
        ? "read"
        : status === "failed"
          ? "failed"
          : "sent";
  const errs = raw.errors as Array<{ code?: number; title?: string; message?: string }> | undefined;
  const err = errs?.[0];
  return {
    kind: "status",
    externalMessageId: String(raw.id ?? ""),
    channelAccountId: account.id,
    status: norm,
    timestamp: raw.timestamp
      ? new Date(Number(raw.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
    recipient: raw.recipient_id as string | undefined,
    errorCode: err?.code != null ? String(err.code) : undefined,
    errorMessage: err?.message ?? err?.title,
    raw,
  };
}

/**
 * Meta's template endpoint rejects the whole payload with a generic
 * "Invalid parameter" when a component carries empty or extraneous keys
 * (e.g. an empty HEADER text, a QUICK_REPLY carrying `url`, a URL button
 * without a url). Drop anything Meta would refuse before sending.
 */
function sanitizeTemplateComponents(components: unknown[]): unknown[] {
  const out: Record<string, unknown>[] = [];
  for (const raw of components ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const c = { ...(raw as Record<string, unknown>) };
    const type = String(c.type ?? "").toUpperCase();

    if (type === "HEADER") {
      const format = String(c.format ?? "TEXT").toUpperCase();
      if (format === "TEXT") {
        const text = typeof c.text === "string" ? c.text.trim() : "";
        if (!text) continue; // empty header => invalid parameter
        // Values are filled at send time; do not submit sample/example values to Meta.
        out.push({ type: "HEADER", format: "TEXT", text });
      } else if (format === "LOCATION") {
        // Location headers take no sample/handle; coordinates are per-send parameters.
        out.push({ type: "HEADER", format: "LOCATION" });
      } else {
        const handles = (c.example as { header_handle?: unknown } | undefined)?.header_handle;
        if (!Array.isArray(handles) || handles.length === 0) continue; // media header needs a handle
        out.push({ type: "HEADER", format, example: { header_handle: handles.map(String) } });
      }
      continue;
    }

    if (type === "BODY") {
      const text = typeof c.text === "string" ? c.text.trim() : "";
      if (!text) continue;
      // Values are filled at send time; do not submit sample/example values to Meta.
      out.push({ type: "BODY", text });
      continue;
    }

    if (type === "FOOTER") {
      const text = typeof c.text === "string" ? c.text.trim() : "";
      if (!text) continue;
      out.push({ type: "FOOTER", text });
      continue;
    }

    if (type === "BUTTONS") {
      const buttons: Record<string, unknown>[] = [];
      for (const b of Array.isArray(c.buttons) ? c.buttons : []) {
        if (!b || typeof b !== "object") continue;
        const btn = b as Record<string, unknown>;
        const btype = String(btn.type ?? "").toUpperCase();
        const text = typeof btn.text === "string" ? btn.text.trim() : "";
        if (!text) continue;
        if (btype === "URL") {
          const url = typeof btn.url === "string" ? btn.url.trim() : "";
          if (!url) continue;
          // Values are filled at send time; do not submit sample/example values to Meta.
          buttons.push({ type: "URL", text, url });
        } else if (btype === "PHONE_NUMBER") {
          const phone = typeof btn.phone_number === "string" ? btn.phone_number.trim() : "";
          if (!phone) continue;
          buttons.push({ type: "PHONE_NUMBER", text, phone_number: phone });
        } else if (btype === "FLOW") {
          // A Flow button opens a WhatsApp Form. Without a flow id Meta rejects
          // the template, so skip it the same way an empty URL is skipped.
          const flowId = typeof btn.flow_id === "string" ? btn.flow_id.trim() : "";
          if (!flowId) continue;
          buttons.push({
            type: "FLOW",
            text,
            flow_id: flowId,
            flow_action: "NAVIGATE",
            navigate_screen: "FORM",
          });
        } else {
          buttons.push({ type: "QUICK_REPLY", text });
        }
      }
      if (buttons.length === 0) continue;
      out.push({ type: "BUTTONS", buttons });
      continue;
    }

    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// provider
// ---------------------------------------------------------------------------

export const whatsappCloudProvider: MessagingProvider = {
  name: "whatsapp_cloud",

  async send(payload, ctx) {
    const phoneNumberId = ctx.account.phoneNumberId ?? ctx.credentials.phoneNumberId;
    if (!phoneNumberId)
      throw new ProviderError("validation", "phone_number_id missing on channel account");
    const body = buildSendBody(payload);
    ctx.log("info", "send", "sending message", {
      to: payload.to,
      type: payload.type,
      correlationId: ctx.correlationId,
    });
    const res = await graphRequest<{ messages?: Array<{ id?: string }> }>(
      `/${phoneNumberId}/messages`,
      { method: "POST", body: JSON.stringify(body), accessToken: ctx.credentials.accessToken },
    );
    const externalMessageId = res.messages?.[0]?.id ?? "";
    if (!externalMessageId)
      throw new ProviderError("unknown", "Graph API returned no message id", { raw: res });
    return { externalMessageId, status: "sent", raw: res } satisfies SendResult;
  },

  async fetchMedia(externalMediaId, ctx) {
    // Step 1: get signed URL from Graph
    const meta = await graphRequest<{ url: string; mime_type?: string; file_size?: number }>(
      `/${externalMediaId}`,
      { method: "GET", accessToken: ctx.credentials.accessToken },
    );
    // Step 2: download from CDN (still needs auth header per Meta docs)
    const res = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${ctx.credentials.accessToken}` },
    });
    if (!res.ok)
      throw new ProviderError(
        classifyHttpError(res.status),
        `Failed to download media (${res.status})`,
        { status: res.status },
      );
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      bytes: buf,
      mimeType: meta.mime_type ?? res.headers.get("content-type") ?? "application/octet-stream",
    };
  },

  verifySubscription(input: WebhookVerifyInput, account: ChannelAccountRecord) {
    if (input.mode !== "subscribe") return null;
    if (!account.verifyToken || input.token !== account.verifyToken) return null;
    return input.challenge ?? null;
  },

  async verifySignature(req: WebhookRequest, credentials: ProviderCredentials): Promise<boolean> {
    const header = req.headers.get("x-hub-signature-256") ?? "";
    if (!header.startsWith("sha256=")) return false;
    if (!credentials.appSecret) return false;
    const provided = header.slice("sha256=".length).trim().toLowerCase();
    const expected = (await hmacSha256Hex(credentials.appSecret, req.rawBody)).toLowerCase();
    return timingSafeEqualHex(provided, expected);
  },

  extractAccountRouting(body: unknown) {
    const env = body as MetaWebhookEnvelope;
    // Prefer phone_number_id (messages field); fall back to entry.id (WABA id)
    // for template / account / phone-number-name updates.
    for (const e of env?.entry ?? []) {
      for (const c of e?.changes ?? []) {
        const pnid = c?.value?.metadata?.phone_number_id;
        if (pnid) return { phoneNumberId: pnid };
      }
    }
    const wabaId = env?.entry?.[0]?.id;
    if (wabaId) return { externalAccountId: String(wabaId) };
    return null;
  },

  parseWebhook(body, account) {
    const env = body as MetaWebhookEnvelope;
    const out: NormalizedInboundEvent[] = [];
    for (const e of env?.entry ?? []) {
      for (const c of e?.changes ?? []) {
        const value = c?.value;
        const field = String(c?.field ?? "");
        if (!value) continue;
        const toPnId = value.metadata?.phone_number_id ?? account.phoneNumberId ?? "";

        // Messages field: inbound messages + delivery statuses + contact profile info
        if (field === "messages" || value.messages || value.statuses) {
          const contacts = value.contacts ?? [];
          for (const co of contacts) {
            if (co?.wa_id && co?.profile?.name) {
              out.push({
                kind: "contact_update",
                channelAccountId: account.id,
                waId: String(co.wa_id),
                displayName: co.profile.name,
                timestamp: new Date().toISOString(),
                raw: co,
              } satisfies NormalizedContactUpdateEvent);
            }
          }
          for (const m of value.messages ?? []) {
            out.push(parseInboundMessage(m, contacts[0], toPnId, account));
          }
          for (const s of value.statuses ?? []) {
            out.push(parseStatus(s, account));
          }
          continue;
        }

        // WhatsApp Business Platform Coexistence: a message the agent sent from
        // the linked phone's native WhatsApp app/Web, not through this app.
        // Meta echoes it back here (field "smb_message_echoes", items under
        // `message_echoes`) using the same message shape as `value.messages`,
        // but the echoed item is from the business number, not the customer.
        // Without this branch these fell through to `kind: "unknown"` and were
        // silently dropped — app-sent replies never reached the CRM thread.
        if (field === "smb_message_echoes" || value.message_echoes) {
          const contacts = value.contacts ?? [];
          for (const m of (value as { message_echoes?: Record<string, unknown>[] })
            .message_echoes ?? []) {
            const echo = parseInboundMessage(m, contacts[0], toPnId, account);
            echo.direction = "outbound";
            // Echo payloads carry the customer as `to`, the business as `from`.
            // Swap in case Meta sends it the other way around for some message
            // types — `to` always wins as the customer side of the thread.
            const customer = String(m.to ?? contacts[0]?.wa_id ?? echo.from);
            echo.from = toPnId;
            echo.to = customer;
            out.push(echo);
          }
          continue;
        }

        // Template lifecycle: message_template_status_update / _quality_update / _category_update
        if (field.startsWith("message_template_")) {
          const v = value as unknown as Record<string, unknown>;
          out.push({
            kind: "template_status",
            channelAccountId: account.id,
            externalTemplateId:
              v.message_template_id != null ? String(v.message_template_id) : undefined,
            name: String(v.message_template_name ?? ""),
            language:
              v.message_template_language != null ? String(v.message_template_language) : undefined,
            status: String(v.event ?? v.new_status ?? v.new_quality_score ?? ""),
            category: v.new_category != null ? String(v.new_category) : undefined,
            reason: v.reason != null ? String(v.reason) : undefined,
            timestamp: new Date().toISOString(),
            raw: value,
          } satisfies NormalizedTemplateStatusEvent);
          continue;
        }

        // Phone number / business profile / account review updates
        if (
          field === "phone_number_name_update" ||
          field === "phone_number_quality_update" ||
          field === "business_capability_update" ||
          field === "account_review_update" ||
          field === "account_update" ||
          field === "business_status_update"
        ) {
          out.push({
            kind: "account_update",
            channelAccountId: account.id,
            subtype: field,
            patch: value as unknown as Record<string, unknown>,
            timestamp: new Date().toISOString(),
            raw: value,
          } satisfies NormalizedAccountUpdateEvent);
          continue;
        }

        out.push({
          kind: "unknown",
          channelAccountId: account.id,
          eventType: field || "unknown",
          raw: value,
        });
      }
    }
    return out;
  },

  async listTemplates(ctx: ProviderCallContext) {
    const wabaId = ctx.account.wabaId;
    if (!wabaId) throw new ProviderError("validation", "WABA id missing on channel account");
    // Ask Meta for the rejection reason explicitly — it is not part of the
    // default field set, which is why rejected templates used to sync back
    // with an empty "what do I fix?" reason.
    const fields = "id,name,language,category,status,components,rejected_reason,quality_score";
    const res = await graphRequest<{
      data?: Array<{
        id?: string;
        name?: string;
        language?: string;
        category?: string;
        status?: string;
        components?: unknown[];
        rejected_reason?: string;
        quality_score?: { score?: string };
      }>;
    }>(`/${wabaId}/message_templates?limit=200&fields=${fields}`, {
      method: "GET",
      accessToken: ctx.credentials.accessToken,
    });
    return (res.data ?? []).map((t) => ({
      externalTemplateId: String(t.id ?? ""),
      name: String(t.name ?? ""),
      language: String(t.language ?? ""),
      category: String(t.category ?? ""),
      status: String(t.status ?? "").toLowerCase(),
      components: t.components ?? [],
      rejectedReason:
        t.rejected_reason && t.rejected_reason.toUpperCase() !== "NONE"
          ? String(t.rejected_reason)
          : null,
      qualityScore: t.quality_score?.score ? String(t.quality_score.score) : null,
    }));
  },

  async createTemplate(input, ctx) {
    const wabaId = ctx.account.wabaId;
    if (!wabaId) throw new ProviderError("validation", "WABA id missing on channel account");
    const body = {
      name: input.name,
      language: input.language,
      category: input.category.toUpperCase(),
      components: sanitizeTemplateComponents(input.components),
    };
    const res = await graphRequest<{ id?: string; status?: string; category?: string }>(
      `/${wabaId}/message_templates`,
      {
        method: "POST",
        accessToken: ctx.credentials.accessToken,
        body: JSON.stringify(body),
      },
    );
    return {
      externalTemplateId: String(res.id ?? ""),
      status: String(res.status ?? "PENDING").toLowerCase(),
    };
  },

  async updateTemplate(input, ctx) {
    // Meta rejects name/language on edit; only category + components are allowed.
    const body = {
      category: input.category.toUpperCase(),
      components: sanitizeTemplateComponents(input.components),
    };
    await graphRequest<{ success?: boolean }>(`/${input.externalTemplateId}`, {
      method: "POST",
      accessToken: ctx.credentials.accessToken,
      body: JSON.stringify(body),
    });
    return { externalTemplateId: input.externalTemplateId, status: "pending" };
  },

  async deleteTemplate(input, ctx) {
    const wabaId = ctx.account.wabaId;
    if (!wabaId) throw new ProviderError("validation", "WABA id missing on channel account");
    const params = new URLSearchParams({ name: input.name });
    if (input.externalTemplateId) params.set("hsm_id", input.externalTemplateId);
    await graphRequest<unknown>(`/${wabaId}/message_templates?${params.toString()}`, {
      method: "DELETE",
      accessToken: ctx.credentials.accessToken,
    });
  },
};
