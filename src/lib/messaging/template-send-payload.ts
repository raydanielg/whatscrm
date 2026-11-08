/**
 * Build a WhatsApp Cloud template send payload from the stored component
 * definition and the filled parameter values.
 *
 * The stored components (returned from Meta's template sync and used by the
 * preview dialog) still carry the raw template text with {{placeholders}}. This
 * module converts them into the Meta send-time format, which is an array of
 * components each containing a `parameters` array.
 *
 * Meta send format reference:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages#template-object
 */

export type TemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string }>;
};

export type WhatsAppSendParameter = {
  type: "text";
  text: string;
};

export type WhatsAppSendComponent = {
  type: "header" | "body" | "footer" | "button";
  parameters?: WhatsAppSendParameter[];
  sub_type?: "url";
  index?: number;
};

export type TemplateSendPayload = {
  /** WhatsApp template name as registered with Meta. */
  name: string;
  /** WhatsApp language code (e.g. en_US). */
  language: string;
  /** Components in Meta send-time format. */
  components: WhatsAppSendComponent[];
};

const TOKEN_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

function hasVariables(text: string): boolean {
  return TOKEN_RE.test(text);
}

function extractParameters(
  text: string,
  values: Record<string, string>,
): WhatsAppSendParameter[] {
  const parameters: WhatsAppSendParameter[] = [];
  TOKEN_RE.lastIndex = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const token = match[1];
    parameters.push({ type: "text", text: values[token] ?? "" });
  }
  return parameters;
}

/**
 * Convert stored template components + filled values into Meta's send payload.
 *
 * Only components that contain placeholders are emitted, because Meta rejects
 * empty `parameters` arrays. For URL buttons with a dynamic path, a `button`
 * component with `sub_type: "url"` is emitted so the dynamic suffix can be set
 * at send time.
 */
export function buildTemplateSendPayload(
  template: {
    name: string;
    language?: string | null;
    components?: TemplateComponent[] | null;
  },
  values: Record<string, string>,
): TemplateSendPayload {
  const components: WhatsAppSendComponent[] = [];

  for (const c of template.components ?? []) {
    const type = String(c.type ?? "").toLowerCase();

    if (type === "header" || type === "body" || type === "footer") {
      if (c.text && hasVariables(c.text)) {
        const parameters = extractParameters(c.text, values);
        if (parameters.length > 0) {
          components.push({ type, parameters });
        }
      }
      continue;
    }

    if (type === "buttons") {
      const buttons = c.buttons ?? [];
      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i];
        if (!b || typeof b !== "object") continue;
        const bType = String(b.type ?? "").toLowerCase();
        if (bType === "url" && b.url && hasVariables(b.url)) {
          const parameters = extractParameters(b.url, values);
          if (parameters.length > 0) {
            components.push({ type: "button", sub_type: "url", index: i, parameters });
          }
        }
      }
    }
  }

  return {
    name: template.name,
    language: template.language ?? "en_US",
    components,
  };
}

/** True when the component set represents a WhatsApp-native template. */
export function isWhatsAppTemplate(
  components?: TemplateComponent[] | null,
): components is TemplateComponent[] {
  return Array.isArray(components) && components.length > 0 &&
    components.some((c) => ["HEADER", "BODY", "FOOTER", "BUTTONS", "header", "body", "footer", "buttons"]
      .includes(String(c.type ?? "").toUpperCase()));
}
