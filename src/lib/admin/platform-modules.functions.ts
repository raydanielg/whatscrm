/**
 * Super Admin — Platform module server functions.
 *
 * Backs the Subscriptions, WhatsApp Platform, and AI Providers consoles.
 *
 * Every handler verifies platform-staff role through the caller's own
 * RLS-scoped client BEFORE loading `supabaseAdmin`. The admin client is only
 * used to read/write across tenants once that check passes — it is never used
 * to make the authorization decision itself.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";
import { platformDefaultCurrency } from "@/lib/currency/resolve.server";

/* -------------------------------------------------------------------------- */
/* Shared guards                                                              */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPlatformStaff(
  supabase: any,
  userId: string,
): Promise<"superadmin" | "support"> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  if (!data || data.length === 0) throw new Error("Forbidden: platform staff only");
  return (
    data.some((r: { role: string }) => r.role === "superadmin") ? "superadmin" : "support"
  ) as "superadmin" | "support";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(supabase: any, userId: string) {
  const role = await assertPlatformStaff(supabase, userId);
  if (role !== "superadmin") throw new Error("Forbidden: superadmin role required for this action");
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/* ========================================================================== */
/* Subscriptions                                                              */
/* ========================================================================== */

export type PlatformSubscriptionRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  billing_email: string | null;
  plan_id: string;
  plan_name: string;
  plan_code: string;
  plan_interval: string;
  price_cents: number;
  currency: string;
  status: string;
  seats: number;
  mrr_cents: number;
  provider: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  created_at: string;
};

export type PlatformPlanOption = {
  id: string;
  code: string;
  name: string;
  interval: string;
  price_cents: number;
  currency: string;
  is_active: boolean;
};

function monthlyCents(priceCents: number, interval: string, seats: number): number {
  const per =
    interval === "year" ? Math.round(priceCents / 12) : interval === "lifetime" ? 0 : priceCents;
  return per * Math.max(1, seats);
}

export const getPlatformSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const [subsRes, plansRes] = await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        .select(
          `id, organization_id, plan_id, status, provider, seats, trial_ends_at,
           current_period_start, current_period_end, cancel_at, canceled_at, created_at,
           organizations:organization_id ( name, slug, billing_email ),
           plans:plan_id ( code, name, interval, price_cents, currency )`,
        )
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("plans")
        .select("id, code, name, interval, price_cents, currency, is_active")
        .order("sort_order", { ascending: true }),
    ]);

    if (subsRes.error) throw new Error(subsRes.error.message);
    if (plansRes.error) throw new Error(plansRes.error.message);

    // A subscription whose plan join came back empty still has to be labelled.
    // This listing spans every tenant, so the platform default is the only
    // sensible fallback — resolved once rather than per row.
    const fallbackCurrency = (await platformDefaultCurrency()) ?? "USD";

    const rows: PlatformSubscriptionRow[] = (subsRes.data ?? []).map((r: Record<string, any>) => {
      const org = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations;
      const plan = Array.isArray(r.plans) ? r.plans[0] : r.plans;
      const seats = Number(r.seats ?? 1);
      const priceCents = Number(plan?.price_cents ?? 0);
      const interval = String(plan?.interval ?? "month");
      const status = String(r.status);
      return {
        id: r.id,
        organization_id: r.organization_id,
        organization_name: org?.name ?? "Unknown organization",
        organization_slug: org?.slug ?? "",
        billing_email: org?.billing_email ?? null,
        plan_id: r.plan_id,
        plan_name: plan?.name ?? "—",
        plan_code: plan?.code ?? "—",
        plan_interval: interval,
        price_cents: priceCents,
        currency: plan?.currency ?? fallbackCurrency,
        status,
        seats,
        mrr_cents: status === "active" ? monthlyCents(priceCents, interval, seats) : 0,
        provider: r.provider ?? null,
        trial_ends_at: r.trial_ends_at,
        current_period_start: r.current_period_start,
        current_period_end: r.current_period_end,
        cancel_at: r.cancel_at,
        canceled_at: r.canceled_at,
        created_at: r.created_at,
      };
    });

    const byStatus = (s: string) => rows.filter((r) => r.status === s).length;
    const renewingSoon = rows.filter(
      (r) =>
        r.status === "active" &&
        r.current_period_end &&
        new Date(r.current_period_end).getTime() - Date.now() < 7 * 86_400_000,
    ).length;

    return {
      rows,
      plans: (plansRes.data ?? []) as PlatformPlanOption[],
      kpis: {
        total: rows.length,
        active: byStatus("active"),
        trialing: byStatus("trialing"),
        pastDue: byStatus("past_due"),
        paused: byStatus("paused"),
        canceled: byStatus("canceled"),
        mrrCents: rows.reduce((sum, r) => sum + r.mrr_cents, 0),
        renewingSoon,
      },
    };
  });

const SubscriptionAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("change_plan"), id: z.string().uuid(), planId: z.string().uuid() }),
  z.object({
    action: z.literal("set_seats"),
    id: z.string().uuid(),
    seats: z.number().int().min(1).max(100_000),
  }),
  z.object({
    action: z.literal("cancel"),
    id: z.string().uuid(),
    immediate: z.boolean().default(false),
  }),
  z.object({ action: z.literal("resume"), id: z.string().uuid() }),
  z.object({ action: z.literal("pause"), id: z.string().uuid() }),
  z.object({
    action: z.literal("extend_trial"),
    id: z.string().uuid(),
    days: z.number().int().min(1).max(365),
  }),
]);

export type SubscriptionActionInput = z.infer<typeof SubscriptionAction>;

export const updatePlatformSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SubscriptionActionInput) => SubscriptionAction.parse(input))

  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    switch (data.action) {
      case "change_plan":
        patch.plan_id = data.planId;
        break;
      case "set_seats":
        patch.seats = data.seats;
        break;
      case "cancel":
        if (data.immediate) {
          patch.status = "canceled";
          patch.canceled_at = new Date().toISOString();
          patch.cancel_at = null;
        } else {
          patch.cancel_at = null;
          patch.canceled_at = null;
        }
        break;
      case "resume":
        patch.status = "active";
        patch.cancel_at = null;
        patch.canceled_at = null;
        patch.suspended_at = null;
        break;
      case "pause":
        patch.status = "paused";
        break;
      case "extend_trial":
        patch.status = "trialing";
        patch.trial_ends_at = daysFromNow(data.days);
        break;
    }

    // Cancel-at-period-end needs the current period end, so resolve it first.
    if (data.action === "cancel" && !data.immediate) {
      const { data: current, error: readErr } = await supabaseAdmin
        .from("subscriptions")
        .select("current_period_end")
        .eq("id", data.id)
        .single();
      if (readErr) throw new Error(readErr.message);
      patch.cancel_at = current?.current_period_end ?? daysFromNow(30);
    }

    const { error } = await sbAny(supabaseAdmin)
      .from("subscriptions")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const, action: data.action };
  });

/* ========================================================================== */
/* WhatsApp platform                                                          */
/* ========================================================================== */

export type WhatsAppAccountRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  display_name: string | null;
  phone_number: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  business_id: string | null;
  status: string;
  status_reason: string | null;
  provider: string;
  has_access_token: boolean;
  has_app_secret: boolean;
  has_verify_token: boolean;
  webhook_signature_algo: string | null;
  last_verified_at: string | null;
  created_at: string;
  templates: { total: number; approved: number; pending: number; rejected: number };
};

export type WhatsAppQrSessionRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  status: string;
  phone_number: string | null;
  display_name: string | null;
  device_platform: string | null;
  error_message: string | null;
  last_seen_at: string | null;
  connected_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export const getWhatsAppPlatform = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const since24h = new Date(Date.now() - 86_400_000).toISOString();

    const [accountsRes, templatesRes, sessionsRes, outboxRes, workspacesRes] = await Promise.all([
      supabaseAdmin
        .from("channel_accounts")
        .select(
          `id, workspace_id, display_name, phone_number, phone_number_id, waba_id, business_id,
           status, status_reason, provider, access_token_secret_name, app_secret_name, verify_token,
           webhook_signature_algo, last_verified_at, created_at`,
        )
        .in("provider", ["whatsapp_cloud", "dialog360", "twilio"])
        .order("created_at", { ascending: false })
        .limit(300),
      sbAny(supabaseAdmin).from("wa_templates").select("channel_account_id, status").limit(5000),
      supabaseAdmin
        .from("whatsapp_qr_sessions")
        .select(
          `id, workspace_id, status, phone_number, display_name, device_platform, error_message,
           last_seen_at, connected_at, expires_at, created_at`,
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("message_outbox")
        .select("status, created_at")
        .eq("provider", "whatsapp_cloud")
        .gte("created_at", since24h)
        .limit(10_000),
      sbAny(supabaseAdmin).from("workspaces").select("id, name").limit(2000),
    ]);

    if (accountsRes.error) throw new Error(accountsRes.error.message);
    if (sessionsRes.error) throw new Error(sessionsRes.error.message);

    const wsName = new Map<string, string>(
      ((workspacesRes.data ?? []) as Array<{ id: string; name: string }>).map((w) => [
        w.id,
        w.name,
      ]),
    );

    const tplByAccount = new Map<
      string,
      { total: number; approved: number; pending: number; rejected: number }
    >();
    for (const t of (templatesRes.data ?? []) as Array<{
      channel_account_id: string | null;
      status: string;
    }>) {
      if (!t.channel_account_id) continue;
      const entry = tplByAccount.get(t.channel_account_id) ?? {
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
      };
      entry.total += 1;
      if (t.status === "approved") entry.approved += 1;
      else if (t.status === "pending") entry.pending += 1;
      else if (t.status === "rejected") entry.rejected += 1;
      tplByAccount.set(t.channel_account_id, entry);
    }

    const accounts: WhatsAppAccountRow[] = (accountsRes.data ?? []).map(
      (a: Record<string, any>) => ({
        id: a.id,
        workspace_id: a.workspace_id,
        workspace_name: wsName.get(a.workspace_id) ?? "—",
        display_name: a.display_name,
        phone_number: a.phone_number,
        phone_number_id: a.phone_number_id,
        waba_id: a.waba_id,
        business_id: a.business_id,
        status: a.status,
        status_reason: a.status_reason,
        provider: a.provider,
        // Secrets are never returned — only whether they are configured.
        has_access_token: Boolean(a.access_token_secret_name),
        has_app_secret: Boolean(a.app_secret_name),
        has_verify_token: Boolean(a.verify_token),
        webhook_signature_algo: a.webhook_signature_algo,
        last_verified_at: a.last_verified_at,
        created_at: a.created_at,
        templates: tplByAccount.get(a.id) ?? { total: 0, approved: 0, pending: 0, rejected: 0 },
      }),
    );

    const sessions: WhatsAppQrSessionRow[] = (sessionsRes.data ?? []).map(
      (s: Record<string, any>) => ({
        id: s.id,
        workspace_id: s.workspace_id,
        workspace_name: wsName.get(s.workspace_id) ?? "—",
        status: s.status,
        phone_number: s.phone_number,
        display_name: s.display_name,
        device_platform: s.device_platform,
        error_message: s.error_message,
        last_seen_at: s.last_seen_at,
        connected_at: s.connected_at,
        expires_at: s.expires_at,
        created_at: s.created_at,
      }),
    );

    const outbox = (outboxRes.data ?? []) as Array<{ status: string }>;
    const sent = outbox.filter((m) => ["sent", "delivered", "read"].includes(m.status)).length;
    const failed = outbox.filter((m) => m.status === "failed").length;
    const queued = outbox.filter((m) =>
      ["queued", "pending", "processing"].includes(m.status),
    ).length;

    const templateTotals = accounts.reduce(
      (acc, a) => ({
        total: acc.total + a.templates.total,
        approved: acc.approved + a.templates.approved,
        pending: acc.pending + a.templates.pending,
        rejected: acc.rejected + a.templates.rejected,
      }),
      { total: 0, approved: 0, pending: 0, rejected: 0 },
    );

    return {
      accounts,
      sessions,
      kpis: {
        accounts: accounts.length,
        connected: accounts.filter((a) => a.status === "connected").length,
        degraded: accounts.filter((a) => a.status === "error" || a.status === "suspended").length,
        pending: accounts.filter((a) => a.status === "pending").length,
        misconfigured: accounts.filter((a) => !a.has_access_token || !a.has_verify_token).length,
        liveSessions: sessions.filter((s) => s.status === "connected").length,
        templates: templateTotals,
        delivery24h: { sent, failed, queued, total: outbox.length },
      },
      generatedAt: new Date().toISOString(),
    };
  });

/* ========================================================================== */
/* AI providers                                                               */
/* ========================================================================== */

export type AiProviderRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  name: string;
  kind: string;
  base_url: string | null;
  enabled: boolean;
  is_default: boolean;
  priority: number;
  has_api_key: boolean;
  /** Name of the backend secret holding the key — never the value itself. */
  api_key_secret_name: string | null;
  organization_id: string | null;
  created_at: string;
  health: {
    status: string;
    latency_ms: number | null;
    last_check_at: string | null;
    last_error: string | null;
    consecutive_failures: number;
  } | null;
  models: Array<{
    id: string;
    model_id: string;
    display_name: string;
    enabled: boolean;
    is_default: boolean;
  }>;
  usage30d: { requests: number; tokens: number; costUsd: number; errors: number };
};

// POST, not GET: a GET server function is a plain HTTP GET the browser can
// serve from its own disk/back-forward cache. After a delete + invalidate,
// React Query issues a genuinely fresh `fetch()`, but the browser was
// returning its last cached 200 for the identical URL — the provider list
// never visibly updated even though the DELETE had already landed in
// Postgres. Sibling list endpoints in ai-providers.functions.ts already use
// POST for exactly this reason.
export const getAiProviderRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

    const [provRes, modelRes, healthRes, usageRes, workspacesRes] = await Promise.all([
      supabaseAdmin
        .from("ai_providers")
        .select(
          "id, workspace_id, name, kind, base_url, enabled, is_default, priority, api_key_secret_name, organization_id, created_at",
        )
        .order("priority", { ascending: true })
        .limit(500),
      supabaseAdmin
        .from("ai_models")
        .select("id, provider_id, model_id, display_name, enabled, is_default, sort_order")
        .order("sort_order", { ascending: true })
        .limit(2000),
      supabaseAdmin
        .from("ai_provider_health")
        .select("provider_id, status, latency_ms, last_check_at, last_error, consecutive_failures"),
      supabaseAdmin
        .from("ai_usage_daily")
        .select("provider_id, requests, total_tokens, cost_usd, errors")
        .gte("day", since)
        .limit(20_000),
      sbAny(supabaseAdmin).from("workspaces").select("id, name").limit(2000),
    ]);

    if (provRes.error) throw new Error(provRes.error.message);

    const wsName = new Map<string, string>(
      ((workspacesRes.data ?? []) as Array<{ id: string; name: string }>).map((w) => [
        w.id,
        w.name,
      ]),
    );

    const modelsByProvider = new Map<string, AiProviderRow["models"]>();
    for (const m of (modelRes.data ?? []) as Array<Record<string, any>>) {
      const list = modelsByProvider.get(m.provider_id) ?? [];
      list.push({
        id: m.id,
        model_id: m.model_id,
        display_name: m.display_name,
        enabled: m.enabled,
        is_default: m.is_default,
      });
      modelsByProvider.set(m.provider_id, list);
    }

    const healthByProvider = new Map<string, AiProviderRow["health"]>();
    for (const h of (healthRes.data ?? []) as Array<Record<string, any>>) {
      healthByProvider.set(h.provider_id, {
        status: h.status,
        latency_ms: h.latency_ms,
        last_check_at: h.last_check_at,
        last_error: h.last_error,
        consecutive_failures: h.consecutive_failures ?? 0,
      });
    }

    const usageByProvider = new Map<string, AiProviderRow["usage30d"]>();
    for (const u of (usageRes.data ?? []) as Array<Record<string, any>>) {
      if (!u.provider_id) continue;
      const entry = usageByProvider.get(u.provider_id) ?? {
        requests: 0,
        tokens: 0,
        costUsd: 0,
        errors: 0,
      };
      entry.requests += Number(u.requests ?? 0);
      entry.tokens += Number(u.total_tokens ?? 0);
      entry.costUsd += Number(u.cost_usd ?? 0);
      entry.errors += Number(u.errors ?? 0);
      usageByProvider.set(u.provider_id, entry);
    }

    const providers: AiProviderRow[] = (provRes.data ?? []).map((p: Record<string, any>) => ({
      id: p.id,
      workspace_id: p.workspace_id,
      workspace_name: wsName.get(p.workspace_id) ?? "—",
      name: p.name,
      kind: p.kind,
      base_url: p.base_url,
      enabled: p.enabled,
      is_default: p.is_default,
      priority: p.priority,
      // Only the presence of a credential is exposed, never the secret name's value.
      has_api_key: Boolean(p.api_key_secret_name),
      api_key_secret_name: p.api_key_secret_name ?? null,
      organization_id: p.organization_id ?? null,
      created_at: p.created_at,
      health: healthByProvider.get(p.id) ?? null,
      models: modelsByProvider.get(p.id) ?? [],
      usage30d: usageByProvider.get(p.id) ?? { requests: 0, tokens: 0, costUsd: 0, errors: 0 },
    }));

    const totals = providers.reduce(
      (acc, p) => ({
        requests: acc.requests + p.usage30d.requests,
        tokens: acc.tokens + p.usage30d.tokens,
        costUsd: acc.costUsd + p.usage30d.costUsd,
        errors: acc.errors + p.usage30d.errors,
      }),
      { requests: 0, tokens: 0, costUsd: 0, errors: 0 },
    );

    const byKind = new Map<string, number>();
    for (const p of providers) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);

    return {
      providers,
      kpis: {
        total: providers.length,
        enabled: providers.filter((p) => p.enabled).length,
        unhealthy: providers.filter(
          (p) => p.health && p.health.status !== "healthy" && p.health.status !== "ok",
        ).length,
        missingKey: providers.filter(
          (p) => !p.has_api_key && p.kind !== "lovable" && p.kind !== "ollama",
        ).length,
        models: providers.reduce((n, p) => n + p.models.length, 0),
        usage30d: totals,
        kinds: [...byKind.entries()]
          .map(([kind, count]) => ({ kind, count }))
          .sort((a, b) => b.count - a.count),
      },
    };
  });

const AiProviderState = z
  .object({
    id: z.string().uuid(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(1).max(1000).optional(),
  })
  .refine((o) => o.enabled !== undefined || o.priority !== undefined, {
    message: "Nothing to update",
  });

export type AiProviderStateInput = z.infer<typeof AiProviderState>;

export const setAiProviderState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: AiProviderStateInput) => AiProviderState.parse(input))

  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.priority !== undefined) patch.priority = data.priority;

    const { error } = await sbAny(supabaseAdmin)
      .from("ai_providers")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
