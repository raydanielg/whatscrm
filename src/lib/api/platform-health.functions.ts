/**
 * Integration Platform health server function.
 * Aggregates production-readiness signals across API, OAuth, webhooks, and integrations.
 * Read-only, per-workspace, scoped by RLS via requireSupabaseAuth.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

export type PlatformHealth = {
  window_hours: 24;
  api: {
    total: number;
    success: number;
    errors_4xx: number;
    errors_5xx: number;
    success_rate: number;
    avg_latency_ms: number;
    rate_limit_hits: number;
  };
  webhooks: {
    endpoints: number;
    active_endpoints: number;
    deliveries: number;
    delivered: number;
    failed: number;
    pending: number;
    delivery_rate: number;
  };
  oauth: {
    clients: number;
    active_tokens: number;
    codes_last_24h: number;
  };
  keys: {
    total: number;
    active: number;
    expiring_soon: number;
    revoked: number;
  };
  integrations: {
    installed: number;
    available: number;
  };
  status: "operational" | "degraded" | "down";
  checked_at: string;
};

async function firstWorkspaceId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return (data?.workspace_id as string) ?? null;
}

export const getPlatformHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformHealth> => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const soon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const workspaceId = await firstWorkspaceId(supabase, userId);

    // API gateway
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gwQ: any = supabase
      .from("api_gateway_logs")
      .select("status_code, latency_ms, rate_limited")
      .gte("created_at", since);
    if (workspaceId) gwQ.eq("workspace_id", workspaceId);
    const { data: gw } = await gwQ;
    const rows = (gw ?? []) as Array<{ status_code: number | null; latency_ms: number | null; rate_limited: boolean | null }>;
    const total = rows.length;
    let s = 0, e4 = 0, e5 = 0, rl = 0, latSum = 0, latN = 0;
    for (const r of rows) {
      const c = r.status_code ?? 0;
      if (c >= 200 && c < 400) s++;
      else if (c >= 400 && c < 500) e4++;
      else if (c >= 500) e5++;
      if (r.rate_limited) rl++;
      if (typeof r.latency_ms === "number") { latSum += r.latency_ms; latN++; }
    }
    const successRate = total ? s / total : 1;
    const avgLatency = latN ? Math.round(latSum / latN) : 0;

    // Webhooks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const epQ: any = sbAny(supabase).from("webhook_endpoints").select("id, is_active", { count: "exact", head: false });
    if (workspaceId) epQ.eq("workspace_id", workspaceId);
    const { data: eps } = await epQ;
    const epRows = (eps ?? []) as Array<{ id: string; is_active: boolean | null }>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delQ: any = supabase
      .from("webhook_deliveries")
      .select("status")
      .gte("created_at", since);
    if (workspaceId) delQ.eq("workspace_id", workspaceId);
    const { data: dels } = await delQ;
    const delRows = (dels ?? []) as Array<{ status: string | null }>;
    const delivered = delRows.filter((d) => d.status === "delivered" || d.status === "success").length;
    const failed = delRows.filter((d) => d.status === "failed").length;
    const pending = delRows.filter((d) => d.status === "pending" || d.status === "retrying").length;
    const delRate = delRows.length ? delivered / delRows.length : 1;

    // OAuth
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientsQ: any = sbAny(supabase).from("oauth_clients").select("id");
    if (workspaceId) clientsQ.eq("workspace_id", workspaceId);
    const { data: clients } = await clientsQ;

    const { data: tokens } = await supabase
      .from("oauth_access_tokens")
      .select("id")
      .gte("expires_at", new Date().toISOString())
      .limit(1000);

    const { data: codes } = await supabase
      .from("oauth_authorization_codes")
      .select("id")
      .gte("created_at", since)
      .limit(1000);

    // API keys
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keysQ: any = sbAny(supabase).from("api_keys").select("id, revoked_at, expires_at");
    if (workspaceId) keysQ.eq("workspace_id", workspaceId);
    const { data: keys } = await keysQ;
    const keyRows = (keys ?? []) as Array<{ revoked_at: string | null; expires_at: string | null }>;
    const active = keyRows.filter((k) => !k.revoked_at).length;
    const revoked = keyRows.filter((k) => !!k.revoked_at).length;
    const expiringSoon = keyRows.filter((k) => !k.revoked_at && k.expires_at && k.expires_at < soon).length;

    // Integrations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instQ: any = sbAny(supabase).from("marketplace_installations").select("id");
    if (workspaceId) instQ.eq("workspace_id", workspaceId);
    const { data: insts } = await instQ;
    const { count: avail } = await supabase
      .from("marketplace_integrations")
      .select("id", { count: "exact", head: true });

    // Status derivation
    let status: PlatformHealth["status"] = "operational";
    if (successRate < 0.95 || delRate < 0.9) status = "degraded";
    if (successRate < 0.8 || delRate < 0.6) status = "down";

    return {
      window_hours: 24,
      api: {
        total,
        success: s,
        errors_4xx: e4,
        errors_5xx: e5,
        success_rate: successRate,
        avg_latency_ms: avgLatency,
        rate_limit_hits: rl,
      },
      webhooks: {
        endpoints: epRows.length,
        active_endpoints: epRows.filter((e) => e.is_active).length,
        deliveries: delRows.length,
        delivered,
        failed,
        pending,
        delivery_rate: delRate,
      },
      oauth: {
        clients: (clients ?? []).length,
        active_tokens: (tokens ?? []).length,
        codes_last_24h: (codes ?? []).length,
      },
      keys: {
        total: keyRows.length,
        active,
        expiring_soon: expiringSoon,
        revoked,
      },
      integrations: {
        installed: (insts ?? []).length,
        available: avail ?? 0,
      },
      status,
      checked_at: new Date().toISOString(),
    };
  });
