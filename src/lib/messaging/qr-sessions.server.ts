/**
 * Server-only helpers for the QR WhatsApp login worker.
 *
 * Kept out of *.functions.ts so those files stay thin server-function
 * wrappers (module scope there must only hold imports + declarations).
 */

export type WorkerResult = {
  ok: boolean;
  status: number;
  data: any;
  available: boolean;
};

export async function callWorker(
  path: string,
  init: RequestInit = {},
): Promise<WorkerResult> {
  const base = process.env.WA_QR_WORKER_URL;
  const token = process.env.WA_QR_WORKER_TOKEN;
  if (!base) {
    return { ok: false, status: 0, data: null, available: false };
  }
  try {
    const res = await fetch(new URL(path, base).toString(), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data, available: true };
  } catch {
    return { ok: false, status: 0, data: null, available: true };
  }
}
