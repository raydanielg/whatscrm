/**
 * Server-side conflict detection for plan ↔ gateway price mappings.
 *
 * The unique constraint on (plan_id, provider_id, mode) only prevents the
 * literal duplicate row. It does NOT prevent the far more dangerous mistakes:
 *
 *  - the same external price id mapped to two different plans on the same
 *    gateway + environment (customers get charged the wrong plan),
 *  - a live price id pasted into a sandbox mapping (or vice-versa),
 *  - the same external price id reused across environments,
 *  - a hosted checkout URL reused by two plans.
 *
 * These checks run before every write so bad mappings never land in the DB.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type ConflictInput = {
  id?: string | undefined;
  plan_id: string;
  provider_id: string;
  mode: "sandbox" | "live";
  external_price_id?: string | null | undefined;
  external_product_id?: string | null | undefined;
  checkout_url?: string | null | undefined;
};

type ExistingRow = {
  id: string;
  plan_id: string;
  provider_id: string;
  mode: "sandbox" | "live";
  external_price_id: string | null;
  checkout_url: string | null;
};

export class PlanGatewayConflictError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PlanGatewayConflictError";
    this.code = code;
  }
}

/** Environment prefixes that clearly belong to one mode only. */
function modeOfIdentifier(provider_id: string, value: string): "sandbox" | "live" | null {
  const v = value.trim();
  if (provider_id === "stripe" || v.startsWith("price_") || v.startsWith("prod_")) {
    if (/_test_/.test(v) || v.startsWith("sk_test") || v.startsWith("price_test_")) return "sandbox";
  }
  if (v.startsWith("pri_") || v.startsWith("pro_")) {
    // Paddle Billing ids are not mode-tagged; nothing to infer.
    return null;
  }
  if (/\btest\b/i.test(v) && !/\blivetest\b/i.test(v)) return "sandbox";
  return null;
}

function urlMode(url: string): "sandbox" | "live" | null {
  const u = url.toLowerCase();
  if (u.includes("sandbox") || u.includes("test.")) return "sandbox";
  return null;
}

/**
 * Throws `PlanGatewayConflictError` when the proposed mapping duplicates or
 * conflicts with an existing one. Safe to call for both insert and update
 * (pass `id` when updating so the row does not conflict with itself).
 */
export async function assertNoPlanGatewayConflict(
  supabase: Client,
  input: ConflictInput,
): Promise<void> {
  const priceId = input.external_price_id?.trim() || null;
  const productId = input.external_product_id?.trim() || null;
  const checkoutUrl = input.checkout_url?.trim() || null;

  if (!priceId && !checkoutUrl) {
    throw new PlanGatewayConflictError(
      "missing_target",
      "Provide either a gateway price/plan id or a hosted checkout URL.",
    );
  }

  // 1. Environment sanity: an id/URL that is clearly test-only cannot be a
  //    live mapping, and an obviously live target cannot be sandbox.
  for (const [label, value] of [
    ["price id", priceId],
    ["product id", productId],
  ] as const) {
    if (!value) continue;
    const inferred = modeOfIdentifier(input.provider_id, value);
    if (inferred && inferred !== input.mode) {
      throw new PlanGatewayConflictError(
        "mode_mismatch",
        `This ${label} looks like a ${inferred} identifier but the mapping is set to ${input.mode}.`,
      );
    }
  }
  if (checkoutUrl) {
    const inferred = urlMode(checkoutUrl);
    if (inferred && inferred !== input.mode) {
      throw new PlanGatewayConflictError(
        "mode_mismatch",
        `This checkout URL looks like a ${inferred} URL but the mapping is set to ${input.mode}.`,
      );
    }
  }

  // 2. Fetch every mapping for this provider (both environments) so we can
  //    detect cross-plan and cross-environment reuse in one round trip.
  const { data, error } = await supabase
    .from("plan_gateway_prices")
    .select("id, plan_id, provider_id, mode, external_price_id, checkout_url")
    .eq("provider_id", input.provider_id);
  if (error) throw error;

  const rows = ((data ?? []) as ExistingRow[]).filter((r) => r.id !== input.id);

  // 2a. Exact duplicate mapping (same plan + provider + mode).
  const dupe = rows.find((r) => r.plan_id === input.plan_id && r.mode === input.mode);
  if (dupe) {
    throw new PlanGatewayConflictError(
      "duplicate_mapping",
      `This plan already has a ${input.mode} mapping for this gateway. Edit the existing mapping instead of creating a second one.`,
    );
  }

  if (priceId) {
    // 2b. Same price id on another plan, same environment → wrong charges.
    const sameEnv = rows.find(
      (r) => r.mode === input.mode && r.external_price_id?.trim() === priceId,
    );
    if (sameEnv) {
      throw new PlanGatewayConflictError(
        "price_reused_in_environment",
        `Price id "${priceId}" is already mapped to another plan in ${input.mode}. Each gateway price may only back one plan per environment.`,
      );
    }

    // 2c. Same price id used in the other environment → almost always a
    //     copy/paste of a live id into sandbox (or vice-versa).
    const otherEnv = rows.find(
      (r) => r.mode !== input.mode && r.external_price_id?.trim() === priceId,
    );
    if (otherEnv) {
      throw new PlanGatewayConflictError(
        "price_reused_across_environments",
        `Price id "${priceId}" is already used by a ${otherEnv.mode} mapping. Sandbox and live must use different gateway prices.`,
      );
    }
  }

  if (checkoutUrl) {
    const urlClash = rows.find(
      (r) => r.mode === input.mode && r.checkout_url?.trim() === checkoutUrl,
    );
    if (urlClash) {
      throw new PlanGatewayConflictError(
        "checkout_url_reused",
        `This checkout URL is already mapped to another plan in ${input.mode}.`,
      );
    }
  }
}
