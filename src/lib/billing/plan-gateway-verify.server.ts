/**
 * Plan ↔ gateway mapping verification (server-only, super admin).
 *
 * Calls the payment gateway's own API for every link of a plan and checks the
 * stored price/product id really exists and still matches the plan's amount,
 * currency and billing interval. Where the gateway exposes it, missing data is
 * *refreshed* back into `plan_gateway_prices` (e.g. the product id behind a
 * Stripe price). The outcome is persisted on each row so the Plan Manager can
 * show verification state without re-hitting the gateway.
 *
 * Credentials are read from the env var named by the gateway's `secret_name`,
 * never from the database, and never returned to the caller.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type VerificationStatus =
  | "verified"
  | "mismatch"
  | "missing"
  | "error"
  | "unsupported"
  | "skipped";

export interface LinkVerification {
  linkId: string;
  providerId: string;
  mode: "sandbox" | "live";
  externalPriceId: string | null;
  externalProductId: string | null;
  status: VerificationStatus;
  message: string;
  amountCents: number | null;
  currency: string | null;
  interval: string | null;
  refreshed: string[];
}

export interface VerifyResult {
  planId: string;
  planCode: string;
  checkedAt: string;
  results: LinkVerification[];
  summary: Record<VerificationStatus, number>;
}

interface LinkRow {
  id: string;
  plan_id: string;
  provider_id: string;
  mode: "sandbox" | "live";
  external_price_id: string | null;
  external_product_id: string | null;
  checkout_url: string | null;
  enabled: boolean;
}

interface PlanRow {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
}

interface GatewayRow {
  provider_id: string;
  mode: "sandbox" | "live";
  secret_name: string | null;
  enabled: boolean;
}

type Probe = {
  status: VerificationStatus;
  message: string;
  amountCents: number | null;
  currency: string | null;
  interval: string | null;
  productId?: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Map a gateway interval string onto the plan's interval vocabulary. */
function sameInterval(planInterval: string, gatewayInterval: string | null): boolean {
  if (!gatewayInterval) return true;
  const p = norm(planInterval);
  const g = norm(gatewayInterval);
  if (p === g) return true;
  const alias: Record<string, string[]> = {
    month: ["monthly", "month"],
    year: ["yearly", "annual", "annually", "year"],
    week: ["weekly", "week"],
    day: ["daily", "day"],
  };
  return (alias[p] ?? []).includes(g);
}

/* -------------------------------------------------------------------------- */
/*  Gateway probes                                                             */
/* -------------------------------------------------------------------------- */

async function probeStripe(priceId: string, secret: string): Promise<Probe> {
  const res = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    active?: boolean;
    unit_amount?: number | null;
    currency?: string;
    product?: string | { id?: string };
    recurring?: { interval?: string } | null;
  };
  if (res.status === 404) {
    return {
      status: "missing",
      message: `Stripe has no price "${priceId}" for these credentials.`,
      amountCents: null,
      currency: null,
      interval: null,
    };
  }
  if (!res.ok) {
    return {
      status: "error",
      message: json.error?.message ?? `Stripe returned HTTP ${res.status}.`,
      amountCents: null,
      currency: null,
      interval: null,
    };
  }
  const product = typeof json.product === "string" ? json.product : (json.product?.id ?? null);
  return {
    status: json.active === false ? "mismatch" : "verified",
    message: json.active === false ? "Price exists but is archived in Stripe." : "Price found.",
    amountCents: typeof json.unit_amount === "number" ? json.unit_amount : null,
    currency: json.currency ?? null,
    interval: json.recurring?.interval ?? null,
    productId: product,
  };
}

async function probePaddle(priceId: string, secret: string, mode: string): Promise<Probe> {
  const base = mode === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  const res = await fetch(`${base}/prices/${encodeURIComponent(priceId)}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { detail?: string };
    data?: {
      status?: string;
      product_id?: string;
      unit_price?: { amount?: string; currency_code?: string };
      billing_cycle?: { interval?: string } | null;
    };
  };
  if (res.status === 404) {
    return {
      status: "missing",
      message: `Paddle has no price "${priceId}" in ${mode}.`,
      amountCents: null,
      currency: null,
      interval: null,
    };
  }
  if (!res.ok || !json.data) {
    return {
      status: "error",
      message: json.error?.detail ?? `Paddle returned HTTP ${res.status}.`,
      amountCents: null,
      currency: null,
      interval: null,
    };
  }
  const amount = Number(json.data.unit_price?.amount ?? NaN);
  return {
    status: json.data.status === "archived" ? "mismatch" : "verified",
    message: json.data.status === "archived" ? "Price is archived in Paddle." : "Price found.",
    amountCents: Number.isFinite(amount) ? amount : null,
    currency: json.data.unit_price?.currency_code ?? null,
    interval: json.data.billing_cycle?.interval ?? null,
    productId: json.data.product_id ?? null,
  };
}

/** Hosted-checkout links can only be reachability-checked. */
async function probeCheckoutUrl(url: string): Promise<Probe> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    return {
      status: res.ok ? "verified" : "missing",
      message: res.ok
        ? "Hosted checkout URL is reachable."
        : `Hosted checkout URL returned HTTP ${res.status}.`,
      amountCents: null,
      currency: null,
      interval: null,
    };
  } catch (error) {
    return {
      status: "error",
      message: `Hosted checkout URL unreachable: ${(error as Error).message}`,
      amountCents: null,
      currency: null,
      interval: null,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Orchestration                                                              */
/* -------------------------------------------------------------------------- */

export async function verifyPlanGatewayMappings(
  supabase: Client,
  input: { plan_id: string; refresh?: boolean },
): Promise<VerifyResult> {
  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("id, code, name, price_cents, currency, interval")
    .eq("id", input.plan_id)
    .maybeSingle();
  if (planErr) throw planErr;
  if (!plan) throw new Error("plan_not_found");
  const planRow = plan as PlanRow;

  const { data: linkData, error: linkErr } = await supabase
    .from("plan_gateway_prices")
    .select(
      "id, plan_id, provider_id, mode, external_price_id, external_product_id, checkout_url, enabled",
    )
    .eq("plan_id", planRow.id);
  if (linkErr) throw linkErr;
  const links = (linkData ?? []) as LinkRow[];

  const { data: gwData, error: gwErr } = await supabase
    .from("payment_gateway_settings")
    .select("provider_id, mode, secret_name, enabled");
  if (gwErr) throw gwErr;
  const gateways = new Map(
    ((gwData ?? []) as GatewayRow[]).map((g) => [g.provider_id, g] as const),
  );

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const checkedAt = new Date().toISOString();
  const results: LinkVerification[] = [];

  for (const link of links) {
    const gw = gateways.get(link.provider_id);
    const secret = gw?.secret_name ? (process.env[gw.secret_name] ?? "") : "";
    const refreshed: string[] = [];
    let probe: Probe;

    if (!gw) {
      probe = {
        status: "skipped",
        message: `Gateway "${link.provider_id}" is not configured on this platform.`,
        amountCents: null,
        currency: null,
        interval: null,
      };
    } else if (!link.external_price_id && link.checkout_url) {
      probe = await probeCheckoutUrl(link.checkout_url);
    } else if (!link.external_price_id) {
      probe = {
        status: "missing",
        message: "No gateway price id and no hosted checkout URL is stored.",
        amountCents: null,
        currency: null,
        interval: null,
      };
    } else if (link.provider_id !== "stripe" && link.provider_id !== "paddle") {
      probe = {
        status: "unsupported",
        message: `Automatic verification is not available for ${link.provider_id} yet.`,
        amountCents: null,
        currency: null,
        interval: null,
      };
    } else if (!secret) {
      probe = {
        status: "skipped",
        message: gw.secret_name
          ? `Secret "${gw.secret_name}" is not set on the server.`
          : "No API secret is configured for this gateway.",
        amountCents: null,
        currency: null,
        interval: null,
      };
    } else {
      try {
        probe =
          link.provider_id === "stripe"
            ? await probeStripe(link.external_price_id, secret)
            : await probePaddle(link.external_price_id, secret, link.mode);
      } catch (error) {
        probe = {
          status: "error",
          message: (error as Error).message,
          amountCents: null,
          currency: null,
          interval: null,
        };
      }
    }

    // Compare against the plan definition when the gateway told us numbers.
    if (probe.status === "verified") {
      const issues: string[] = [];
      if (probe.amountCents !== null && probe.amountCents !== planRow.price_cents) {
        issues.push(
          `amount ${(probe.amountCents / 100).toFixed(2)} ≠ plan ${(planRow.price_cents / 100).toFixed(2)}`,
        );
      }
      if (probe.currency && norm(probe.currency) !== norm(planRow.currency)) {
        issues.push(`currency ${probe.currency.toUpperCase()} ≠ ${planRow.currency.toUpperCase()}`);
      }
      if (!sameInterval(planRow.interval, probe.interval)) {
        issues.push(`interval ${probe.interval} ≠ ${planRow.interval}`);
      }
      if (issues.length > 0) {
        probe = { ...probe, status: "mismatch", message: `Gateway disagrees: ${issues.join(", ")}.` };
      }
    }

    // Refresh what we can safely pull back from the gateway.
    const patch: Record<string, unknown> = {
      last_verified_at: checkedAt,
      verification_status: probe.status,
      verification_message: probe.message.slice(0, 500),
      verified_amount_cents: probe.amountCents,
      verified_currency: probe.currency,
      verified_interval: probe.interval,
    };
    if (
      input.refresh !== false &&
      probe.productId &&
      probe.productId !== link.external_product_id
    ) {
      patch["external_product_id"] = probe.productId;
      refreshed.push("external_product_id");
    }

    const { error: upErr } = await supabaseAdmin
      .from("plan_gateway_prices")
      .update(patch as never)
      .eq("id", link.id);
    if (upErr) {
      probe = { ...probe, status: "error", message: `Could not save result: ${upErr.message}` };
    }

    results.push({
      linkId: link.id,
      providerId: link.provider_id,
      mode: link.mode,
      externalPriceId: link.external_price_id,
      externalProductId: (patch["external_product_id"] as string) ?? link.external_product_id,
      status: probe.status,
      message: probe.message,
      amountCents: probe.amountCents,
      currency: probe.currency,
      interval: probe.interval,
      refreshed,
    });
  }

  const summary: Record<VerificationStatus, number> = {
    verified: 0,
    mismatch: 0,
    missing: 0,
    error: 0,
    unsupported: 0,
    skipped: 0,
  };
  for (const r of results) summary[r.status] += 1;

  return { planId: planRow.id, planCode: planRow.code, checkedAt, results, summary };
}
