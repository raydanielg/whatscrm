/**
 * Direct Gemini provider for the Vercel AI SDK.
 *
 * Server-only. Takes the GEMINI_API_KEY value from the caller and constructs a
 * per-request provider without an external gateway.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { GEMINI_OPENAI_BASE, geminiChatModel } from "@/lib/ai/gemini.server";

/**
 * Gateway-style model ids ("google/gemini-2.5-flash", "openai/gpt-5") are
 * rewritten to ids Gemini accepts before the request leaves the server.
 */
function withGeminiModelId(inner: typeof fetch): typeof fetch {
  return (input, init) => {
    if (typeof init?.body === "string") {
      try {
        const body = JSON.parse(init.body) as { model?: unknown };
        if (typeof body.model === "string") {
          body.model = geminiChatModel(body.model);
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch {
        /* not JSON: send unchanged */
      }
    }
    return inner(input, init);
  };
}
export function createDirectGeminiProvider(apiKey: string, options?: { structuredOutputs?: boolean }) {
  return createOpenAICompatible({
    name: "gemini",
    baseURL: GEMINI_OPENAI_BASE,
    apiKey,
    supportsStructuredOutputs: options?.structuredOutputs ?? false,
    fetch: withGeminiModelId(fetch),
  });
}
