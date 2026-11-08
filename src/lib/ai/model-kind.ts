const NON_CHAT_MODEL_PATTERN =
  /moderation|realtime|embedding|tts|whisper|dall-e|image|audio|transcribe|speech/i;

/** Whether a discovered model is a reasonable candidate for chat/completions. */
export function isChatModelId(modelId: string): boolean {
  return modelId.trim().length > 0 && !NON_CHAT_MODEL_PATTERN.test(modelId);
}

const CHAT_MODEL_PATTERN =
  /^(?:gpt-|chatgpt-|o\d|claude|gemini|deepseek-chat|grok|mistral|llama|qwen)/i;

export function pickChatModelId(
  models: Array<{ model_id: string; is_default?: boolean }>,
): string | undefined {
  const candidates = models.filter((model) => isChatModelId(model.model_id));
  return (
    candidates.find((model) => model.is_default && CHAT_MODEL_PATTERN.test(model.model_id)) ??
    candidates.find((model) => CHAT_MODEL_PATTERN.test(model.model_id)) ??
    candidates.find((model) => model.is_default) ??
    candidates[0]
  )?.model_id;
}

// These are the text chat models used by WACRM's AI features. Keep this small:
// provider /models endpoints also return moderation, speech and image models.
export const APP_CHAT_MODELS: Partial<Record<string, readonly string[]>> = {
  // Current stable text models only. Order is the app preference: economical
  // default first, then higher-quality options.
  openai: ["gpt-6-luna", "gpt-5.6-luna", "gpt-5.4-mini", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.5"],
  gemini: [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-4-argon",
  ],
};

export type AppChatModelTier = "Budget" | "Balanced" | "Premium";

const APP_CHAT_MODEL_DETAILS: Record<
  string,
  { label: string; tier: AppChatModelTier; inputCostPer1k: number; outputCostPer1k: number }
> = {
  "gpt-6-luna": {
    label: "GPT-6 Luna",
    tier: "Budget",
    inputCostPer1k: 0.0001,
    outputCostPer1k: 0.0005,
  },
  "gpt-5.6-luna": {
    label: "GPT-5.6 Luna",
    tier: "Budget",
    inputCostPer1k: 0.0002,
    outputCostPer1k: 0.0012,
  },
  "gpt-5.4-mini": {
    label: "GPT-5.4 Mini",
    tier: "Balanced",
    inputCostPer1k: 0.00075,
    outputCostPer1k: 0.0045,
  },
  "gpt-5.6-terra": {
    label: "GPT-5.6 Terra",
    tier: "Balanced",
    inputCostPer1k: 0.002,
    outputCostPer1k: 0.012,
  },
  "gpt-5.6-sol": {
    label: "GPT-5.6 Sol",
    tier: "Premium",
    inputCostPer1k: 0.004,
    outputCostPer1k: 0.02,
  },
  "gpt-5.5": {
    label: "GPT-5.5",
    tier: "Premium",
    inputCostPer1k: 0.005,
    outputCostPer1k: 0.03,
  },
  "gemini-3.1-flash-lite": {
    label: "Gemini 3.1 Flash Lite",
    tier: "Budget",
    inputCostPer1k: 0.00025,
    outputCostPer1k: 0.0015,
  },
  "gemini-3.5-flash-lite": {
    label: "Gemini 3.5 Flash Lite",
    tier: "Budget",
    inputCostPer1k: 0.0003,
    outputCostPer1k: 0.0025,
  },
  "gemini-3.6-flash": {
    label: "Gemini 3.6 Flash",
    tier: "Balanced",
    inputCostPer1k: 0.00075,
    outputCostPer1k: 0.00375,
  },
  "gemini-3.5-flash": {
    label: "Gemini 3.5 Flash",
    tier: "Balanced",
    inputCostPer1k: 0.0015,
    outputCostPer1k: 0.009,
  },
  "gemini-3.8-flash": {
    label: "Gemini 3.8 Flash",
    tier: "Premium",
    inputCostPer1k: 0.00075,
    outputCostPer1k: 0.00375,
  },
  "gemini-4-argon": {
    label: "Gemini 4 Argon",
    tier: "Premium",
    inputCostPer1k: 0.002,
    outputCostPer1k: 0.01,
  },
};

export function appChatModelDetails(modelId: string) {
  return APP_CHAT_MODEL_DETAILS[modelId];
}

export function appChatModelIds(kind: string): readonly string[] | undefined {
  return APP_CHAT_MODELS[kind];
}

export function providerChatModelId(
  kind: string,
  models: Array<{ model_id: string; is_default?: boolean }>,
): string | undefined {
  const allowed = appChatModelIds(kind);
  const chatModels = allowed
    ? models.filter((model) => allowed.includes(model.model_id))
    : models.filter((model) => isChatModelId(model.model_id));
  return pickChatModelId(chatModels);
}
