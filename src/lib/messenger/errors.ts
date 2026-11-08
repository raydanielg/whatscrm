/**
 * Normalised Messenger Send API failures.
 *
 * Meta reports every failure as `{ code, error_subcode, message }`, and the
 * same code can mean different things (#10 is both "outside the messaging
 * window" and "app lacks permission"). Callers and the Inbox UI branch on
 * `MessengerErrorKind` instead of raw codes so a window rejection is never
 * mistaken for an expired token.
 *
 * Pure module: safe to import from both server code and React components.
 */

export type MessengerErrorKind =
  | "invalid_recipient"
  | "token_invalid"
  | "permission_missing"
  | "outside_window"
  | "account_config"
  | "generic";

export interface MetaErrorShape {
  code?: number;
  subcode?: number;
  message?: string;
  httpStatus?: number;
}

/** Stored on `messages.metadata.delivery_error` so the UI can explain failures. */
export interface MessengerDeliveryError {
  provider: "messenger";
  kind: MessengerErrorKind;
  code?: number | null;
  subcode?: number | null;
}

// Meta states the window failure in the error text on every variant, and that
// text is the primary signal below. Only the documented subcode is listed:
// labelling some other failure "outside the 24-hour window" would send agents
// to wait for a reply that is not actually the problem.
const OUTSIDE_WINDOW_SUBCODES = new Set([2018278]);
const TOKEN_SUBCODES = new Set([458, 459, 460, 463, 464, 467, 492]);
const RECIPIENT_SUBCODES = new Set([2018001]);

export function classifyMetaSendError(err: MetaErrorShape): MessengerErrorKind {
  const code = err.code;
  const subcode = err.subcode;
  const msg = (err.message ?? "").toLowerCase();

  if (
    (subcode !== undefined && OUTSIDE_WINDOW_SUBCODES.has(subcode)) ||
    /outside (of )?(the )?allowed (messaging )?window/.test(msg)
  ) {
    return "outside_window";
  }
  if (code === 190 || code === 102 || (subcode !== undefined && TOKEN_SUBCODES.has(subcode))) {
    return "token_invalid";
  }
  if (
    (subcode !== undefined && RECIPIENT_SUBCODES.has(subcode)) ||
    code === 551 ||
    (code === 100 && /recipient|no matching user|psid|user id/.test(msg))
  ) {
    return "invalid_recipient";
  }
  // Graph reserves 200–299 for permission errors; #10 is the Pages-specific
  // "application does not have permission for this action".
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) {
    return "permission_missing";
  }
  if (code === 3 || code === 100) return "account_config";
  return "generic";
}

export interface MessengerFailureCopy {
  summary: string;
  action?: string;
  retryable: boolean;
}

export function describeMessengerError(kind: MessengerErrorKind): MessengerFailureCopy {
  switch (kind) {
    case "invalid_recipient":
      return {
        summary: "Meta did not accept the recipient for this Page",
        action:
          "Messenger replies need the customer's page-scoped ID (PSID) for this exact Page. Wait for the customer to message this Page again, or re-sync this Page's conversations.",
        retryable: false,
      };
    case "outside_window":
      return {
        summary: "Outside Messenger's 24-hour reply window",
        action:
          "Meta only allows standard replies within 24 hours of the customer's last message. The message will send normally once the customer writes again.",
        retryable: false,
      };
    case "token_invalid":
      return {
        summary: "Facebook Page access token is invalid or expired",
        action: "Reconnect this Facebook Page under Settings → Messenger.",
        retryable: false,
      };
    case "permission_missing":
      return {
        summary: "The app is missing Messenger permission for this Page",
        action:
          "Reconnect the Page and grant pages_messaging, or check the app's Advanced Access in the Meta dashboard.",
        retryable: false,
      };
    case "account_config":
      return {
        summary: "This conversation's Facebook Page is not set up for sending",
        action: "Check that the Page is connected and subscribed under Settings → Messenger.",
        retryable: false,
      };
    default:
      return { summary: "Meta could not deliver this message", retryable: true };
  }
}

export class MessengerSendError extends Error {
  readonly kind: MessengerErrorKind;
  readonly metaCode?: number;
  readonly metaSubcode?: number;
  readonly metaType?: string;
  /** Only true for a genuinely invalid token — never for window/recipient errors. */
  readonly isAuthError: boolean;
  /** Set when the failure was detected locally and Meta was never called. */
  readonly local: boolean;

  constructor(
    kind: MessengerErrorKind,
    detail: string,
    opts: { code?: number; subcode?: number; type?: string; local?: boolean } = {},
  ) {
    super(redactSecrets(detail));
    this.name = "MessengerSendError";
    this.kind = kind;
    this.metaCode = opts.code;
    this.metaSubcode = opts.subcode;
    this.metaType = opts.type;
    this.isAuthError = kind === "token_invalid";
    this.local = opts.local ?? false;
  }

  toDeliveryError(): MessengerDeliveryError {
    return {
      provider: "messenger",
      kind: this.kind,
      code: this.metaCode ?? null,
      subcode: this.metaSubcode ?? null,
    };
  }

  /** Text safe for `messages.failed_reason` and API responses. */
  userMessage(): string {
    const copy = describeMessengerError(this.kind);
    return copy.action ? `${copy.summary}. ${copy.action}` : `${copy.summary}: ${this.message}`;
  }
}

/** Strip anything resembling an access token from text bound for logs or clients. */
export function redactSecrets(text: string): string {
  return text
    .replace(/access_token=[^&\s"']+/gi, "access_token=[redacted]")
    .replace(/\bEAA[A-Za-z0-9]{20,}\b/g, "[redacted-token]");
}

export function readMessengerDeliveryError(metadata: unknown): MessengerDeliveryError | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).delivery_error;
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<MessengerDeliveryError>;
  return e.provider === "messenger" && typeof e.kind === "string"
    ? (e as MessengerDeliveryError)
    : null;
}
