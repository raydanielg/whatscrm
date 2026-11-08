import { sbAny } from "@/lib/supabase/untyped";
import { resolveOrganizationCurrency } from "@/lib/currency/resolve.server";
/**
 * Upgrade / downgrade flow.
 *
 * A plan change is modelled as an *intent* stored on
 * `subscriptions.metadata.pending_change` (plus an audit row in
 * `billing_events`). Three phases:
 *
 *   preview  -> direction, proration estimate, whether checkout is required
 *   start    -> either apply the change locally, schedule it for period end,
 *               or hand the user to the gateway checkout page
 *   confirm  -> called when the user returns from checkout; resolves once the
 *               gateway webhook has moved the subscription onto the new plan
 *               (or applies it directly for local/manual billing modes)
 */

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  tier: string;
  price_cents: number;
  currency: string;
  interval: string;
  trial_days: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  features: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  limits: Record<string, any>;
};

export type PlanChangeDirection = "upgrade" | "downgrade" | "lateral" | "same";

export type PendingChange = {
  intent_id: string;
  plan_code: string;
  plan_id: string;
  direction: PlanChangeDirection;
  at_period_end: boolean;
  requires_checkout: boolean;
  provider: string | null;
  created_at: string;
};

const DAY = 86_400_000;

/** Normalised monthly price so month/year plans can be compared. */
function monthlyCents(plan: Pick<PlanRow, "price_cents" | "interval">) {
  if (plan.interval === "year") return Math.round(plan.price_cents / 12);
  if (plan.interval === "lifetime") return plan.price_cents;
  return plan.price_cents;
}

export function directionFor(current: PlanRow | null, target: PlanRow): PlanChangeDirection {
  if (!current) return "upgrade";
  if (current.code === target.code) return "same";
  const a = monthlyCents(current);
  const b = monthlyCents(target);
  if (b > a) return "upgrade";
  if (b < a) return "downgrade";
  return "lateral";
}

/* -------------------------------------------------------------------------- */
/*  Preview                                                                    */
/* -------------------------------------------------------------------------- */

export type PlanChangePreview = {
  direction: PlanChangeDirection;
  current_plan: PlanRow | null;
  target_plan: PlanRow;
  status: string | null;
  /** Unused value of the current period, credited against an upgrade. */
  proration_credit_cents: number;
  /** What the gateway will charge today (0 for downgrades / scheduled changes). */
  amount_due_now_cents: number;
  currency: string;
  requires_checkout: boolean;
  checkout_provider: string | null;
  /** Suggested timing: upgrades now, downgrades at renewal. */
  recommended_at_period_end: boolean;
  effective_date: string | null;
  /** Entitlements gained / lost by the switch. */
  gains: string[];
  losses: string[];
  blocked_reason: string | null;
};

function limitLabel(key: string, value: unknown) {
  const label = key.replace(/_/g, " ");
  if (value === -1) return `Unlimited ${label}`;
  if (typeof value === "number") return `${value.toLocaleString()} ${label}`;
  return `${label}: ${String(value)}`;
}

function diffEntitlements(current: PlanRow | null, target: PlanRow) {
  const gains: string[] = [];
  const losses: string[] = [];
  const cl = (current?.limits ?? {}) as Record<string, unknown>;
  const tl = (target.limits ?? {}) as Record<string, unknown>;
  for (const key of new Set([...Object.keys(cl), ...Object.keys(tl)])) {
    const rawTarget = tl[key];
    const rawCurrent = cl[key];
    const a = Number(rawCurrent ?? 0);
    const b = Number(rawTarget ?? 0);
    if (Number.isNaN(a) || Number.isNaN(b) || a === b) continue;
    const better = b === -1 || (a !== -1 && b > a);
    // A limit the target plan doesn't define at all reads better as
    // "down from X" than as "undefined".
    const label =
      rawTarget === undefined || rawTarget === null
        ? `${key.replace(/_/g, " ")} (was ${limitLabel(key, rawCurrent)})`
        : limitLabel(key, rawTarget);
    (better ? gains : losses).push(label);
  }

  const cf = (current?.features ?? {}) as Record<string, unknown>;
  const tf = (target.features ?? {}) as Record<string, unknown>;
  for (const key of new Set([...Object.keys(cf), ...Object.keys(tf)])) {
    const a = Boolean(cf[key]);
    const b = Boolean(tf[key]);
    if (a === b) continue;
    (b ? gains : losses).push(key.replace(/_/g, " "));
  }
  return { gains: gains.slice(0, 8), losses: losses.slice(0, 8) };
}

export async function buildPlanChangePreview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: { organization_id: string; plan_code: string; workspace_id?: string | null },
): Promise<PlanChangePreview> {
  const { data: target } = await supabase
    .from("plans")
    .select("id, code, name, tier, price_cents, currency, interval, trial_days, features, limits")
    .eq("code", args.plan_code)
    .eq("is_active", true)
    .maybeSingle();
  if (!target) throw new Error("plan_not_found");

  const { data: sub } = await supabase
    .from("subscriptions")
    .select(
      "status, current_period_start, current_period_end, plan:plans!plan_id(id, code, name, tier, price_cents, currency, interval, trial_days, features, limits)",
    )
    .eq("organization_id", args.organization_id)
    .maybeSingle();

  const current = (sub?.plan ?? null) as PlanRow | null;
  const direction = directionFor(current, target as PlanRow);

  // Unused portion of the current paid period.
  let credit = 0;
  if (current && current.price_cents > 0 && sub?.current_period_start && sub?.current_period_end) {
    const start = new Date(sub.current_period_start).getTime();
    const end = new Date(sub.current_period_end).getTime();
    const now = Date.now();
    if (end > start && end > now) {
      credit = Math.round(current.price_cents * Math.min(1, (end - now) / (end - start)));
    }
  }

  // Is there an enabled gateway that can sell this plan?
  let requiresCheckout = false;
  let checkoutProvider: string | null = null;
  let blocked: string | null = null;
  if (target.price_cents > 0 && direction !== "same") {
    try {
      const { resolveCheckoutTarget } = await import("./checkout.server");
      const resolved = await resolveCheckoutTarget(supabase, {
        plan_code: target.code,
        workspace_id: args.workspace_id ?? null,
      });
      if (resolved.selected) {
        requiresCheckout = true;
        checkoutProvider = resolved.selected.provider_id as string;
      } else {
        // No gateway link — local/manual billing mode, change applies directly.
        checkoutProvider = null;
      }
    } catch (err) {
      blocked = (err as Error).message;
    }
  }

  const recommendedAtPeriodEnd = direction === "downgrade" && Boolean(sub?.current_period_end);
  const amountDue =
    requiresCheckout && !recommendedAtPeriodEnd
      ? Math.max(0, target.price_cents - (direction === "upgrade" ? credit : 0))
      : 0;

  const { gains, losses } = diffEntitlements(current, target as PlanRow);

  return {
    direction,
    current_plan: current,
    target_plan: target as PlanRow,
    status: sub?.status ?? null,
    proration_credit_cents: direction === "upgrade" ? credit : 0,
    amount_due_now_cents: amountDue,
    currency: target.currency ?? (await resolveOrganizationCurrency(args.organization_id)),
    requires_checkout: requiresCheckout,
    checkout_provider: checkoutProvider,
    recommended_at_period_end: recommendedAtPeriodEnd,
    effective_date: recommendedAtPeriodEnd
      ? (sub?.current_period_end ?? null)
      : new Date().toISOString(),
    gains,
    losses,
    blocked_reason: blocked,
  };
}

/* -------------------------------------------------------------------------- */
/*  Apply                                                                      */
/* -------------------------------------------------------------------------- */

/** Move the org onto `plan` now, refreshing the entitlement period. */
export async function applyPlanEntitlement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organization_id: string,
  plan: Pick<PlanRow, "id" | "interval">,
  metadata: Record<string, unknown> = {},
) {
  const now = new Date();
  const periodEnd =
    plan.interval === "year"
      ? new Date(now.getTime() + 365 * DAY)
      : plan.interval === "lifetime"
        ? null
        : new Date(now.getTime() + 30 * DAY);

  const { data, error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        organization_id,
        plan_id: plan.id,
        status: "active" as const,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd?.toISOString() ?? null,
        cancel_at: null,
        canceled_at: null,
        metadata,
      },
      { onConflict: "organization_id" },
    )
    .select("*, plan:plans!plan_id(*)")
    .single();
  if (error) throw error;
  return data;
}

async function readPending(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organization_id: string,
): Promise<{ sub: any; pending: PendingChange | null; metadata: Record<string, unknown> }> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*, plan:plans!plan_id(id, code, name, interval, price_cents, currency)")
    .eq("organization_id", organization_id)
    .maybeSingle();
  const metadata = ((sub?.metadata as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  return { sub, pending: (metadata["pending_change"] as PendingChange) ?? null, metadata };
}

/* -------------------------------------------------------------------------- */
/*  Start                                                                      */
/* -------------------------------------------------------------------------- */

export type StartPlanChangeResult =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { mode: "applied"; intent_id: string; subscription: any }
  | { mode: "scheduled"; intent_id: string; effective_date: string | null }
  | { mode: "checkout"; intent_id: string; url: string; provider: string };

/**
 * Shown to tenants when a paid plan can't be bought online (no gateway) and
 * has to be activated by the platform team after an offline payment.
 */
export const PAYMENT_REQUIRED_MESSAGE =
  "Contact the platform administrator to activate this paid plan.";

/** Manual (no-gateway) paid plan changes require a platform super admin. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertManualPaidChangeAllowed(supabase: any, actorUserId: string | undefined) {
  if (!actorUserId) throw new Error(PAYMENT_REQUIRED_MESSAGE);
  const { assertSuperAdmin } = await import("@/lib/admin/platform-guard.server");
  try {
    await assertSuperAdmin(supabase, actorUserId);
  } catch {
    throw new Error(PAYMENT_REQUIRED_MESSAGE);
  }
}

export async function startPlanChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: {
    organization_id: string;
    plan_code: string;
    workspace_id?: string | null;
    at_period_end?: boolean;
    return_url: string;
    cancel_url: string;
    coupon_code?: string | undefined;
    /** Authenticated caller; required to authorize unpaid paid-plan changes. */
    actor_user_id?: string;
  },
): Promise<StartPlanChangeResult> {
  const preview = await buildPlanChangePreview(supabase, {
    organization_id: args.organization_id,
    plan_code: args.plan_code,
    workspace_id: args.workspace_id ?? null,
  });
  if (preview.direction === "same") throw new Error("already_on_plan");
  if (preview.blocked_reason) throw new Error(preview.blocked_reason);

  const atPeriodEnd = args.at_period_end ?? preview.recommended_at_period_end;
  const intent_id =
    globalThis.crypto?.randomUUID?.() ??
    `intent_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const { sub, metadata } = await readPending(supabase, args.organization_id);
  const pending: PendingChange = {
    intent_id,
    plan_code: preview.target_plan.code,
    plan_id: preview.target_plan.id,
    direction: preview.direction,
    at_period_end: atPeriodEnd,
    requires_checkout: preview.requires_checkout && !atPeriodEnd,
    provider: preview.checkout_provider,
    created_at: new Date().toISOString(),
  };

  await (
    await import("./checkout.server")
  ).insertBillingEvent(supabase, {
    organization_id: args.organization_id,
    provider: preview.checkout_provider ?? "manual",
    event_type: "plan_change.intent",
    payload: {
      intent_id,
      from: preview.current_plan?.code ?? null,
      to: preview.target_plan.code,
      direction: preview.direction,
      at_period_end: atPeriodEnd,
      amount_due_now_cents: preview.amount_due_now_cents,
    },
  });

  // Scheduled change (typical downgrade): keep entitlement until renewal.
  if (atPeriodEnd && sub) {
    await supabase
      .from("subscriptions")
      .update({
        metadata: { ...metadata, pending_change: pending, pending_plan_id: preview.target_plan.id },
      })
      .eq("organization_id", args.organization_id);
    return { mode: "scheduled", intent_id, effective_date: sub.current_period_end ?? null };
  }

  // Paid change through a connected gateway -> hosted checkout.
  if (pending.requires_checkout) {
    if (sub) {
      await supabase
        .from("subscriptions")
        .update({ metadata: { ...metadata, pending_change: pending } })
        .eq("organization_id", args.organization_id);
    }
    const { createGatewayCheckout } = await import("./checkout.server");
    const successUrl = new URL(args.return_url);
    successUrl.searchParams.set("checkout", "success");
    successUrl.searchParams.set("intent", intent_id);
    const cancelUrl = new URL(args.cancel_url);
    cancelUrl.searchParams.set("checkout", "cancel");
    cancelUrl.searchParams.set("intent", intent_id);

    const session = await createGatewayCheckout(supabase, {
      organization_id: args.organization_id,
      plan_code: preview.target_plan.code,
      workspace_id: args.workspace_id ?? null,
      provider: preview.checkout_provider,
      coupon_code: args.coupon_code,
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      metadata: { intent_id, direction: preview.direction },
    });
    return { mode: "checkout", intent_id, url: session.url, provider: String(session.provider) };
  }

  // Free plan / local billing mode -> apply immediately.
  // SECURITY: with no gateway, a paid plan would be granted without payment.
  // Only platform super admins may apply a paid plan this way.
  if (Number(preview.target_plan.price_cents ?? 0) > 0) {
    await assertManualPaidChangeAllowed(supabase, args.actor_user_id);
  }
  const row = await applyPlanEntitlement(supabase, args.organization_id, preview.target_plan, {
    ...metadata,
    pending_change: null,
    last_change: {
      intent_id,
      to: preview.target_plan.code,
      direction: preview.direction,
      at: new Date().toISOString(),
    },
  });
  await (
    await import("./checkout.server")
  ).insertBillingEvent(supabase, {
    organization_id: args.organization_id,
    provider: "manual",
    event_type: "plan_change.completed",
    payload: { intent_id, to: preview.target_plan.code, direction: preview.direction },
  });
  return { mode: "applied", intent_id, subscription: row };
}

/* -------------------------------------------------------------------------- */
/*  Confirm (return from checkout)                                             */
/* -------------------------------------------------------------------------- */

export type ConfirmPlanChangeResult = {
  status: "confirmed" | "pending" | "canceled" | "unknown";
  plan_code: string | null;
  plan_name: string | null;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscription?: any;
};

export async function confirmPlanChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: { organization_id: string; intent_id: string; canceled?: boolean; actor_user_id?: string },
): Promise<ConfirmPlanChangeResult> {
  const { sub, pending, metadata } = await readPending(supabase, args.organization_id);

  if (args.canceled) {
    if (pending?.intent_id === args.intent_id && sub) {
      await supabase
        .from("subscriptions")
        .update({ metadata: { ...metadata, pending_change: null } })
        .eq("organization_id", args.organization_id);
    }
    await (
      await import("./checkout.server")
    ).insertBillingEvent(supabase, {
      organization_id: args.organization_id,
      provider: pending?.provider ?? "manual",
      event_type: "plan_change.canceled",
      payload: { intent_id: args.intent_id },
    });
    return {
      status: "canceled",
      plan_code: null,
      plan_name: null,
      message: "Checkout canceled — your plan is unchanged.",
    };
  }

  if (!pending || pending.intent_id !== args.intent_id) {
    // Either already reconciled by the webhook, or an unknown intent.
    const code = sub?.plan?.code ?? null;
    return {
      status: sub ? "confirmed" : "unknown",
      plan_code: code,
      plan_name: sub?.plan?.name ?? null,
      message: sub
        ? `You're on ${sub.plan?.name ?? code}.`
        : "No subscription found for this organization.",
      subscription: sub ?? undefined,
    };
  }

  // The gateway webhook may already have switched the plan.
  if (sub?.plan?.id === pending.plan_id) {
    await supabase
      .from("subscriptions")
      .update({ metadata: { ...metadata, pending_change: null } })
      .eq("organization_id", args.organization_id);
    return {
      status: "confirmed",
      plan_code: sub.plan.code,
      plan_name: sub.plan.name,
      message: `Your plan is now ${sub.plan.name}.`,
      subscription: sub,
    };
  }

  // Look for a settled payment / subscription event for this intent.
  const since = pending.created_at;
  const { data: events } = await supabase
    .from("billing_events")
    .select("event_type, payload, created_at")
    .eq("organization_id", args.organization_id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);

  const settled = (events ?? []).some((e: any) => {
    const t = String(e.event_type ?? "");
    return (
      t.startsWith("payment.succeeded") ||
      t.includes("checkout.session.completed") ||
      t.includes("subscription.created") ||
      t.includes("subscription.updated") ||
      t.includes("transaction.completed")
    );
  });

  // Local/manual billing modes never receive a webhook — the return trip is
  // the confirmation signal for them.
  const localMode = !pending.provider || pending.provider === "manual";

  if (settled || localMode) {
    const { data: plan } = await supabase
      .from("plans")
      .select("id, code, name, interval, price_cents")
      .eq("id", pending.plan_id)
      .maybeSingle();
    if (!plan)
      return {
        status: "unknown",
        plan_code: null,
        plan_name: null,
        message: "Target plan no longer exists.",
      };
    // SECURITY: manual mode has no payment proof. A paid plan may only be
    // applied without a settled payment event by a platform super admin.
    if (!settled && Number(plan.price_cents ?? 0) > 0) {
      await assertManualPaidChangeAllowed(supabase, args.actor_user_id);
    }
    const row = await applyPlanEntitlement(supabase, args.organization_id, plan, {
      ...metadata,
      pending_change: null,
      last_change: {
        intent_id: args.intent_id,
        to: plan.code,
        direction: pending.direction,
        at: new Date().toISOString(),
      },
    });
    await (
      await import("./checkout.server")
    ).insertBillingEvent(supabase, {
      organization_id: args.organization_id,
      provider: pending.provider ?? "manual",
      event_type: "plan_change.completed",
      payload: { intent_id: args.intent_id, to: plan.code, direction: pending.direction },
    });
    return {
      status: "confirmed",
      plan_code: plan.code,
      plan_name: plan.name,
      message: `Your plan is now ${plan.name}.`,
      subscription: row,
    };
  }

  return {
    status: "pending",
    plan_code: pending.plan_code,
    plan_name: null,
    message: "Payment received — we're waiting for the gateway to confirm your new plan.",
  };
}

/* -------------------------------------------------------------------------- */
/*  Super admin: apply a plan after an offline payment ("mark as paid")        */
/* -------------------------------------------------------------------------- */

export type AdminApplyPlanResult = {
  plan_code: string;
  plan_name: string;
  direction: PlanChangeDirection;
  current_period_end: string | null;
};

/**
 * Move an organization onto `plan_id` immediately, bypassing checkout.
 *
 * CALLER CONTRACT: the caller MUST have verified the actor is a platform super
 * admin (assertSuperAdmin) and passes the service-role client. Records a
 * `plan.manual_applied` billing event — it deliberately does NOT fabricate a
 * `payment.succeeded` event, so payment/revenue reporting never counts an
 * offline payment as a gateway payment.
 */
export async function adminApplyPlanManually(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  args: { organization_id: string; plan_id: string; actor_user_id: string; note?: string | null },
): Promise<AdminApplyPlanResult> {
  const { data: org, error: orgErr } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("id", args.organization_id)
    .maybeSingle();
  if (orgErr) throw new Error(orgErr.message);
  if (!org) throw new Error("Organization not found");

  const { data: target, error: planErr } = await supabaseAdmin
    .from("plans")
    .select(
      "id, code, name, tier, price_cents, currency, interval, trial_days, features, limits, is_active",
    )
    .eq("id", args.plan_id)
    .maybeSingle();
  if (planErr) throw new Error(planErr.message);
  if (!target) throw new Error("Plan not found");
  if (!target.is_active)
    throw new Error("This plan is inactive — activate it before applying it to an organization.");

  const { sub, metadata } = await readPending(supabaseAdmin, args.organization_id);
  const current = (sub?.plan ?? null) as PlanRow | null;
  const direction = directionFor(current, target as PlanRow);
  const note = args.note?.trim() ? args.note.trim().slice(0, 1000) : null;
  const at = new Date().toISOString();
  const intent_id =
    globalThis.crypto?.randomUUID?.() ??
    `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const row = await applyPlanEntitlement(supabaseAdmin, args.organization_id, target as PlanRow, {
    ...metadata,
    pending_change: null,
    pending_plan_id: null,
    last_change: {
      intent_id,
      to: target.code,
      direction,
      at,
      source: "admin_manual",
      actor_user_id: args.actor_user_id,
    },
  });

  await (
    await import("./checkout.server")
  ).insertBillingEvent(supabaseAdmin, {
    organization_id: args.organization_id,
    provider: "manual",
    event_type: "plan.manual_applied",
    payload: {
      intent_id,
      from: current?.code ?? null,
      to: target.code,
      plan_id: target.id,
      direction,
      price_cents: Number(target.price_cents ?? 0),
      currency: target.currency ?? null,
      interval: target.interval,
      current_period_end: row?.current_period_end ?? null,
      actor_user_id: args.actor_user_id,
      note,
      applied_at: at,
    },
  });

  return {
    plan_code: String(target.code),
    plan_name: String(target.name),
    direction,
    current_period_end: (row?.current_period_end as string | null) ?? null,
  };
}
