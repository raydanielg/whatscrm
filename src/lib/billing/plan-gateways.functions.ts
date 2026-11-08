/**
 * Subscription plan ↔ payment gateway links.
 *
 * A plan can be sold through one or more gateways. Each link stores the
 * gateway's own identifiers for that plan (price/product id or a hosted
 * checkout URL) per environment (sandbox/live), so checkout can resolve the
 * right target without hardcoding provider ids in application code.
 *
 * Writes are super-admin only (enforced by RLS on `plan_gateway_prices`).
 * Reads are safe: the table never holds credentials.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

// Keep select() strings opaque to the type-level parser (typecheck perf).
const sel = (s: string): string => s;

const COLS = sel(
  "id, plan_id, provider_id, mode, external_price_id, external_product_id, checkout_url, enabled, notes, updated_at, last_verified_at, verification_status, verification_message, verified_amount_cents, verified_currency, verified_interval",
);

export type PlanGatewayLink = {
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
  last_verified_at: string | null;
  verification_status: string | null;
  verification_message: string | null;
  verified_amount_cents: number | null;
  verified_currency: string | null;
  verified_interval: string | null;
};

const linkInput = z.object({
  id: z.string().uuid().optional(),
  plan_id: z.string().uuid(),
  provider_id: z.string().min(1).max(64),
  mode: z.enum(["sandbox", "live"]).default("sandbox"),
  external_price_id: z.string().max(200).nullable().optional(),
  external_product_id: z.string().max(200).nullable().optional(),
  checkout_url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), "Checkout URL must use https://")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  enabled: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
});

/* -------------------------------------------------------------------------- */
/*  Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** All gateway links, optionally scoped to one plan. */
export const listPlanGatewayLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ plan_id: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase).from("plan_gateway_prices").select(COLS);
    if (data.plan_id) q = q.eq("plan_id", data.plan_id);
    const { data: rows, error } = await q.order("provider_id", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as unknown as PlanGatewayLink[];
  });

/**
 * Resolve which gateway should be used to purchase a plan, honouring the
 * platform/workspace gateway switches and the plan's own links.
 *
 * Returns the chosen link plus every eligible alternative so the UI can offer
 * a gateway picker at checkout.
 */
export const resolvePlanCheckoutTarget = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        plan_code: z.string().min(1),
        workspace_id: z.string().uuid().nullable().optional(),
        provider_id: z.string().min(1).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { resolvePlanGatewayTarget } = await import("./plan-gateways.server");
    return resolvePlanGatewayTarget(context.supabase, {
      plan_code: data.plan_code,
      workspace_id: data.workspace_id ?? null,
      provider_id: data.provider_id ?? null,
    });
  });

/**
 * Active plans plus the gateways that can actually charge them right now.
 * Backs the self-service "Change plan" panel.
 */
export const listPurchasablePlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ workspace_id: z.string().uuid().nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listPurchasablePlanTargets } = await import("./plan-gateways.server");
    return listPurchasablePlanTargets(context.supabase, data.workspace_id ?? null);
  });


/* -------------------------------------------------------------------------- */
/*  Writes (super-admin only via RLS)                                          */
/* -------------------------------------------------------------------------- */

export const upsertPlanGatewayLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => linkInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.external_price_id && !data.checkout_url) {
      throw new Error("Provide either a gateway price/plan id or a hosted checkout URL.");
    }

    // Load the row this write targets (by id, or by the natural key) so we can
    // treat it as "self" during conflict checks and diff it for the audit log.
    const priorCols = sel(
      "id, plan_id, provider_id, mode, external_price_id, external_product_id, checkout_url, enabled",
    );
    let priorQuery = sbAny(context.supabase).from("plan_gateway_prices").select(priorCols);
    priorQuery = data.id
      ? priorQuery.eq("id", data.id)
      : priorQuery
          .eq("plan_id", data.plan_id)
          .eq("provider_id", data.provider_id)
          .eq("mode", data.mode);
    const { data: priorRow } = await priorQuery.maybeSingle();
    const prior = priorRow as PriorLinkRow | null;
    const selfId = data.id ?? prior?.id;

    const { assertNoPlanGatewayConflict } = await import("./plan-gateway-conflicts.server");
    await assertNoPlanGatewayConflict(context.supabase, {
      id: selfId,
      plan_id: data.plan_id,
      provider_id: data.provider_id,
      mode: data.mode,
      external_price_id: data.external_price_id ?? null,
      external_product_id: data.external_product_id ?? null,
      checkout_url: data.checkout_url ?? null,
    });

    const payload = {
      plan_id: data.plan_id,
      provider_id: data.provider_id,
      mode: data.mode,
      external_price_id: data.external_price_id || null,
      external_product_id: data.external_product_id || null,
      checkout_url: data.checkout_url || null,
      enabled: data.enabled,
      notes: data.notes || null,
      updated_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("plan_gateway_prices")
      .upsert(payload, { onConflict: "plan_id,provider_id,mode" })
      .select(COLS)
      .single();
    if (error) throw error;

    const link = row as unknown as PlanGatewayLink;
    await auditPlanLink(context, {
      action: prior ? "gateway.plan_link_updated" : "gateway.plan_linked",
      link,
      prior,
    });
    return link;
  });

export const deletePlanGatewayLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: priorRow } = await context.supabase
      .from("plan_gateway_prices")
      .select(COLS)
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("plan_gateway_prices")
      .delete()
      .eq("id", data.id);
    if (error) throw error;

    if (priorRow) {
      await auditPlanLink(context, {
        action: "gateway.plan_unlinked",
        link: priorRow as unknown as PlanGatewayLink,
        prior: null,
      });
    }
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/*  Audit helpers                                                              */
/* -------------------------------------------------------------------------- */

type PriorLinkRow = {
  id: string;
  plan_id: string;
  provider_id: string;
  mode: "sandbox" | "live";
  external_price_id: string | null;
  external_product_id: string | null;
  checkout_url: string | null;
  enabled: boolean;
};

type AuditContext = {
  supabase: unknown;
  userId: string;
  claims: unknown;
};

/**
 * Write a `platform_audit_logs` entry for a plan ↔ gateway link change.
 * Best-effort: never fails the caller's write.
 */
async function auditPlanLink(
  context: AuditContext,
  args: {
    action: "gateway.plan_linked" | "gateway.plan_link_updated" | "gateway.plan_unlinked";
    link: PlanGatewayLink;
    prior: PriorLinkRow | null;
  },
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: plan } = await sb
      .from("plans")
      .select(sel("code, name"))
      .eq("id", args.link.plan_id)
      .maybeSingle();
    const planCode = (plan as { code?: string } | null)?.code ?? args.link.plan_id;

    const target =
      args.link.external_price_id ?? args.link.checkout_url ?? "(none)";
    const verb =
      args.action === "gateway.plan_unlinked"
        ? "Unlinked"
        : args.action === "gateway.plan_linked"
          ? "Linked"
          : "Updated link for";

    const changes: Record<string, unknown> = {
      plan_id: args.link.plan_id,
      plan_code: planCode,
      provider_id: args.link.provider_id,
      mode: args.link.mode,
      external_price_id: args.link.external_price_id,
      external_product_id: args.link.external_product_id,
      checkout_url: args.link.checkout_url,
      enabled: args.link.enabled,
    };
    if (args.prior) {
      changes["previous"] = {
        external_price_id: args.prior.external_price_id,
        external_product_id: args.prior.external_product_id,
        checkout_url: args.prior.checkout_url,
        enabled: args.prior.enabled,
      };
    }

    const { recordGatewayAudit } = await import("./gateway-audit.server");
    await recordGatewayAudit({
      action: args.action,
      providerId: args.link.provider_id,
      resourceType: "plan_gateway_link",
      resourceId: args.link.id,
      actorId: context.userId,
      actorEmail: (context.claims as { email?: string } | null)?.email ?? null,
      summary: `${verb} plan ${planCode} ↔ ${args.link.provider_id} (${args.link.mode}) → ${target}`,
      changes,
    });
  } catch (error) {
    console.error("[plan-gateways] audit failed", args.action, error);
  }
}

