/**
 * OpenAI-compatible adapter. Powers OpenAI, DeepSeek, Grok, OpenRouter,
 * Ollama, LM Studio, and any custom endpoint that
 * speaks `POST /chat/completions`.
 */

import type {
  AIProvider,
  AIProviderKind,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ProviderCapabilities,
  ProviderCredentials,
  StreamChunk,
  TokenUsage,
} from "../types";
import { AIError, classifyHttpError } from "../errors";

interface FactoryOpts {
  kind: AIProviderKind;
  defaultBaseUrl: string;
  authHeader?: (key: string) => Record<string, string>;
  supportsEmbeddings?: boolean;
}

function defaultAuth(key: string) {
  return { Authorization: `Bearer ${key}` };
}

/**
 * Some callers still pass provider-prefixed
 * model ids (e.g. "openai/gpt-5.5") left over from before this app had its
 * own direct OpenAI credentials. OpenAI's real API only accepts the bare
 * model id. OpenRouter is excluded: it natively expects "vendor/model".
 */
function normalizeModelId(kind: AIProviderKind, model: string): string {
  return kind === "openai" ? model.replace(/^openai\//, "") : model;
}

export function createOpenAICompatProvider(opts: FactoryOpts): AIProvider {
  const authHeader = opts.authHeader ?? defaultAuth;

  const buildHeaders = (creds: ProviderCredentials): Record<string, string> => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      ...(creds.extraHeaders ?? {}),
    };
    if (creds.apiKey) Object.assign(h, authHeader(creds.apiKey));
    if (opts.kind === "openai" && creds.organizationId)
      h["OpenAI-Organization"] = creds.organizationId;
    return h;
  };

  const baseUrl = (creds: ProviderCredentials) =>
    (creds.baseUrl || opts.defaultBaseUrl).replace(/\/+$/, "");

  const doFetch = async (url: string, init: RequestInit, timeoutMs: number) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      return res;
    } catch (e) {
      const msg = (e as Error).message || "network error";
      if ((e as Error).name === "AbortError") {
        throw new AIError("timeout", `Request timed out after ${timeoutMs}ms`, {
          providerKind: opts.kind,
        });
      }
      throw new AIError("network", msg, { providerKind: opts.kind });
    } finally {
      clearTimeout(t);
    }
  };

  const parseUsage = (u: unknown): TokenUsage | undefined => {
    if (!u || typeof u !== "object") return undefined;
    const r = u as Record<string, number>;
    return {
      prompt_tokens: r.prompt_tokens ?? r.input_tokens ?? 0,
      completion_tokens: r.completion_tokens ?? r.output_tokens ?? 0,
      total_tokens: r.total_tokens ?? (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0),
    };
  };

  return {
    kind: opts.kind,
    capabilities(): ProviderCapabilities {
      return {
        chat: true,
        stream: true,
        tools: true,
        vision: opts.kind === "openai" || opts.kind === "openrouter",
        embed: !!opts.supportsEmbeddings,
        json_mode: true,
      };
    },

    async chat(req: ChatRequest, creds: ProviderCredentials): Promise<ChatResponse> {
      const url = `${baseUrl(creds)}/chat/completions`;
      const body: Record<string, unknown> = {
        model: normalizeModelId(opts.kind, req.model),
        messages: req.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.name ? { name: m.name } : {}),
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          ...(m.tool_calls
            ? {
                tool_calls: m.tool_calls.map((tc) => ({
                  id: tc.id,
                  type: "function",
                  function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                })),
              }
            : {}),
        })),
      };
      const isCurrentOpenAIReasoningModel =
        opts.kind === "openai" && /^gpt-(?:5|6)(?:\.|-)/i.test(req.model);
      if (isCurrentOpenAIReasoningModel) body.reasoning_effort = "none";
      if (req.temperature != null) body.temperature = req.temperature;
      if (req.max_tokens != null) {
        if (isCurrentOpenAIReasoningModel) body.max_completion_tokens = req.max_tokens;
        else body.max_tokens = req.max_tokens;
      }
      if (req.top_p != null) body.top_p = req.top_p;
      if (req.stop?.length) body.stop = req.stop;
      if (req.response_format === "json_object") body.response_format = { type: "json_object" };
      if (req.tools?.length) {
        body.tools = req.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
        if (req.tool_choice) body.tool_choice = req.tool_choice;
      }

      const res = await doFetch(
        url,
        {
          method: "POST",
          headers: buildHeaders(creds),
          body: JSON.stringify(body),
        },
        req.timeout_ms ?? 60_000,
      );

      const text = await res.text();
      if (!res.ok) {
        throw new AIError(classifyHttpError(res.status, text), text.slice(0, 500), {
          httpStatus: res.status,
          providerKind: opts.kind,
        });
      }
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text);
      } catch {
        throw new AIError("server", `Invalid JSON response: ${text.slice(0, 200)}`, {
          providerKind: opts.kind,
        });
      }

      const choice = ((json.choices as unknown[]) || [])[0] as Record<string, unknown> | undefined;
      const msg = (choice?.message as Record<string, unknown>) || {};
      const content = (msg.content as string) || "";
      const toolCallsRaw = (msg.tool_calls as unknown[]) || [];
      const tool_calls = toolCallsRaw.map((tc) => {
        const t = tc as { id: string; function: { name: string; arguments: string } };
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(t.function.arguments);
        } catch {
          args = { _raw: t.function.arguments };
        }
        return { id: t.id, name: t.function.name, arguments: args };
      });

      return {
        id: json.id as string | undefined,
        model: (json.model as string) || req.model,
        content,
        tool_calls: tool_calls.length ? tool_calls : undefined,
        finish_reason: (choice?.finish_reason as ChatResponse["finish_reason"]) ?? "stop",
        usage: parseUsage(json.usage),
        raw: json,
      };
    },

    async *stream(req: ChatRequest, creds: ProviderCredentials): AsyncIterable<StreamChunk> {
      const url = `${baseUrl(creds)}/chat/completions`;
      const isCurrentOpenAIReasoningModel =
        opts.kind === "openai" && /^gpt-(?:5|6)(?:\.|-)/i.test(req.model);
      const body = {
        model: normalizeModelId(opts.kind, req.model),
        messages: req.messages,
        stream: true,
        ...(isCurrentOpenAIReasoningModel && { reasoning_effort: "none" }),
        ...(req.temperature != null && { temperature: req.temperature }),
        ...(req.max_tokens != null &&
          (isCurrentOpenAIReasoningModel
            ? { max_completion_tokens: req.max_tokens }
            : { max_tokens: req.max_tokens })),
      };

      const res = await doFetch(
        url,
        {
          method: "POST",
          headers: buildHeaders(creds),
          body: JSON.stringify(body),
        },
        req.timeout_ms ?? 120_000,
      );

      if (!res.ok || !res.body) {
        const errText = res.body ? await res.text() : "";
        throw new AIError(classifyHttpError(res.status, errText), errText.slice(0, 500), {
          httpStatus: res.status,
          providerKind: opts.kind,
        });
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
          const data = l.slice(5).trim();
          if (data === "[DONE]") return;
          try {
            const j = JSON.parse(data) as Record<string, unknown>;
            const choice = ((j.choices as unknown[]) || [])[0] as
              Record<string, unknown> | undefined;
            const delta = (choice?.delta as Record<string, unknown>) || {};
            yield {
              delta: (delta.content as string) || "",
              finish_reason: (choice?.finish_reason as ChatResponse["finish_reason"]) ?? undefined,
              usage: parseUsage(j.usage),
            };
          } catch {
            // ignore malformed keep-alive frames
          }
        }
      }
    },

    async embed(req: EmbedRequest, creds: ProviderCredentials): Promise<EmbedResponse> {
      if (!opts.supportsEmbeddings) {
        throw new AIError("validation", `${opts.kind} adapter has no embedding endpoint`, {
          providerKind: opts.kind,
        });
      }
      const url = `${baseUrl(creds)}/embeddings`;
      const res = await doFetch(
        url,
        {
          method: "POST",
          headers: buildHeaders(creds),
          body: JSON.stringify({ model: normalizeModelId(opts.kind, req.model), input: req.input }),
        },
        30_000,
      );
      const text = await res.text();
      if (!res.ok) {
        throw new AIError(classifyHttpError(res.status, text), text.slice(0, 500), {
          httpStatus: res.status,
          providerKind: opts.kind,
        });
      }
      const j = JSON.parse(text) as {
        data: { embedding: number[] }[];
        model: string;
        usage?: unknown;
      };
      return {
        model: j.model || req.model,
        embeddings: j.data.map((d) => d.embedding),
        usage: parseUsage(j.usage),
      };
    },

    async listModels(creds: ProviderCredentials) {
      try {
        const res = await doFetch(
          `${baseUrl(creds)}/models`,
          {
            headers: buildHeaders(creds),
          },
          15_000,
        );
        if (!res.ok) return [];
        const j = (await res.json()) as { data?: { id: string; name?: string }[] };
        return (j.data ?? []).map((m) => ({ id: m.id, name: m.name }));
      } catch {
        return [];
      }
    },

    async healthCheck(creds: ProviderCredentials) {
      const start = Date.now();
      try {
        const res = await doFetch(
          `${baseUrl(creds)}/models`,
          {
            headers: buildHeaders(creds),
          },
          8_000,
        );
        return {
          ok: res.ok,
          latency_ms: Date.now() - start,
          error: res.ok ? undefined : `HTTP ${res.status}`,
        };
      } catch (e) {
        return { ok: false, latency_ms: Date.now() - start, error: (e as Error).message };
      }
    },
  };
}
