/**
 * WACRM JS SDK — thin fetch wrapper over the public REST API.
 * Works in browsers, Node 18+, Deno, and edge runtimes.
 *
 * Usage:
 *   const wacrm = new WACRMClient({ apiKey: "wdf_live_..." });
 *   await wacrm.contacts.list({ limit: 20 });
 *   await wacrm.messages.send({ to: "+123", body: "hi" });
 */

export interface WACRMClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: { request_id?: string; total?: number; limit?: number; offset?: number };
  errors?: Array<{ status: string; code: string; title: string }>;
}

export class WACRMApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) {
    super(message);
    this.name = "WACRMApiError";
  }
}

export class WACRMClient {
  private baseUrl: string;
  private apiKey: string;
  private fetchImpl: typeof fetch;

  constructor(opts: WACRMClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "/api/public/v1").replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<ApiEnvelope<T>> {
    const qs = query
      ? "?" + new URLSearchParams(
          Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
        ).toString()
      : "";
    const res = await this.fetchImpl(`${this.baseUrl}${path}${qs}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.api+json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
    if (!res.ok) {
      const err = json.errors?.[0];
      throw new WACRMApiError(res.status, err?.code ?? "unknown", err?.title ?? res.statusText, json.meta?.request_id);
    }
    return json;
  }

  contacts = {
    list: (params?: { limit?: number; offset?: number; search?: string }) =>
      this.request<unknown[]>("GET", "/contacts", undefined, params),
    create: (payload: Record<string, unknown>) => this.request<unknown>("POST", "/contacts", payload),
  };

  conversations = {
    list: (params?: { limit?: number; offset?: number; status?: string }) =>
      this.request<unknown[]>("GET", "/conversations", undefined, params),
  };

  messages = {
    send: (payload: {
      conversation_id?: string;
      to?: string;
      channel?: "whatsapp" | "sms" | "email";
      type?: "text" | "template" | "image" | "document";
      body?: string;
      template_name?: string;
      template_variables?: Record<string, string>;
      media_url?: string;
    }) => this.request<{ id: string; status: string; queued_at: string }>("POST", "/messages", payload),
  };

  deals = {
    list: (params?: { limit?: number; offset?: number }) =>
      this.request<unknown[]>("GET", "/deals", undefined, params),
    create: (payload: Record<string, unknown>) => this.request<unknown>("POST", "/deals", payload),
  };
}
