import { sbAny } from "@/lib/supabase/untyped";
/**
 * Runtime enforcement of the Payment Gateways enable/disable switches.
 *
 * Any path that moves *new* money (checkout sessions, payment intents,
 * customer portal, payment links) must call `assertGatewayEnabled` first.
 * Operations on money that already moved (refunds, retries, status sync,
 * inbound webhooks) intentionally bypass the guard so disabling a gateway
 * never strands existing transactions.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export class GatewayDisabledError extends Error {
  constructor(providerId: string) {
    super(
      `Payment gateway "${providerId}" is disabled. Enable it in Admin → Payment Gateways first.`,
    );
    this.name = "GatewayDisabledError";
  }
}

/**
 * Per-workspace overrides. A row may set `enabled` to true/false to override
 * the platform switch, or leave it NULL to inherit. A workspace can never
 * enable a gateway the platform has switched off — overrides narrow, never widen.
 */
type WorkspaceOverride = {
  provider_id: string;
  enabled: boolean | null;
  is_default: boolean;
};

async function workspaceOverrides(
  supabase: Client,
  workspaceId?: string | null,
): Promise<Map<string, WorkspaceOverride>> {
  if (!workspaceId) return new Map();
  const { data, error } = await supabase
    .from("workspace_payment_gateway_settings")
    .select("provider_id, enabled, is_default")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  const rows = (data ?? []) as WorkspaceOverride[];
  return new Map(rows.map((r) => [r.provider_id, r]));
}

/**
 * Platform gateway rows through the signed-in-safe RPC. The raw
 * `payment_gateway_settings` table is readable by platform staff only, so
 * every non-admin path (checkout, payment links, workspace settings) reads
 * the non-sensitive projection instead.
 */
type Basic = { provider_id: string; enabled: boolean; is_default: boolean };

async function platformGateways(supabase: Client): Promise<Basic[]> {
  const { data, error } = await sbAny(supabase).rpc("list_payment_gateway_basics");
  if (error) throw error;
  return (data ?? []) as Basic[];
}

export async function isGatewayEnabled(
  supabase: Client,
  providerId: string,
  workspaceId?: string | null,
) {
  const row = (await platformGateways(supabase)).find((r) => r.provider_id === providerId);
  if (!row?.enabled) return false;

  const override = (await workspaceOverrides(supabase, workspaceId)).get(providerId);
  return override?.enabled ?? true;
}

export async function assertGatewayEnabled(
  supabase: Client,
  providerId: string,
  workspaceId?: string | null,
) {
  if (!(await isGatewayEnabled(supabase, providerId, workspaceId))) {
    throw new GatewayDisabledError(providerId);
  }
}

/** Provider ids that are currently switched on (optionally for one workspace). */
export async function enabledGatewayIds(
  supabase: Client,
  workspaceId?: string | null,
): Promise<string[]> {
  const ids = (await platformGateways(supabase)).filter((r) => r.enabled).map((r) => r.provider_id);

  const overrides = await workspaceOverrides(supabase, workspaceId);
  return ids.filter((id) => overrides.get(id)?.enabled ?? true);
}

/**
 * The effective default gateway id: workspace default when set and still
 * enabled, otherwise the platform default, otherwise the first enabled one.
 */
export async function defaultGatewayId(
  supabase: Client,
  workspaceId?: string | null,
): Promise<string | null> {
  const rows = (await platformGateways(supabase)).filter((r) => r.enabled);

  const overrides = await workspaceOverrides(supabase, workspaceId);
  const available = rows.filter((r) => overrides.get(r.provider_id)?.enabled ?? true);

  const workspaceDefault = available.find((r) => overrides.get(r.provider_id)?.is_default);
  return (
    workspaceDefault?.provider_id ??
    available.find((r) => r.is_default)?.provider_id ??
    available[0]?.provider_id ??
    null
  );
}


/** Current environment mode per gateway (`sandbox` | `live`). */
export async function gatewayModes(supabase: Client): Promise<Record<string, string>> {
  const rows = (await platformGateways(supabase)) as unknown as Array<{
    provider_id: string;
    mode?: string | null;
  }>;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.provider_id] = r.mode ?? "sandbox";
  return out;
}
