/**
 * AI request logging + daily usage aggregation.
 */
import type { AIProviderKind, TokenUsage } from "./types";
import { sbAny } from "@/lib/supabase/untyped";

interface LogEntry {
  workspaceId: string;
  userId?: string | null;
  providerId?: string | null;
  providerKind?: AIProviderKind;
  model?: string;
  operation?: "chat" | "stream" | "embed" | "image" | "transcribe" | "tts" | "moderation";
  feature?: string | null;
  status: "success" | "error" | "rate_limited" | "timeout" | "cancelled";
  httpStatus?: number;
  latencyMs?: number;
  usage?: TokenUsage;
  costUsd?: number;
  errorType?: string;
  errorMessage?: string;
  requestPreview?: unknown;
  responsePreview?: unknown;
  metadata?: Record<string, unknown>;
}

const MAX_PREVIEW = 1_500;

function redact(value: unknown): unknown {
  if (value == null) return null;
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return s.length > MAX_PREVIEW ? s.slice(0, MAX_PREVIEW) + "[truncated]" : s;
  } catch { return "[unserializable]"; }
}

export async function logAIRequest(entry: LogEntry): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    await sbAny(supabaseAdmin).from("ai_request_logs" as never).insert({
      workspace_id: entry.workspaceId,
      user_id: entry.userId ?? null,
      provider_id: entry.providerId ?? null,
      provider_kind: entry.providerKind ?? null,
      model: entry.model ?? null,
      operation: entry.operation ?? "chat",
      feature: entry.feature ?? null,
      status: entry.status,
      http_status: entry.httpStatus ?? null,
      latency_ms: entry.latencyMs ?? null,
      prompt_tokens: entry.usage?.prompt_tokens ?? 0,
      completion_tokens: entry.usage?.completion_tokens ?? 0,
      total_tokens: entry.usage?.total_tokens ?? 0,
      cost_usd: entry.costUsd ?? 0,
      error_type: entry.errorType ?? null,
      error_message: entry.errorMessage ?? null,
      request_preview: redact(entry.requestPreview),
      response_preview: redact(entry.responsePreview),
      metadata: entry.metadata ?? {},
    } as never);

    // Update daily rollup
    const day = new Date().toISOString().slice(0, 10);
    await sbAny(supabaseAdmin).rpc("upsert_ai_usage_daily" as never, {
      p_workspace_id: entry.workspaceId,
      p_day: day,
      p_provider_id: entry.providerId ?? null,
      p_model: entry.model ?? null,
      p_requests: 1,
      p_prompt_tokens: entry.usage?.prompt_tokens ?? 0,
      p_completion_tokens: entry.usage?.completion_tokens ?? 0,
      p_total_tokens: entry.usage?.total_tokens ?? 0,
      p_cost_usd: entry.costUsd ?? 0,
      p_errors: entry.status === "success" ? 0 : 1,
    } as never).then(() => undefined, () => undefined);
  } catch (e) {
    // never let logging break the caller
    console.error("[ai-logger]", (e as Error).message);
  }
}
