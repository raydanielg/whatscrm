export type AIErrorType =
  | "billing"
  | "auth" // 401/403 — bad key
  | "rate_limit" // 429
  | "timeout"
  | "network"
  | "validation" // 400 — bad request body
  | "context_length" // input too large
  | "not_found" // model or endpoint missing
  | "server" // 5xx upstream
  | "cancelled"
  | "unknown";

export class AIError extends Error {
  readonly type: AIErrorType;
  readonly httpStatus?: number;
  readonly providerKind?: string;
  readonly retryable: boolean;

  constructor(
    type: AIErrorType,
    message: string,
    opts: { httpStatus?: number; providerKind?: string; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "AIError";
    this.type = type;
    this.httpStatus = opts.httpStatus;
    this.providerKind = opts.providerKind;
    this.retryable =
      opts.retryable ??
      (type === "rate_limit" || type === "timeout" || type === "network" || type === "server");
  }
}

export function classifyHttpError(status: number, body?: string): AIErrorType {
  if (status === 402) return "billing";
  // OpenAI and compatible gateways often report depleted credits with HTTP
  // 429, which otherwise looks like a temporary rate limit.
  if (
    status === 429 &&
    /credit_balance_exhausted|insufficient_quota|billing_hard_limit_reached|no credits remaining/i.test(
      body ?? "",
    )
  )
    return "billing";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 408) return "timeout";
  if (status === 413 || (body && /context.*length|too many tokens/i.test(body)))
    return "context_length";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (status >= 400) return "validation";
  return "unknown";
}

/** Keep upstream response bodies and provider internals out of user-facing UI. */
export function safeAIErrorMessage(error: unknown): string {
  if (!(error instanceof AIError))
    return "The AI provider test failed. Check its credentials, billing, and selected model.";
  switch (error.type) {
    case "billing":
      return "This API project's credits are depleted. Add API credits or use another funded provider.";
    case "auth":
      return "The provider rejected the API credentials. Check the configured key and project access.";
    case "rate_limit":
      return "The provider is temporarily rate limited. Try again shortly.";
    case "not_found":
      return "The selected model or provider endpoint was not found.";
    case "validation":
      return /not a chat model|chat\/completions/i.test(error.message)
        ? "The selected model does not support chat. Choose an enabled chat model and test again."
        : "The provider rejected the test request. Check the selected chat model and provider configuration.";
    case "timeout":
    case "network":
    case "server":
      return "The AI provider could not be reached successfully. Try again or check its service status.";
    default:
      return "The AI provider test failed. Check its credentials, billing, and selected model.";
  }
}
