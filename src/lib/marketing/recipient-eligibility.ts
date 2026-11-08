/**
 * Whether a contact can actually receive a WhatsApp campaign message.
 *
 * The enqueue path and the delivery path both have to answer this, and they
 * used to answer it differently: enqueue queued every contact regardless of
 * phone number, and delivery rejected the bad ones one at a time. The campaign
 * therefore reported a recipient total that included people it could never
 * reach, and the failures only appeared after the send had started.
 *
 * One rule here, applied in both places.
 */

export type RecipientIneligibility = "no_number" | "invalid_number" | "opted_out";

export const INELIGIBILITY_REASON: Record<RecipientIneligibility, string> = {
  no_number: "No phone or WhatsApp number on the contact",
  invalid_number: "Number is not a valid international WhatsApp number",
  opted_out: "Contact has opted out of marketing messages",
};

/**
 * Meta expects the number in international form with no `+` and no separators.
 * A leading zero is a national trunk prefix, which is never valid here.
 */
const WHATSAPP_NUMBER = /^[1-9]\d{6,14}$/;

/**
 * Reduce a stored number to what the provider accepts, or null if it cannot be.
 *
 * Strips `+`, spaces, dashes, dots and bracketed dialling hints, which is how
 * numbers are typically pasted into a CRM.
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw
    .trim()
    .replace(/[\s().-]/g, "")
    .replace(/^\+/, "");
  if (!digits) return null;
  return WHATSAPP_NUMBER.test(digits) ? digits : null;
}

/** True when this string is a number WhatsApp will accept. */
export function isSendableWhatsAppNumber(raw: string | null | undefined): boolean {
  return normalizeWhatsAppNumber(raw) !== null;
}

/** The subset of a contact this decision needs. */
export interface RecipientCandidate {
  id: string;
  phone?: string | null;
  whatsapp?: string | null;
}

export interface EligibleRecipient {
  id: string;
  /** Normalised, provider-ready number. */
  phone: string;
}

export interface IneligibleRecipient {
  id: string;
  reason: RecipientIneligibility;
  detail: string;
}

export interface RecipientPartition {
  eligible: EligibleRecipient[];
  ineligible: IneligibleRecipient[];
}

/**
 * Split an audience into who can be sent to and who cannot, with a reason.
 *
 * `optedOut` is supplied by the caller because consent lives in its own table;
 * passing it in keeps this function pure and testable.
 */
export function partitionRecipients(
  contacts: readonly RecipientCandidate[],
  optedOut: ReadonlySet<string> = new Set(),
): RecipientPartition {
  const eligible: EligibleRecipient[] = [];
  const ineligible: IneligibleRecipient[] = [];

  for (const contact of contacts) {
    if (optedOut.has(contact.id)) {
      ineligible.push({
        id: contact.id,
        reason: "opted_out",
        detail: INELIGIBILITY_REASON.opted_out,
      });
      continue;
    }

    // WhatsApp-specific number wins over the general phone field.
    const raw = contact.whatsapp || contact.phone || null;
    if (!raw || !String(raw).trim()) {
      ineligible.push({
        id: contact.id,
        reason: "no_number",
        detail: INELIGIBILITY_REASON.no_number,
      });
      continue;
    }

    const normalized = normalizeWhatsAppNumber(raw);
    if (!normalized) {
      ineligible.push({
        id: contact.id,
        reason: "invalid_number",
        detail: INELIGIBILITY_REASON.invalid_number,
      });
      continue;
    }

    eligible.push({ id: contact.id, phone: normalized });
  }

  return { eligible, ineligible };
}

/** One-line summary for the Review step. */
export function describeAudience(partition: RecipientPartition): string {
  const { eligible, ineligible } = partition;
  if (ineligible.length === 0) {
    return `${eligible.length} recipient${eligible.length === 1 ? "" : "s"} can be messaged.`;
  }
  return `${eligible.length} of ${eligible.length + ineligible.length} contacts can be messaged; ${ineligible.length} will be skipped.`;
}
