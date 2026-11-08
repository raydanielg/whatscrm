/**
 * Client-safe builders for WhatsApp Cloud outbound payloads.
 *
 * These construct the provider-neutral `OutboundPayload` shape our engine
 * accepts. The queue worker translates it into Meta's wire format via
 * `whatsappCloudProvider.send()`.
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */

import type { OutboundPayload } from "./types";

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

export function buildText(
  to: string,
  body: string,
  opts?: { previewUrl?: boolean; contextMessageId?: string },
): OutboundPayload {
  return {
    to,
    type: "text",
    text: { body, preview_url: opts?.previewUrl ?? false },
    contextMessageId: opts?.contextMessageId,
  };
}

export type MediaKind = "image" | "video" | "audio" | "document" | "sticker";

/** Image / Video / Audio / Voice-note / Document / Sticker. */
export function buildMedia(
  to: string,
  kind: MediaKind,
  source: { url?: string; mediaId?: string; storagePath?: string },
  opts?: {
    caption?: string;
    filename?: string;
    mimeType?: string;
    contextMessageId?: string;
  },
): OutboundPayload {
  return {
    to,
    type: kind,
    media: {
      kind,
      url: source.url,
      mediaId: source.mediaId,
      storagePath: source.storagePath,
      filename: opts?.filename,
      caption: opts?.caption,
      mimeType: opts?.mimeType,
    },
    contextMessageId: opts?.contextMessageId,
  };
}

/** Convenience for voice notes (audio/ogg opus). Meta treats it as audio. */
export function buildVoiceNote(
  to: string,
  source: { url?: string; mediaId?: string; storagePath?: string },
  opts?: { contextMessageId?: string },
): OutboundPayload {
  return buildMedia(to, "audio", source, {
    mimeType: "audio/ogg",
    contextMessageId: opts?.contextMessageId,
  });
}

/** PDF / Doc / Xlsx etc. */
export function buildDocument(
  to: string,
  source: { url?: string; mediaId?: string; storagePath?: string },
  opts?: { filename: string; caption?: string; contextMessageId?: string },
): OutboundPayload {
  return buildMedia(to, "document", source, opts);
}

export function buildLocation(
  to: string,
  location: { latitude: number; longitude: number; name?: string; address?: string },
  opts?: { contextMessageId?: string },
): OutboundPayload {
  return { to, type: "location", location, contextMessageId: opts?.contextMessageId };
}

/** WhatsApp contacts card. */
export function buildContacts(
  to: string,
  contacts: Array<{
    name: { formatted_name: string; first_name?: string; last_name?: string };
    phones?: Array<{ phone: string; type?: string; wa_id?: string }>;
    emails?: Array<{ email: string; type?: string }>;
    org?: { company?: string; department?: string; title?: string };
    addresses?: Array<Record<string, string | undefined>>;
    urls?: Array<{ url: string; type?: string }>;
    birthday?: string;
  }>,
  opts?: { contextMessageId?: string },
): OutboundPayload {
  return { to, type: "contacts", contacts, contextMessageId: opts?.contextMessageId };
}

export function buildReaction(
  to: string,
  messageId: string,
  emoji: string,
): OutboundPayload {
  return { to, type: "reaction", reaction: { messageId, emoji } };
}

// ---------------------------------------------------------------------------
// interactive
// ---------------------------------------------------------------------------

export interface InteractiveHeader {
  type: "text" | "image" | "video" | "document";
  text?: string;
  image?: { link?: string; id?: string };
  video?: { link?: string; id?: string };
  document?: { link?: string; id?: string; filename?: string };
}

export interface ReplyButton {
  id: string;
  title: string; // max 20 chars per Meta spec
}

/** Interactive Reply Buttons (up to 3). */
export function buildReplyButtons(
  to: string,
  input: {
    body: string;
    buttons: ReplyButton[];
    header?: InteractiveHeader;
    footer?: string;
    contextMessageId?: string;
  },
): OutboundPayload {
  if (input.buttons.length < 1 || input.buttons.length > 3) {
    throw new Error("Reply buttons require 1–3 buttons");
  }
  return {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      ...(input.header ? { header: input.header } : {}),
      body: { text: input.body },
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: {
        buttons: input.buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
    contextMessageId: input.contextMessageId,
  };
}

/** Call-to-Action URL button (single button, opens a URL). */
export function buildCtaUrlButton(
  to: string,
  input: {
    body: string;
    display_text: string;
    url: string;
    header?: InteractiveHeader;
    footer?: string;
    contextMessageId?: string;
  },
): OutboundPayload {
  return {
    to,
    type: "interactive",
    interactive: {
      type: "cta_url",
      ...(input.header ? { header: input.header } : {}),
      body: { text: input.body },
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: {
        name: "cta_url",
        parameters: { display_text: input.display_text, url: input.url },
      },
    },
    contextMessageId: input.contextMessageId,
  };
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}
export interface ListSection {
  title: string;
  rows: ListRow[];
}

/** List Message (single-select). */
export function buildListMessage(
  to: string,
  input: {
    body: string;
    button: string;
    sections: ListSection[];
    header?: string;
    footer?: string;
    contextMessageId?: string;
  },
): OutboundPayload {
  return {
    to,
    type: "interactive",
    interactive: {
      type: "list",
      ...(input.header ? { header: { type: "text", text: input.header } } : {}),
      body: { text: input.body },
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: { button: input.button, sections: input.sections },
    },
    contextMessageId: input.contextMessageId,
  };
}

/** Location Request message. */
export function buildLocationRequest(
  to: string,
  body: string,
  opts?: { contextMessageId?: string },
): OutboundPayload {
  return {
    to,
    type: "interactive",
    interactive: {
      type: "location_request_message",
      body: { text: body },
      action: { name: "send_location" },
    },
    contextMessageId: opts?.contextMessageId,
  };
}

/** Single Product message (from a Meta Commerce catalog). */
export function buildSingleProduct(
  to: string,
  input: {
    catalog_id: string;
    product_retailer_id: string;
    body?: string;
    footer?: string;
    contextMessageId?: string;
  },
): OutboundPayload {
  return {
    to,
    type: "interactive",
    interactive: {
      type: "product",
      ...(input.body ? { body: { text: input.body } } : {}),
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: {
        catalog_id: input.catalog_id,
        product_retailer_id: input.product_retailer_id,
      },
    },
    contextMessageId: input.contextMessageId,
  };
}

export interface ProductSection {
  title: string;
  product_items: Array<{ product_retailer_id: string }>;
}

/** Multi-Product message (up to 30 items across up to 10 sections). */
export function buildMultiProduct(
  to: string,
  input: {
    catalog_id: string;
    header: string;
    body: string;
    sections: ProductSection[];
    footer?: string;
    contextMessageId?: string;
  },
): OutboundPayload {
  return {
    to,
    type: "interactive",
    interactive: {
      type: "product_list",
      header: { type: "text", text: input.header },
      body: { text: input.body },
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: { catalog_id: input.catalog_id, sections: input.sections },
    },
    contextMessageId: input.contextMessageId,
  };
}

/** Catalog message — opens the entire linked catalog. */
export function buildCatalogMessage(
  to: string,
  input: {
    body: string;
    footer?: string;
    thumbnail_product_retailer_id?: string;
    contextMessageId?: string;
  },
): OutboundPayload {
  return {
    to,
    type: "interactive",
    interactive: {
      type: "catalog_message",
      body: { text: input.body },
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: {
        name: "catalog_message",
        ...(input.thumbnail_product_retailer_id
          ? { parameters: { thumbnail_product_retailer_id: input.thumbnail_product_retailer_id } }
          : {}),
      },
    },
    contextMessageId: input.contextMessageId,
  };
}

/** Template message (required for outside 24h session window). */
export function buildTemplate(
  to: string,
  input: {
    name: string;
    language: string;
    components?: Array<Record<string, unknown>>;
  },
): OutboundPayload {
  return {
    to,
    type: "template",
    template: {
      name: input.name,
      language: input.language,
      components: input.components ?? [],
    },
  };
}
