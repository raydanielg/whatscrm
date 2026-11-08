/**
 * Outbound SMS via Twilio (server-only). Text only; other providers are not
 * wired for sending yet.
 */
import { decryptToken } from "@/lib/instagram/token-crypto.server";

export interface TwilioSendInput {
  accountSid: string;
  authTokenCipher: string;
  from: string;
  to: string;
  body: string;
}

export async function sendTwilioSms(input: TwilioSendInput): Promise<{ messageId: string }> {
  const token = decryptToken(input.authTokenCipher);
  const auth = Buffer.from(`${input.accountSid}:${token}`).toString("base64");
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(input.accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: input.from, To: input.to, Body: input.body }),
    },
  );
  const json = (await resp.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!resp.ok || !json.sid) {
    throw new Error(json.message ?? `Twilio send failed with HTTP ${resp.status}`);
  }
  return { messageId: json.sid };
}
