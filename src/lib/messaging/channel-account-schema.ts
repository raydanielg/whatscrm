/**
 * Runtime contract for every server-function / Supabase response that returns
 * channel accounts.
 *
 * The inbox crashed in the past ("accounts is not iterable") whenever a query
 * produced a shape other than `{ accounts: ChannelAccountRow[] }` — a cache
 * collision, a partially-migrated row, or a PostgREST error object. Types
 * alone cannot catch that, so every boundary parses through these schemas and
 * degrades to a typed fallback instead of throwing into the error boundary.
 *
 * Client-safe: no server-only imports, usable from hooks and server functions.
 */

import { z } from "zod";

export const CHANNEL_ACCOUNT_STATUSES = [
  "pending",
  "connected",
  "disconnected",
  "error",
  "suspended",
] as const;

/** Unknown/legacy status values degrade to `disconnected` rather than failing the row. */
const statusSchema = z
  .string()
  .transform((v) => v.toLowerCase())
  .transform((v) =>
    (CHANNEL_ACCOUNT_STATUSES as readonly string[]).includes(v)
      ? (v as (typeof CHANNEL_ACCOUNT_STATUSES)[number])
      : ("disconnected" as const),
  );

const nullableString = z.string().nullable().catch(null);

export const channelAccountSchema = z.object({
  id: z.string().min(1),
  workspace_id: z.string().min(1),
  inbox_id: nullableString.default(null),
  provider: z.string().min(1),
  display_name: z.string().catch(""),
  phone_number: nullableString.default(null),
  phone_number_id: nullableString.default(null),
  waba_id: nullableString.default(null),
  business_id: nullableString.default(null),
  access_token_secret_name: nullableString.default(null),
  app_secret_name: nullableString.default(null),
  verify_token: nullableString.default(null),
  status: statusSchema.catch("disconnected"),
  status_reason: nullableString.default(null),
  metadata: z
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- keeps the
    // payload structurally serializable across the server-function boundary.
    .record(z.string(), z.any())
    .nullable()
    .catch(null)
    .transform((m) => m ?? {}),
  is_default: z.boolean().catch(false),
  last_verified_at: nullableString.default(null),
  created_at: z.string().catch(() => new Date(0).toISOString()),
  updated_at: z.string().catch(() => new Date(0).toISOString()),
});

export type ChannelAccount = z.infer<typeof channelAccountSchema>;

/** The wire shape of `listChannelAccounts` and friends. */
export const channelAccountsResponseSchema = z.object({
  accounts: z.array(channelAccountSchema),
});

/** Result of a defensive parse — never throws, always iterable. */
export interface ChannelAccountsResult {
  accounts: ChannelAccount[];
  /** Rows dropped because they failed validation. */
  invalid: number;
  /** Present when the payload itself was unusable (wrong shape / not an array). */
  error?: string;
}

const EMPTY: ChannelAccountsResult = { accounts: [], invalid: 0 };

function logInvalid(context: string, detail: string) {
  if (typeof console !== "undefined") {
    console.warn(`[channel-accounts] ${context}: ${detail}`);
  }
}

/**
 * Parse an array of raw rows, dropping (and counting) the ones that don't
 * match the contract. Valid rows always survive a few bad neighbours.
 */
export function parseChannelAccountRows(
  raw: unknown,
  context = "rows",
): ChannelAccountsResult {
  if (raw == null) return { ...EMPTY };
  if (!Array.isArray(raw)) {
    logInvalid(context, `expected an array, received ${typeof raw}`);
    return { accounts: [], invalid: 0, error: "Invalid channel account payload" };
  }

  const accounts: ChannelAccount[] = [];
  let invalid = 0;
  for (const row of raw) {
    const parsed = channelAccountSchema.safeParse(row);
    if (parsed.success) accounts.push(parsed.data);
    else invalid += 1;
  }
  if (invalid > 0) logInvalid(context, `dropped ${invalid} malformed row(s)`);
  return { accounts, invalid };
}

/**
 * Parse a full `{ accounts: [...] }` server-function response. Accepts a bare
 * array too, so older/alternate payloads still resolve instead of crashing.
 */
export function parseChannelAccountsResponse(
  raw: unknown,
  context = "listChannelAccounts",
): ChannelAccountsResult {
  if (raw == null) return { ...EMPTY };
  if (Array.isArray(raw)) return parseChannelAccountRows(raw, context);
  if (typeof raw === "object" && "accounts" in (raw as Record<string, unknown>)) {
    return parseChannelAccountRows((raw as { accounts: unknown }).accounts, context);
  }
  logInvalid(context, `unexpected response shape (${typeof raw})`);
  return { accounts: [], invalid: 0, error: "Invalid channel account response" };
}

/** Minimal projection used by the conversation channel switcher. */
export const channelSwitcherAccountSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  status: z.string().catch("disconnected"),
  status_reason: nullableString.default(null),
  is_default: z.boolean().catch(false),
  display_name: nullableString.default(null),
});

export type ChannelSwitcherAccount = z.infer<typeof channelSwitcherAccountSchema>;

/** Never throws; malformed rows are dropped so the switcher stays iterable. */
export function parseChannelSwitcherAccounts(raw: unknown): ChannelSwitcherAccount[] {
  if (!Array.isArray(raw)) {
    if (raw != null) logInvalid("channel-switcher-accounts", "expected an array");
    return [];
  }
  const out: ChannelSwitcherAccount[] = [];
  for (const row of raw) {
    const parsed = channelSwitcherAccountSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
