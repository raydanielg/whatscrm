/**
 * Shared validation rules for payment gateway configuration forms.
 *
 * Used client-side (inline field errors in the configure dialog) and
 * server-side (`upsertGateway`) so both enforce identical requirements.
 */

export const GATEWAY_ID_RE = /^[a-z0-9_]{2,40}$/;
export const SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,119}$/;

export type GatewayFormValues = {
  provider_id: string;
  display_label?: string | null;
  mode: "sandbox" | "live";
  enabled: boolean;
  publishable_key?: string | null;
  secret_name?: string | null;
  webhook_secret_name?: string | null;
  webhook_url?: string | null;
  supported_methods?: string[] | null;
  notes?: string | null;
};

export type GatewayFieldErrors = Partial<
  Record<
    | "provider_id"
    | "display_label"
    | "publishable_key"
    | "secret_name"
    | "webhook_secret_name"
    | "webhook_url"
    | "supported_methods"
    | "notes",
    string
  >
>;

const s = (v: string | null | undefined) => (v ?? "").trim();

/**
 * Validate a gateway configuration.
 *
 * @param values     the submitted form values
 * @param options.isNew        creating a brand new gateway (id is editable)
 * @param options.existingIds  ids already registered (uniqueness check)
 */
export function validateGatewayForm(
  values: GatewayFormValues,
  options: { isNew?: boolean; existingIds?: string[] } = {},
): GatewayFieldErrors {
  const errors: GatewayFieldErrors = {};
  const id = s(values.provider_id);
  const label = s(values.display_label);
  const publishable = s(values.publishable_key);
  const secret = s(values.secret_name);
  const webhookSecret = s(values.webhook_secret_name);
  const webhookUrl = s(values.webhook_url);
  const methods = values.supported_methods ?? [];
  const notes = s(values.notes);
  const live = values.mode === "live";

  if (!id) errors.provider_id = "Gateway ID is required.";
  else if (!GATEWAY_ID_RE.test(id))
    errors.provider_id = "Use 2–40 lowercase letters, numbers or underscores.";
  else if (options.isNew && (options.existingIds ?? []).includes(id))
    errors.provider_id = "A gateway with this ID already exists.";

  if (!label) errors.display_label = "Display name is required.";
  else if (label.length > 120) errors.display_label = "Keep the display name under 120 characters.";

  if (publishable.length > 500) errors.publishable_key = "Publishable key is too long.";
  else if (publishable && /\s/.test(publishable))
    errors.publishable_key = "Publishable key cannot contain spaces.";
  else if (publishable && live && /_test_/.test(publishable))
    errors.publishable_key = "This looks like a test key but the gateway is in live mode.";
  else if (publishable && !live && /_live_/.test(publishable))
    errors.publishable_key = "This looks like a live key but the gateway is in sandbox mode.";

  if (!secret) {
    if (values.enabled)
      errors.secret_name = "A secret key name is required before the gateway can be enabled.";
  } else if (!SECRET_NAME_RE.test(secret)) {
    errors.secret_name = "Enter the secret NAME (e.g. MY_GATEWAY_SECRET_KEY), not the key value.";
  } else if (/^(sk|pk|whsec)_/i.test(secret)) {
    errors.secret_name = "This looks like a raw key. Enter the backend secret name instead.";
  }

  if (webhookSecret && !SECRET_NAME_RE.test(webhookSecret))
    errors.webhook_secret_name = "Enter the secret NAME (e.g. MY_GATEWAY_WEBHOOK_SECRET).";
  else if (webhookSecret && /^(sk|pk|whsec)_/i.test(webhookSecret))
    errors.webhook_secret_name = "This looks like a raw secret. Enter the secret name instead.";
  else if (!webhookSecret && webhookUrl)
    errors.webhook_secret_name = "A webhook secret name is required when a webhook URL is set.";

  if (webhookUrl) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(webhookUrl);
    } catch {
      parsed = null;
    }
    if (!parsed) errors.webhook_url = "Enter a full URL, e.g. https://example.com/webhook.";
    else if (parsed.protocol !== "https:")
      errors.webhook_url = "Webhook URLs must use https.";
    else if (live && /localhost|127\.0\.0\.1/.test(parsed.hostname))
      errors.webhook_url = "A live gateway cannot use a localhost webhook URL.";
  } else if (values.enabled && live) {
    errors.webhook_url = "A live, enabled gateway needs a webhook URL.";
  }

  if (methods.length === 0)
    errors.supported_methods = "Select at least one payment method.";

  if (notes.length > 2000) errors.notes = "Notes must be under 2000 characters.";

  return errors;
}

export const hasGatewayErrors = (errors: GatewayFieldErrors): boolean =>
  Object.keys(errors).length > 0;

/** Flatten field errors into one message for server-side throws. */
export const formatGatewayErrors = (errors: GatewayFieldErrors): string =>
  Object.entries(errors)
    .map(([field, message]) => `${field.replace(/_/g, " ")}: ${message}`)
    .join(" • ");
