/**
 * Shared AI types — the contract every provider adapter implements.
 * Application code depends only on these types, never on provider SDKs.
 */

export type AIProviderKind =
  | "lovable" // Legacy database value; requests use the direct Gemini adapter.
  | "openai"
  | "gemini"
  | "anthropic"
  | "deepseek"
  | "grok"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "custom_openai";

export type AIRole = "system" | "user" | "assistant" | "tool";

export interface AIMessage {
  role: AIRole;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: AIToolCall[];
}

export interface AIToolDef {
  name: string;
  description?: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  messages: AIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  tools?: AIToolDef[];
  tool_choice?: "auto" | "none" | { name: string };
  response_format?: "text" | "json_object";
  stream?: boolean;
  metadata?: Record<string, unknown>;
  timeout_ms?: number;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatResponse {
  id?: string;
  model: string;
  content: string;
  tool_calls?: AIToolCall[];
  finish_reason?: "stop" | "length" | "tool_calls" | "content_filter" | "error";
  usage?: TokenUsage;
  raw?: unknown; // provider-native response (debugging only)
}

export interface StreamChunk {
  delta: string;
  tool_calls?: AIToolCall[];
  finish_reason?: ChatResponse["finish_reason"];
  usage?: TokenUsage;
}

export interface EmbedRequest {
  model: string;
  input: string | string[];
}

export interface EmbedResponse {
  model: string;
  embeddings: number[][];
  usage?: TokenUsage;
}

export interface ProviderCredentials {
  apiKey?: string;
  baseUrl?: string;
  organizationId?: string;
  extraHeaders?: Record<string, string>;
  config?: Record<string, unknown>;
}

export interface ProviderCapabilities {
  chat: boolean;
  stream: boolean;
  tools: boolean;
  vision: boolean;
  embed: boolean;
  json_mode: boolean;
}

export interface AIProvider {
  kind: AIProviderKind;
  capabilities(): ProviderCapabilities;
  chat(req: ChatRequest, creds: ProviderCredentials): Promise<ChatResponse>;
  stream?(req: ChatRequest, creds: ProviderCredentials): AsyncIterable<StreamChunk>;
  embed?(req: EmbedRequest, creds: ProviderCredentials): Promise<EmbedResponse>;
  listModels?(creds: ProviderCredentials): Promise<{ id: string; name?: string }[]>;
  healthCheck?(
    creds: ProviderCredentials,
  ): Promise<{ ok: boolean; latency_ms: number; error?: string }>;
}

// ---------- Persisted shapes (DB rows normalized) ----------

export interface AIProviderRecord {
  id: string;
  workspaceId: string;
  kind: AIProviderKind;
  name: string;
  baseUrl: string | null;
  apiKeySecretName: string | null;
  credentialSource?: "platform" | "workspace";
  vaultSecretId?: string | null;
  apiKeyLast4?: string | null;
  organizationId: string | null;
  enabled: boolean;
  isDefault: boolean;
  priority: number;
  config: Record<string, unknown>;
}

export interface AIModelRecord {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  capabilities: Partial<ProviderCapabilities>;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  inputCostPer1k: number;
  outputCostPer1k: number;
  enabled: boolean;
  isDefault: boolean;
}

export interface AIFeatureConfig {
  workspaceId: string;
  feature: string;
  providerId: string | null;
  fallbackProviderIds: string[];
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  systemPrompt: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
}
