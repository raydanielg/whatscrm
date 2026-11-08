/**
 * Shared resolution of "which gateway sells this plan, and with which
 * external price?".
 *
 * Used both by the `resolvePlanCheckoutTarget` server function (UI: gateway
 * picker) and by `createCheckoutSession` (runtime: actual purchase), so the
 * two can never drift apart.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type PlanGatewayLinkRow = {
  id: string;
  plan_id: string;
  provider_id: string;
  mode: "sandbox" | "live";
  external_price_id: string | null;
  external_product_id: string | null;
  checkout_url: string | null;
  enabled: boolean;
  notes: string | null;
  updated_at: string | null;
};

const COLS =
  "id, plan_id, provider_id, mode, external_price_id, external_product_id, checkout_url, enabled, notes, updated_at";

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
};

export async function resolvePlanGatewayTarget(
  supabase: Client,
  input: { plan_code: string; workspace_id?: string | null; provider_id?: string | null },
): Promise<{
  plan: PlanRow;
  links: PlanGatewayLinkRow[];
  selected: PlanGatewayLinkRow | null;
  default_provider_id: string | null;
  reason: "no_enabled_gateway_linked" | "provider_not_available" | null;
}> {
  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("id, code, name, price_cents, currency, interval")
    .eq("code", input.plan_code)
    .maybeSingle();
  if (planErr) throw planErr;
  if (!plan) throw new Error("plan_not_found");

  const { data: rows, error } = await supabase
    .from("plan_gateway_prices")
    .select(COLS)
    .eq("plan_id", (plan as PlanRow).id)
    .eq("enabled", true);
  if (error) throw error;

  const { enabledGatewayIds, defaultGatewayId, gatewayModes } = await import(
    "./gateway-guard.server"
  );
  const [allowed, fallbackDefault, modes] = await Promise.all([
    enabledGatewayIds(supabase, input.workspace_id ?? null),
    defaultGatewayId(supabase, input.workspace_id ?? null),
    gatewayModes(supabase),
  ]);

  // Only links matching the gateway's current environment can be charged.
  const links = ((rows ?? []) as PlanGatewayLinkRow[]).filter(
    (l) => allowed.includes(l.provider_id) && l.mode === (modes[l.provider_id] ?? "sandbox"),
  );

  const selected =
    (input.provider_id ? links.find((l) => l.provider_id === input.provider_id) : null) ??
    links.find((l) => l.provider_id === fallbackDefault) ??
    links[0] ??
    null;

  return {
    plan: plan as PlanRow,
    links,
    selected,
    default_provider_id: fallbackDefault,
    reason: selected
      ? null
      : links.length === 0
        ? "no_enabled_gateway_linked"
        : "provider_not_available",
  };
}

/**
 * Bulk variant used by the self-service "Change plan" panel: for every active
 * plan, list the gateways that could actually charge it right now (gateway
 * enabled for the workspace AND link mode matching the gateway environment).
 *
 * Uses the same rules as `resolvePlanGatewayTarget`, so the UI can never offer
 * a purchase that checkout would reject.
 */
export async function listPurchasablePlanTargets(
  supabase: Client,
  workspaceId: string | null,
): Promise<
  Array<{
    id: string;
    code: string;
    name: string;
    price_cents: number;
    currency: string;
    interval: string;
    providers: string[];
  }>
> {
  const { data: plans, error: planErr } = await supabase
    .from("plans")
    .select("id, code, name, price_cents, currency, interval")
    .eq("is_active", true)
    .order("price_cents", { ascending: true });
  if (planErr) throw planErr;

  const { data: rows, error } = await supabase
    .from("plan_gateway_prices")
    .select(COLS)
    .eq("enabled", true);
  if (error) throw error;

  const { enabledGatewayIds, gatewayModes } = await import("./gateway-guard.server");
  const [allowed, modes] = await Promise.all([
    enabledGatewayIds(supabase, workspaceId),
    gatewayModes(supabase),
  ]);

  const byPlan = new Map<string, string[]>();
  for (const l of (rows ?? []) as PlanGatewayLinkRow[]) {
    if (!allowed.includes(l.provider_id)) continue;
    if (l.mode !== (modes[l.provider_id] ?? "sandbox")) continue;
    const list = byPlan.get(l.plan_id) ?? [];
    if (!list.includes(l.provider_id)) list.push(l.provider_id);
    byPlan.set(l.plan_id, list);
  }

  return ((plans ?? []) as PlanRow[]).map((p) => ({
    ...p,
    providers: byPlan.get(p.id) ?? [],
  }));
}

