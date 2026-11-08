/**
 * Payment Gateway management (platform level).
 *
 * Super admins add, configure, enable/disable, pick the default gateway and
 * switch sandbox/live mode. Every money-moving path in the app resolves
 * gateway state through `assertGatewayEnabled`, so a disabled gateway can no
 * longer start checkouts (existing refunds/syncs stay allowed).
 *
 * Credentials are never stored in the database: gateways reference the *name*
 * of a backend secret (env var), which the adapters read at runtime.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  formatGatewayErrors,
  hasGatewayErrors,
  validateGatewayForm,
} from "./gateway-validation";
import { listBillingProviders } from "./providers";
import { sbAny } from "@/lib/supabase/untyped";

// Keep select() strings opaque to the type-level parser (typecheck perf).
const sel = (s: string): string => s;

interface GatewayAuditRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  resource_id: string | null;
  summary: string | null;
  changes: unknown;
  created_at: string;
}

interface GatewayWebhookDeliveryRow {
  id: string;
  provider_id: string;
  provider_event_id: string | null;
  event_type: string | null;
  status: string;
  http_status: number | null;
  latency_ms: number | null;
  signature_verified: boolean | null;
  error_message: string | null;
  request_id: string | null;
  received_at: string;
}

export type GatewaySetting = {
  provider_id: string;
  enabled: boolean;
  is_default: boolean;
  mode: "sandbox" | "live";
  notes: string | null;
  updated_at: string | null;
  display_label: string | null;
  adapter_id: string | null;
  publishable_key: string | null;
  secret_name: string | null;
  webhook_secret_name: string | null;
  webhook_url: string | null;
  supported_methods: string[] | null;
  config: Record<string, string | number | boolean | null> | null;
  is_custom: boolean;
};

const SELECT_COLS =
  "provider_id, enabled, is_default, mode, notes, updated_at, display_label, adapter_id, publishable_key, secret_name, webhook_secret_name, webhook_url, supported_methods, config, is_custom";

/**
 * Message shown when a non-staff account touches gateway credentials.
 * Exported so the UI can detect it and render a dedicated permission notice.
 */
export const GATEWAY_FORBIDDEN_MESSAGE =
  "Forbidden: payment gateway settings and credentials are restricted to platform staff (super admins).";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await sbAny(supabase).rpc("is_super_admin", { _user_id: userId });
  if (error) throw new Error("Unable to verify platform role");
  if (!data) throw new Error(GATEWAY_FORBIDDEN_MESSAGE);
}


/** Actor identity for the audit trail (email comes from the verified token). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function actorEmail(claims: any): string | null {
  return (claims?.email as string | undefined) ?? null;
}

async function audit(input: import("./gateway-audit.server").GatewayAuditInput) {
  const { recordGatewayAudit } = await import("./gateway-audit.server");
  await recordGatewayAudit(input);
}

/**
 * Gateway catalog + persisted configuration, merged.
 *
 * This payload includes credential *pointers* (secret names, publishable keys,
 * webhook URLs, adapter config), so it is platform-staff only. Non-staff
 * surfaces must use `list_payment_gateway_basics` instead.
 */
export const listGateways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const { data, error } = await context.supabase
      .from("payment_gateway_settings")
      .select(SELECT_COLS);
    if (error) throw error;


    const rows = (data ?? []) as unknown as GatewaySetting[];
    const byId = new Map(rows.map((r) => [r.provider_id, r]));
    const catalog = listBillingProviders();
    const known = new Set(catalog.map((p) => p.id));

    const shape = (
      id: string,
      displayName: string,
      supports: Record<string, boolean>,
      s: GatewaySetting | undefined,
      builtIn: boolean,
    ) => ({
      id,
      displayName: s?.display_label?.trim() || displayName,
      supports,
      builtIn,
      adapterId: s?.adapter_id ?? (builtIn ? id : "custom"),
      enabled: s?.enabled ?? false,
      isDefault: s?.is_default ?? false,
      mode: (s?.mode ?? "sandbox") as "sandbox" | "live",
      notes: s?.notes ?? null,
      publishableKey: s?.publishable_key ?? null,
      secretName: s?.secret_name ?? null,
      webhookSecretName: s?.webhook_secret_name ?? null,
      webhookUrl: s?.webhook_url ?? null,
      supportedMethods: s?.supported_methods ?? ["card"],
      config: (s?.config ?? {}) as Record<string, string | number | boolean | null>,
      updatedAt: s?.updated_at ?? null,
      configured: Boolean(s),
    });

    const builtIns = catalog.map((p) =>
      shape(p.id, p.displayName, p.supports as Record<string, boolean>, byId.get(p.id), true),
    );

    const customAdapterSupports =
      (catalog.find((p) => p.id === "custom")?.supports as Record<string, boolean>) ?? {};

    const customs = rows
      .filter((r) => !known.has(r.provider_id))
      .map((r) =>
        shape(
          r.provider_id,
          r.display_label || r.provider_id,
          customAdapterSupports,
          r,
          false,
        ),
      );

    return [...builtIns, ...customs];
  });

/** Enable or disable a gateway platform-wide. */
export const setGatewayEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ provider_id: z.string().min(1), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    if (!data.enabled) {
      const { data: row } = await supabase
        .from("payment_gateway_settings")
        .select("is_default")
        .eq("provider_id", data.provider_id)
        .maybeSingle();
      if (row?.is_default) {
        throw new Error(
          "This is the default gateway. Make another gateway the default before disabling it.",
        );
      }
    }

    const { error } = await supabase
      .from("payment_gateway_settings")
      .upsert(
        {
          provider_id: data.provider_id,
          enabled: data.enabled,
          updated_by: userId,
        } as never,
        { onConflict: "provider_id" },
      );
    if (error) throw error;

    await audit({
      action: data.enabled ? "gateway.enabled" : "gateway.disabled",
      providerId: data.provider_id,
      actorId: userId,
      actorEmail: actorEmail(context.claims),
      summary: `${data.enabled ? "Enabled" : "Disabled"} gateway ${data.provider_id}`,
      changes: { enabled: data.enabled },
    });

    return { ok: true, provider_id: data.provider_id, enabled: data.enabled };
  });

/** Make a gateway the platform default (implies enabling it). */
export const setDefaultGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ provider_id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    // Clear the current default first — a partial unique index enforces one.
    const clear = await supabase
      .from("payment_gateway_settings")
      .update({ is_default: false, updated_by: userId } as never)
      .eq("is_default", true);
    if (clear.error) throw clear.error;

    const { error } = await supabase
      .from("payment_gateway_settings")
      .upsert(
        {
          provider_id: data.provider_id,
          enabled: true,
          is_default: true,
          updated_by: userId,
        } as never,
        { onConflict: "provider_id" },
      );
    if (error) throw error;

    await audit({
      action: "gateway.default_changed",
      providerId: data.provider_id,
      actorId: userId,
      actorEmail: actorEmail(context.claims),
      summary: `Made ${data.provider_id} the platform default gateway`,
      changes: { is_default: true, enabled: true },
    });

    return { ok: true, provider_id: data.provider_id };
  });

/** Switch a gateway between sandbox and live mode. */
export const setGatewayMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ provider_id: z.string().min(1), mode: z.enum(["sandbox", "live"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);
    const { error } = await supabase
      .from("payment_gateway_settings")
      .upsert(
        { provider_id: data.provider_id, mode: data.mode, updated_by: userId } as never,
        { onConflict: "provider_id" },
      );
    if (error) throw error;

    await audit({
      action: "gateway.mode_changed",
      providerId: data.provider_id,
      actorId: userId,
      actorEmail: actorEmail(context.claims),
      summary: `Switched ${data.provider_id} to ${data.mode} mode`,
      changes: { mode: data.mode },
    });

    return { ok: true, provider_id: data.provider_id, mode: data.mode };
  });

const gatewayIdSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores only");

const secretNameSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Secret names must look like MY_SECRET_KEY")
  .max(120)
  .optional()
  .or(z.literal(""));

const upsertSchema = z.object({
  provider_id: gatewayIdSchema,
  /** Only meaningful when creating a brand new (custom) gateway. */
  adapter_id: z.string().min(1).default("custom"),
  display_label: z.string().max(120).optional().or(z.literal("")),
  mode: z.enum(["sandbox", "live"]).default("sandbox"),
  enabled: z.boolean().default(false),
  publishable_key: z.string().max(500).optional().or(z.literal("")),
  secret_name: secretNameSchema,
  webhook_secret_name: secretNameSchema,
  webhook_url: z.string().url().optional().or(z.literal("")),
  supported_methods: z.array(z.string().min(1)).default(["card"]),
  notes: z.string().max(2000).optional().or(z.literal("")),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  is_custom: z.boolean().default(false),
});

export type GatewayUpsertInput = z.input<typeof upsertSchema>;

/**
 * Create a new gateway or update an existing one's configuration.
 * Used by both the "Add gateway" and "Configure" dialogs.
 */
export const upsertGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    // Same rules the configure dialog applies inline — never trust the client.
    const fieldErrors = validateGatewayForm({
      provider_id: data.provider_id,
      display_label: data.display_label ?? "",
      mode: data.mode,
      enabled: data.enabled,
      publishable_key: data.publishable_key ?? "",
      secret_name: data.secret_name ?? "",
      webhook_secret_name: data.webhook_secret_name ?? "",
      webhook_url: data.webhook_url ?? "",
      supported_methods: data.supported_methods,
      notes: data.notes ?? "",
    });
    if (hasGatewayErrors(fieldErrors)) {
      throw new Error(`Invalid gateway configuration — ${formatGatewayErrors(fieldErrors)}`);
    }

    const nullable = (v?: string | null) => (v && v.trim() ? v.trim() : null);


    const { data: existing } = await supabase
      .from("payment_gateway_settings")
      .select("provider_id")
      .eq("provider_id", data.provider_id)
      .maybeSingle();

    const { error } = await supabase
      .from("payment_gateway_settings")
      .upsert(
        {
          provider_id: data.provider_id,
          adapter_id: data.adapter_id,
          display_label: nullable(data.display_label),
          mode: data.mode,
          enabled: data.enabled,
          publishable_key: nullable(data.publishable_key),
          secret_name: nullable(data.secret_name),
          webhook_secret_name: nullable(data.webhook_secret_name),
          webhook_url: nullable(data.webhook_url),
          supported_methods: data.supported_methods.length
            ? data.supported_methods
            : ["card"],
          notes: nullable(data.notes),
          config: data.config,
          is_custom: data.is_custom,
          updated_by: userId,
        } as never,
        { onConflict: "provider_id" },
      );
    if (error) throw error;

    await audit({
      action: existing ? "gateway.updated" : "gateway.created",
      providerId: data.provider_id,
      actorId: userId,
      actorEmail: actorEmail(context.claims),
      summary: `${existing ? "Updated configuration for" : "Added gateway"} ${
        nullable(data.display_label) ?? data.provider_id
      }`,
      changes: {
        adapter_id: data.adapter_id,
        display_label: nullable(data.display_label),
        mode: data.mode,
        enabled: data.enabled,
        publishable_key: nullable(data.publishable_key) ? "[set]" : null,
        secret_name: nullable(data.secret_name),
        webhook_secret_name: nullable(data.webhook_secret_name),
        webhook_url: nullable(data.webhook_url),
        supported_methods: data.supported_methods,
        is_custom: data.is_custom,
      },
    });

    return { ok: true, provider_id: data.provider_id };
  });


/** Remove a custom gateway (built-in adapters can only be disabled). */
export const deleteGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ provider_id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    const { data: row } = await supabase
      .from("payment_gateway_settings")
      .select("is_default, is_custom")
      .eq("provider_id", data.provider_id)
      .maybeSingle();

    if (!row) throw new Error("Gateway not found");
    if (row.is_default) throw new Error("Make another gateway the default before removing this one.");
    if (!row.is_custom) {
      throw new Error("Built-in gateways cannot be removed — disable them instead.");
    }

    const { error } = await supabase
      .from("payment_gateway_settings")
      .delete()
      .eq("provider_id", data.provider_id);
    if (error) throw error;

    await audit({
      action: "gateway.deleted",
      providerId: data.provider_id,
      actorId: userId,
      actorEmail: actorEmail(context.claims),
      summary: `Removed gateway ${data.provider_id}`,
    });

    return { ok: true, provider_id: data.provider_id };
  });

/** Recent platform audit entries for gateway changes (super admins only). */
export const listGatewayAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider_id?: string; limit?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    let query = supabase
      .from("platform_audit_logs")
      .select(sel("id, actor_id, actor_email, action, resource_id, summary, changes, created_at"))
      .in("resource_type", ["payment_gateway", "plan_gateway_link"])
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 100, 500));

    if (data.provider_id) {
      // Gateway rows key on the provider id; plan-link rows key on the link id
      // and carry the provider in `changes`.
      const pid = data.provider_id.replace(/[^A-Za-z0-9_-]/g, "");
      if (pid) query = query.or(`resource_id.eq.${pid},changes->>provider_id.eq.${pid}`);
    }


    const { data: rows, error } = await query.returns<GatewayAuditRow[]>();
    if (error) throw error;

    const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
    const names = new Map<string, { name: string | null; email: string | null }>();
    if (actorIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      for (const p of profiles ?? []) {
        names.set(p.id as string, {
          name: (p as { full_name: string | null }).full_name ?? null,
          email: (p as { email: string | null }).email ?? null,
        });
      }
    }

    return (rows ?? []).map((r) => ({
      id: r.id as string,
      action: r.action as string,
      providerId: (r.resource_id as string | null) ?? null,
      summary: (r.summary as string | null) ?? null,
      changes: (r.changes ?? {}) as Record<string, string | number | boolean | null>,
      createdAt: r.created_at as string,
      actorId: (r.actor_id as string | null) ?? null,
      actorName: (r.actor_id && names.get(r.actor_id as string)?.name) || null,
      actorEmail:
        (r.actor_id && names.get(r.actor_id as string)?.email) ||
        (r.actor_email as string | null) ||
        null,
    }));
  });

/**
 * Webhook delivery health per gateway (super admins only).
 *
 * Returns the last N deliveries plus a rollup (success rate, failures,
 * p50/p95 latency, last delivery time) so the panel can show at a glance
 * whether a gateway's webhooks are healthy.
 */
export const listGatewayWebhookDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider_id?: string; limit?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    const limit = Math.min(Math.max(data.limit ?? 25, 1), 200);

    let query = supabase
      .from("payment_gateway_webhook_deliveries")
      .select(
        sel(
          "id, provider_id, provider_event_id, event_type, status, http_status, latency_ms, signature_verified, error_message, request_id, received_at",
        ),
      )
      .order("received_at", { ascending: false })
      .limit(data.provider_id ? limit : limit * 4);

    if (data.provider_id) query = query.eq("provider_id", data.provider_id);

    const { data: rows, error } = await query.returns<GatewayWebhookDeliveryRow[]>();
    if (error) throw error;

    const deliveries = (rows ?? []).map((r) => ({
      id: r.id as string,
      providerId: r.provider_id as string,
      eventId: (r.provider_event_id as string | null) ?? null,
      eventType: (r.event_type as string | null) ?? null,
      status: r.status as string,
      httpStatus: (r.http_status as number | null) ?? null,
      latencyMs: (r.latency_ms as number | null) ?? null,
      signatureVerified: Boolean(r.signature_verified),
      errorMessage: (r.error_message as string | null) ?? null,
      requestId: (r.request_id as string | null) ?? null,
      receivedAt: r.received_at as string,
    }));

    const byProvider = new Map<string, typeof deliveries>();
    for (const d of deliveries) {
      const list = byProvider.get(d.providerId) ?? [];
      if (list.length < limit) list.push(d);
      byProvider.set(d.providerId, list);
    }

    const percentile = (values: number[], p: number) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
      return sorted[idx] ?? null;
    };

    const summaries = [...byProvider.entries()].map(([providerId, list]) => {
      const ok = list.filter((d) => d.status === "processed" || d.status === "duplicate").length;
      const latencies = list
        .map((d) => d.latencyMs)
        .filter((v): v is number => typeof v === "number");
      return {
        providerId,
        total: list.length,
        succeeded: ok,
        failed: list.length - ok,
        successRate: list.length ? Math.round((ok / list.length) * 100) : null,
        p50LatencyMs: percentile(latencies, 50),
        p95LatencyMs: percentile(latencies, 95),
        lastReceivedAt: list[0]?.receivedAt ?? null,
        lastStatus: list[0]?.status ?? null,
      };
    });

    return {
      deliveries: [...byProvider.values()].flat(),
      summaries,
    };
  });

