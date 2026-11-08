/**
 * Outbound email via Resend (server-only). Text bodies plus optional URL attachments; threading headers
 * let replies stay in the customer's existing conversation.
 */
import { decryptToken } from "@/lib/instagram/token-crypto.server";

export interface ResendSendInput {
  apiKeyCipher: string;
  fromEmail: string;
  fromName?: string | null;
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  /** Files Resend downloads from `path` (a public/signed URL) and attaches. */
  attachments?: Array<{ path: string; filename: string }>;
}

export function formatFrom(fromEmail: string, fromName?: string | null): string {
  const name = fromName?.replace(/["\r\n]/g, "").trim();
  return name ? `${name} <${fromEmail}>` : fromEmail;
}

export function replySubject(subject: string | null | undefined): string {
  const s = (subject ?? "").trim();
  if (!s) return "Re: your message";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

export async function sendResendEmail(input: ResendSendInput): Promise<{ messageId: string }> {
  const apiKey = decryptToken(input.apiKeyCipher);
  const headers: Record<string, string> = {};
  if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
  if (input.references) headers["References"] = input.references;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: formatFrom(input.fromEmail, input.fromName),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
  });
  const json = (await resp.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!resp.ok || !json.id) {
    throw new Error(json.message ?? `Resend send failed with HTTP ${resp.status}`);
  }
  return { messageId: json.id };
}
