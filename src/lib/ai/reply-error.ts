export const PROVIDER_CREDITS_MESSAGE =
  "The selected AI provider has no available credits. Ask a workspace admin to top up that provider or select another in API Configuration → AI Settings.";

export function replyAssistantErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/No AI provider configured for this workspace/i.test(message))
    return "AI is not configured for this workspace. Ask your platform administrator to add a provider.";
  if (
    /credit_balance_exhausted|insufficient_quota|billing_hard_limit_reached|no credits remaining|no available credits|\b402\b/i.test(
      message,
    )
  )
    return PROVIDER_CREDITS_MESSAGE;
  if (/\b429\b|rate limit/i.test(message))
    return "The AI provider is temporarily rate limited. Try again shortly.";
  if (/\b50[234]\b|"UNAVAILABLE"|high demand|overloaded/i.test(message))
    return "The AI model is busy right now (high demand at the provider). Try again in a minute, or choose another default model in AI Settings.";
  if (!message || /^\s*[{[]/.test(message) || message.length > 240)
    return "AI reply could not be generated. Check the configured provider in AI Settings and try again.";
  return message;
}
