export type WhatsAppDeliveryFailure = {
  summary: string;
  action?: string;
  retryable: boolean;
};

/** Convert WhatsApp Cloud delivery failures into concise, actionable UI copy. */
export function explainWhatsAppDeliveryFailure(
  reason: string | null | undefined,
): WhatsAppDeliveryFailure {
  const raw = reason?.trim() || "Message delivery failed";

  if (/(?:#|code\s*)?131030\b/i.test(raw) || /recipient phone number not in allowed list/i.test(raw)) {
    return {
      summary: "Recipient is not allowed by Meta's test number",
      action:
        "Add and verify this phone under Meta WhatsApp API Setup → To, or send from a registered production number.",
      retryable: false,
    };
  }

  if (/(?:#|code\s*)?131047\b/i.test(raw) || /re.engagement message|outside.*24.hour|24.hour.*window/i.test(raw)) {
    return {
      summary: "WhatsApp's 24-hour reply window has closed",
      action: "Send an approved message template, or wait for the customer to message again.",
      retryable: false,
    };
  }

  if (/delivery could not be confirmed/i.test(raw)) {
    return {
      summary: raw,
      action: "Check the channel conversation before sending a new message to avoid a duplicate.",
      retryable: false,
    };
  }

  return {
    summary: raw,
    retryable: true,
  };
}
