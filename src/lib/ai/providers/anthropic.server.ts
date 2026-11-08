/**
 * Anthropic Claude adapter. Uses the /v1/messages API, which differs from
 * OpenAI: system prompt is top-level and roles are only user/assistant.
 */

import type {
  AIProvider, ChatRequest, ChatResponse, ProviderCapabilities, ProviderCredentials, StreamChunk, TokenUsage,
} from "../types";
import { AIError, classifyHttpError } from "../errors";

const DEFAULT_BASE = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";

function buildHeaders(creds: ProviderCredentials) {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": API_VERSION,
    ...(creds.extraHeaders ?? {}),
  };
  if (creds.apiKey) h["x-api-key"] = creds.apiKey;
  return h;
}

function splitSystem(req: ChatRequest) {
  const sys: string[] = [];
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of req.messages) {
    if (m.role === "system") sys.push(m.content);
    else if (m.role === "user" || m.role === "assistant") msgs.push({ role: m.role, content: m.content });
  }
  return { system: sys.join("\n\n") || undefined, messages: msgs };
}

function usage(u: unknown): TokenUsage | undefined {
  if (!u || typeof u !== "object") return undefined;
  const r = u as { input_tokens?: number; output_tokens?: number };
  const p = r.input_tokens ?? 0, c = r.output_tokens ?? 0;
  return { prompt_tokens: p, completion_tokens: c, total_tokens: p + c };
}

export const anthropicProvider: AIProvider = {
  kind: "anthropic",
  capabilities(): ProviderCapabilities {
    return { chat: true, stream: true, tools: true, vision: true, embed: false, json_mode: false };
  },

  async chat(req, creds): Promise<ChatResponse> {
    const base = (creds.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
    const { system, messages } = splitSystem(req);
    const body: Record<string, unknown> = {
      model: req.model,
      messages,
      max_tokens: req.max_tokens ?? 4096,
    };
    if (system) body.system = system;
    if (req.temperature != null) body.temperature = req.temperature;
    if (req.stop?.length) body.stop_sequences = req.stop;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        name: t.name, description: t.description, input_schema: t.parameters,
      }));
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), req.timeout_ms ?? 60_000);
    let res: Response;
    try {
      res = await fetch(`${base}/messages`, {
        method: "POST", headers: buildHeaders(creds), body: JSON.stringify(body), signal: controller.signal,
      });
    } catch (e) {
      const err = e as Error;
      throw new AIError(err.name === "AbortError" ? "timeout" : "network", err.message, { providerKind: "anthropic" });
    } finally { clearTimeout(t); }

    const text = await res.text();
    if (!res.ok) {
      throw new AIError(classifyHttpError(res.status, text), text.slice(0, 500), {
        httpStatus: res.status, providerKind: "anthropic",
      });
    }
    const j = JSON.parse(text) as {
      id?: string; model: string; content: { type: string; text?: string; name?: string; input?: unknown; id?: string }[];
      stop_reason?: string; usage?: unknown;
    };
    const textBlocks = j.content.filter((b) => b.type === "text").map((b) => b.text || "").join("");
    const toolBlocks = j.content.filter((b) => b.type === "tool_use").map((b) => ({
      id: b.id || "", name: b.name || "", arguments: (b.input as Record<string, unknown>) || {},
    }));
    const finish = j.stop_reason === "tool_use" ? "tool_calls"
      : j.stop_reason === "max_tokens" ? "length" : "stop";
    return {
      id: j.id, model: j.model || req.model,
      content: textBlocks,
      tool_calls: toolBlocks.length ? toolBlocks : undefined,
      finish_reason: finish, usage: usage(j.usage), raw: j,
    };
  },

  async *stream(req, creds): AsyncIterable<StreamChunk> {
    const base = (creds.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
    const { system, messages } = splitSystem(req);
    const body = { model: req.model, messages, system, max_tokens: req.max_tokens ?? 4096, stream: true };
    const res = await fetch(`${base}/messages`, {
      method: "POST", headers: buildHeaders(creds), body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const t = await res.text();
      throw new AIError(classifyHttpError(res.status, t), t.slice(0, 500), { httpStatus: res.status, providerKind: "anthropic" });
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const p of parts) {
        const line = p.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          const j = JSON.parse(line.slice(5).trim()) as { type: string; delta?: { text?: string }; usage?: unknown };
          if (j.type === "content_block_delta" && j.delta?.text) yield { delta: j.delta.text };
          if (j.type === "message_delta" && j.usage) yield { delta: "", usage: usage(j.usage) };
        } catch { /* keep-alive */ }
      }
    }
  },

  async healthCheck(creds) {
    const start = Date.now();
    try {
      const res = await fetch(`${(creds.baseUrl || DEFAULT_BASE).replace(/\/+$/, "")}/messages`, {
        method: "POST", headers: buildHeaders(creds),
        body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
      });
      return { ok: res.ok || res.status === 400, latency_ms: Date.now() - start,
        error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (e) { return { ok: false, latency_ms: Date.now() - start, error: (e as Error).message }; }
  },
};
