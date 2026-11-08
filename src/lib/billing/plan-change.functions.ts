/**
 * Upgrade / downgrade server functions (preview → checkout → confirm).
 * Thin wrappers: all logic lives in `plan-change.server.ts`.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOrgAdmin(supabase: any, org_id: string, user_id: string) {
  const { data, error } = await sbAny(supabase).rpc("has_org_role", {
    _org_id: org_id,
    _user_id: user_id,
    _roles: ["owner", "admin"],
  });
  if (error) throw error;
  if (!data) throw new Error("forbidden");
}

/** What happens if I switch to this plan? (price delta, entitlements, checkout) */
export const previewPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        plan_code: z.string().min(1),
        workspace_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organization_id, context.userId);
    const { buildPlanChangePreview } = await import("./plan-change.server");
    return buildPlanChangePreview(context.supabase, {
      organization_id: data.organization_id,
      plan_code: data.plan_code,
      workspace_id: data.workspace_id ?? null,
    });
  });

/** Begin the change: apply locally, schedule for renewal, or open checkout. */
export const beginPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        plan_code: z.string().min(1),
        workspace_id: z.string().uuid().nullable().optional(),
        at_period_end: z.boolean().optional(),
        return_url: z.string().url(),
        cancel_url: z.string().url(),
        coupon_code: z.string().max(64).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organization_id, context.userId);
    const { startPlanChange } = await import("./plan-change.server");
    return startPlanChange(context.supabase, {
      organization_id: data.organization_id,
      plan_code: data.plan_code,
      workspace_id: data.workspace_id ?? null,
      at_period_end: data.at_period_end ?? undefined,
      return_url: data.return_url,
      cancel_url: data.cancel_url,
      coupon_code: data.coupon_code,
      actor_user_id: context.userId,
    });
  });

/** Called when the browser comes back from the gateway. Polls to confirmation. */
export const finalizePlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        intent_id: z.string().min(4),
        canceled: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.organization_id, context.userId);
    const { confirmPlanChange } = await import("./plan-change.server");
    return confirmPlanChange(context.supabase, {
      organization_id: data.organization_id,
      intent_id: data.intent_id,
      canceled: data.canceled ?? false,
      actor_user_id: context.userId,
    });
  });

/**
 * Super admin only: apply a plan to an organization after an offline payment
 * ("mark as paid"). Records `plan.manual_applied` — never a payment event.
 */
export const adminApplyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        plan_id: z.string().uuid(),
        note: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Authorize with the caller's own client BEFORE loading the service-role client.
    const { assertSuperAdmin } = await import("@/lib/admin/platform-guard.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { adminApplyPlanManually } = await import("./plan-change.server");
    return adminApplyPlanManually(supabaseAdmin, {
      organization_id: data.organization_id,
      plan_id: data.plan_id,
      actor_user_id: context.userId,
      note: data.note ?? null,
    });
  });
