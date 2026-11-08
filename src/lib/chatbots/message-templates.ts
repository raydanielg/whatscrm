/**
 * Reusable message templates and quick-pick presets for chatbot responses.
 *
 * Used across Instagram, Messenger, WhatsApp and Live Chat chatbot setup
 * dialogs so all channels share the same curated starter copy for the three
 * response classes that every bot must handle: greeting, fallback, and
 * human-handoff. Keep the copy channel-neutral — channel-specific tokens
 * (emoji, formatting) are added by the composer, not the presets.
 */

export type MessageTemplateKind = "greeting" | "fallback" | "handoff";

export interface MessageTemplate {
  /** Stable id for analytics / persistence. */
  id: string;
  /** Short label shown in the quick-pick menu. */
  label: string;
  /** Optional one-line hint describing the tone or use case. */
  hint?: string;
  /** The actual message body inserted into the field. */
  body: string;
}

const GREETINGS: MessageTemplate[] = [
  {
    id: "greeting.friendly",
    label: "Friendly",
    hint: "Warm, everyday tone",
    body: "Hi there! 👋 Thanks for reaching out. How can I help you today?",
  },
  {
    id: "greeting.professional",
    label: "Professional",
    hint: "Neutral B2B tone",
    body: "Hello, thanks for contacting us. Could you share a bit about what you're looking for so I can point you to the right place?",
  },
  {
    id: "greeting.support",
    label: "Support desk",
    hint: "Sets expectations",
    body: "Hi! You've reached our support team. Please describe your issue and I'll get you an answer or connect you with a specialist.",
  },
  {
    id: "greeting.sales",
    label: "Sales inquiry",
    hint: "Qualifies interest",
    body: "Thanks for your interest! To help you faster, could you tell me which product or plan you're curious about?",
  },
  {
    id: "greeting.afterhours",
    label: "After hours",
    hint: "Manages response-time expectations",
    body: "Thanks for messaging us! Our team is offline right now, but I can answer common questions and a human will follow up next business day.",
  },
  {
    id: "greeting.returning",
    label: "Returning customer",
    hint: "Personal welcome-back",
    body: "Welcome back! 🙌 How can I help you today — a new order, an existing one, or something else?",
  },
];

const FALLBACKS: MessageTemplate[] = [
  {
    id: "fallback.apologetic",
    label: "Apologetic",
    body: "Sorry, I didn't quite catch that. Could you rephrase, or would you like me to connect you with a teammate?",
  },
  {
    id: "fallback.clarify",
    label: "Ask to clarify",
    body: "I want to make sure I help you correctly — could you share a bit more detail about what you need?",
  },
  {
    id: "fallback.options",
    label: "Offer options",
    body: "I'm not sure I understood. You can try one of: 'pricing', 'support', 'sales', or type 'agent' to talk to a human.",
  },
  {
    id: "fallback.human",
    label: "Suggest a human",
    body: "I couldn't figure that one out. Want me to hand this over to a team member? Just reply 'yes' and I'll transfer you.",
  },
  {
    id: "fallback.tryagain",
    label: "Try again",
    body: "Hmm, I didn't get that. Could you try again in a different way, or ask a shorter question?",
  },
];

const HANDOFFS: MessageTemplate[] = [
  {
    id: "handoff.instant",
    label: "Instant transfer",
    body: "Connecting you with a team member now — please stay on this chat, they'll jump in shortly.",
  },
  {
    id: "handoff.queued",
    label: "Queued",
    body: "You're in the queue for a human agent. A teammate will be with you as soon as one is available.",
  },
  {
    id: "handoff.businesshours",
    label: "Business hours",
    body: "I'm handing this to our team. They're online Mon–Fri, 9am–6pm and will reply during those hours.",
  },
  {
    id: "handoff.priority",
    label: "Priority escalation",
    body: "This looks important — I'm escalating you to a senior agent right now. Please stand by.",
  },
  {
    id: "handoff.confirm",
    label: "Confirm before transfer",
    body: "I can connect you with a human agent. Reply 'yes' to be transferred, or keep chatting with me if you'd rather try again.",
  },
];

/** Quick-pick presets grouped by response type. */
export const MESSAGE_TEMPLATES: Record<MessageTemplateKind, MessageTemplate[]> = {
  greeting: GREETINGS,
  fallback: FALLBACKS,
  handoff: HANDOFFS,
};

/** Sensible defaults used when no template has been chosen yet. */
export const DEFAULT_TEMPLATES: Record<MessageTemplateKind, string> = {
  greeting: GREETINGS[0].body,
  fallback: FALLBACKS[0].body,
  handoff: HANDOFFS[0].body,
};

export function getTemplates(kind: MessageTemplateKind): MessageTemplate[] {
  return MESSAGE_TEMPLATES[kind];
}

export function findTemplate(id: string): MessageTemplate | undefined {
  for (const kind of Object.keys(MESSAGE_TEMPLATES) as MessageTemplateKind[]) {
    const t = MESSAGE_TEMPLATES[kind].find((x) => x.id === id);
    if (t) return t;
  }
  return undefined;
}
