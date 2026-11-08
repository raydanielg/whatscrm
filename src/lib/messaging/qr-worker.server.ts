/**
 * Baileys worker HTTP client (app → worker).
 *
 * Server-only. Signs every outbound request with an HMAC so the worker can
 * verify it came from this app instance.
 */
import { createHmac } from "node:crypto";

export type WorkerCallResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  available: boolean;
  error?: string;
};

function config() {
  return {
    base: process.env.WA_QR_WORKER_URL,
    token: process.env.WA_QR_WORKER_TOKEN,
    signingSecret: process.env.WA_QR_WORKER_SIGNING_SECRET,
  };
}

function sign(body: string, secret: string, timestamp: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

export async function callWorker<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<WorkerCallResult<T>> {
  const { base, token, signingSecret } = config();
  if (!base) return { ok: false, status: 0, data: null, available: false };

  const method = init.method ?? "GET";
  const bodyStr = init.body !== undefined ? JSON.stringify(init.body) : "";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-wacrm-timestamp": timestamp,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(signingSecret
      ? { "x-wacrm-signature": `sha256=${sign(bodyStr, signingSecret, timestamp)}` }
      : {}),
    ...(init.headers ?? {}),
  };

  try {
    const res = await fetch(new URL(path, base).toString(), {
      method,
      headers,
      body: bodyStr ? bodyStr : undefined,
    });
    const data = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, data, available: true };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      available: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Worker endpoints — the exact contract implemented on the worker side. */
export const WorkerAPI = {
  /** POST /sessions          → create session, returns { worker_session_id } */
  createSession: (sessionId: string, workspaceId: string) =>
    callWorker<{ worker_session_id: string }>("/sessions", {
      method: "POST",
      body: { session_id: sessionId, workspace_id: workspaceId },
    }),

  /** GET /sessions/:id/qr    → { qr, status, phone_number?, display_name?, device_platform? } */
  getQr: (sessionId: string) =>
    callWorker<{
      qr: string | null;
      status: string;
      phone_number?: string;
      display_name?: string;
      device_platform?: string;
      error?: string;
    }>(`/sessions/${sessionId}/qr`),

  /** DELETE /sessions/:id    → revokes the session on the worker */
  deleteSession: (sessionId: string) =>
    callWorker<{ ok: boolean }>(`/sessions/${sessionId}`, { method: "DELETE" }),

  /** POST /sessions/:id/send → { message_id, status } */
  sendMessage: (
    sessionId: string,
    payload: {
      to: string;
      type: "text" | "image" | "video" | "audio" | "document";
      text?: string;
      media_url?: string;
      caption?: string;
      /** Client-side idempotency key; worker must reject duplicates. */
      client_message_id: string;
    },
  ) =>
    callWorker<{ message_id: string; status: string }>(
      `/sessions/${sessionId}/send`,
      { method: "POST", body: payload },
    ),
};
