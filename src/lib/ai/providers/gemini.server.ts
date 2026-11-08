/**
 * Google Gemini adapter. Uses generative-language v1beta generateContent.
 * (We could use Gemini's OpenAI-compat shim, but the native API supports
 * more features and stable streaming.)
 */

import type {
  AIProvider, ChatRequest, ChatResponse, ProviderCapabilities, ProviderCredentials, StreamChunk, TokenUsage,
} from "../types";
import { AIError, classifyHttpError } from "../errors";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Callers across the app still pass Lovable-gateway-style provider-prefixed
 * model ids (e.g. "google/gemini-2.5-flash") left over from before this app
 * had its own direct Gemini credentials. Google's API only accepts the bare
 * model id. Strip a leading "google/" (or "gemini/") segment here, in one
 * place, rather than touching every call site.
 */
function normalizeModelId(model: string): string {
  return model.replace(/^(google|gemini)\//, "");
}

function toGeminiContents(req: ChatRequest) {
  const system: string[] = [];
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of req.messages) {
    if (m.role === "system") system.push(m.content);
    else if (m.role === "user") contents.push({ role: "user", parts: [{ text: m.content }] });
    else if (m.role === "assistant") contents.push({ role: "model", parts: [{ text: m.content }] });
  }
  return { system: system.join("\n\n") || undefined, contents };
}

function usage(u: unknown): TokenUsage | undefined {
  if (!u || typeof u !== "object") return undefined;
  const r = u as { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  return {
    prompt_tokens: r.promptTokenCount ?? 0,
    completion_tokens: r.candidatesTokenCount ?? 0,
    total_tokens: r.totalTokenCount ?? 0,
  };
}

export const geminiProvider: AIProvider = {
  kind: "gemini",
  capabilities(): ProviderCapabilities {
    return { chat: true, stream: true, tools: true, vision: true, embed: true, json_mode: true };
  },

  async chat(req, creds): Promise<ChatResponse> {
    if (!creds.apiKey) throw new AIError("auth", "Gemini requires an API key", { providerKind: "gemini" });
    const base = (creds.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
    const { system, contents } = toGeminiContents(req);
    const body: Record<string, unknown> = {
      contents,
      ...(system && { systemInstruction: { parts: [{ text: system }] } }),
      generationConfig: {
        ...(req.temperature != null && { temperature: req.temperature }),
        ...(req.max_tokens != null && { maxOutputTokens: req.max_tokens }),
        ...(req.top_p != null && { topP: req.top_p }),
        ...(req.stop?.length && { stopSequences: req.stop }),
        ...(req.response_format === "json_object" && { responseMimeType: "application/json" }),
      },
    };
    if (req.tools?.length) {
      body.tools = [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
    }

    const url = `${base}/models/${encodeURIComponent(normalizeModelId(req.model))}:generateContent?key=${encodeURIComponent(creds.apiKey)}`;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), req.timeout_ms ?? 60_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(creds.extraHeaders ?? {}) },
        body: JSON.stringify(body), signal: controller.signal,
      });
    } catch (e) {
      const err = e as Error;
      throw new AIError(err.name === "AbortError" ? "timeout" : "network", err.message, { providerKind: "gemini" });
    } finally { clearTimeout(to); }

    const text = await res.text();
    if (!res.ok) {
      throw new AIError(classifyHttpError(res.status, text), text.slice(0, 500), {
        httpStatus: res.status, providerKind: "gemini",
      });
    }
    const j = JSON.parse(text) as {
      candidates?: { content: { parts: { text?: string; functionCall?: { name: string; args: Record<string, unknown> } }[] }; finishReason?: string }[];
      usageMetadata?: unknown;
    };
    const cand = j.candidates?.[0];
    const parts = cand?.content?.parts ?? [];
    const content = parts.map((p) => p.text || "").join("");
    const toolCalls = parts.filter((p) => p.functionCall).map((p, i) => ({
      id: `call_${i}`, name: p.functionCall!.name, arguments: p.functionCall!.args || {},
    }));
    const finish = cand?.finishReason === "MAX_TOKENS" ? "length"
      : cand?.finishReason === "SAFETY" ? "content_filter"
      : toolCalls.length ? "tool_calls" : "stop";
    return {
      model: req.model, content,
      tool_calls: toolCalls.length ? toolCalls : undefined,
      finish_reason: finish, usage: usage(j.usageMetadata), raw: j,
    };
  },

  async *stream(req, creds): AsyncIterable<StreamChunk> {
    if (!creds.apiKey) throw new AIError("auth", "Gemini requires an API key", { providerKind: "gemini" });
    const base = (creds.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
    const { system, contents } = toGeminiContents(req);
    const url = `${base}/models/${encodeURIComponent(normalizeModelId(req.model))}:streamGenerateContent?alt=sse&key=${encodeURIComponent(creds.apiKey)}`;
    const body = { contents, systemInstruction: system ? { parts: [{ text: system }] } : undefined };
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const t = await res.text();
      throw new AIError(classifyHttpError(res.status, t), t.slice(0, 500), { httpStatus: res.status, providerKind: "gemini" });
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        try {
          const j = JSON.parse(l.slice(5).trim()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: unknown };
          const delta = j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
          if (delta) yield { delta };
          if (j.usageMetadata) yield { delta: "", usage: usage(j.usageMetadata) };
        } catch { /* ignore */ }
      }
    }
  },

  async embed(req, creds) {
    if (!creds.apiKey) throw new AIError("auth", "Gemini requires an API key", { providerKind: "gemini" });
    const base = (creds.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    const modelId = normalizeModelId(req.model);
    const url = `${base}/models/${encodeURIComponent(modelId)}:batchEmbedContents?key=${encodeURIComponent(creds.apiKey)}`;
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: inputs.map((t) => ({ model: `models/${modelId}`, content: { parts: [{ text: t }] } })) }),
    });
    const text = await res.text();
    if (!res.ok) throw new AIError(classifyHttpError(res.status, text), text.slice(0, 500), { httpStatus: res.status, providerKind: "gemini" });
    const j = JSON.parse(text) as { embeddings: { values: number[] }[] };
    return { model: req.model, embeddings: j.embeddings.map((e) => e.values) };
  },

  async healthCheck(creds) {
    const start = Date.now();
    try {
      const base = (creds.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
      const res = await fetch(`${base}/models?key=${encodeURIComponent(creds.apiKey || "")}`);
      return { ok: res.ok, latency_ms: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (e) { return { ok: false, latency_ms: Date.now() - start, error: (e as Error).message }; }
  },
};
