/**
 * Billing Automation — admin server functions (read + update per-org config).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgOnly = z.object({ organization_id: z.string().uuid() });

const configSchema = z.object({
  organization_id: z.string().uuid(),
  notify_trial_ending: z.boolean().optional(),
  notify_payment_failed: z.boolean().optional(),
  notify_payment_succeeded: z.boolean().optional(),
  notify_invoice_generated: z.boolean().optional(),
  notify_invoice_due: z.boolean().optional(),
  notify_subscription_renewed: z.boolean().optional(),
  notify_subscription_expired: z.boolean().optional(),
  notify_usage_limit_reached: z.boolean().optional(),
  notify_quota_warning: z.boolean().optional(),
  notify_upgrade_recommendation: z.boolean().optional(),
  trial_ending_warning_days: z.number().int().min(0).max(60).optional(),
  invoice_due_reminder_days: z.number().int().min(0).max(60).optional(),
  quota_warning_threshold_pct: z.number().int().min(0).max(100).optional(),
  payment_retry_hours: z.array(z.number().int().min(0).max(720)).max(10).optional(),
  max_payment_retries: z.number().int().min(0).max(20).optional(),
  grace_period_days: z.number().int().min(0).max(90).optional(),
  auto_suspend_after_grace: z.boolean().optional(),
  auto_reactivate_on_payment: z.boolean().optional(),
  channels: z.array(z.enum(["email", "in_app", "whatsapp", "sms"])).optional(),
});

const DEFAULTS = {
  notify_trial_ending: true,
  notify_payment_failed: true,
  notify_payment_succeeded: true,
  notify_invoice_generated: true,
  notify_invoice_due: true,
  notify_subscription_renewed: true,
  notify_subscription_expired: true,
  notify_usage_limit_reached: true,
  notify_quota_warning: true,
  notify_upgrade_recommendation: true,
  trial_ending_warning_days: 3,
  invoice_due_reminder_days: 3,
  quota_warning_threshold_pct: 80,
  payment_retry_hours: [1, 24, 72],
  max_payment_retries: 3,
  grace_period_days: 7,
  auto_suspend_after_grace: true,
  auto_reactivate_on_payment: true,
  channels: ["email", "in_app"],
};

export const getAutomationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => orgOnly.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("billing_automation_config")
      .select("*")
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    return { ...DEFAULTS, organization_id: data.organization_id, ...(row ?? {}) };
  });

export const updateAutomationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => configSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { organization_id, ...patch } = data;
    const { data: existing } = await supabase
      .from("billing_automation_config")
      .select("id")
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (existing) {
      const { data: updated, error } = await supabase
        .from("billing_automation_config")
        .update(patch)
        .eq("organization_id", organization_id)
        .select("*")
        .single();
      if (error) throw error;
      return updated;
    }
    const { data: inserted, error } = await supabase
      .from("billing_automation_config")
      .insert({ organization_id, ...DEFAULTS, ...patch })
      .select("*")
      .single();
    if (error) throw error;
    return inserted;
  });

export const runAutomationNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => orgOnly.parse(i))
  .handler(async ({ context }) => {
    // Runs platform-wide with the service role: super admins only.
    const { assertSuperAdmin } = await import("@/lib/admin/platform-guard.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { runBillingAutomation } = await import("@/lib/billing/automation.server");
    const result = await runBillingAutomation(supabaseAdmin);
    return JSON.parse(JSON.stringify(result)) as Record<string, string | number | boolean>;
  });

export const manualSuspend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z
      .object({ subscription_id: z.string().uuid(), reason: z.string().max(120).optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin/platform-guard.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: sub, error } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("id", data.subscription_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) throw new Error("Subscription not found");
    const { suspendAccount } = await import("@/lib/billing/automation.server");
    await suspendAccount(supabaseAdmin, data.subscription_id, data.reason ?? "manual");
    return { ok: true };
  });

export const manualReactivate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ subscription_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin/platform-guard.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { reactivateAccount } = await import("@/lib/billing/automation.server");
    const ok = await reactivateAccount(supabaseAdmin, data.subscription_id);
    return { ok };
  });

export const listRecentNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => orgOnly.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("billing_notifications")
      .select("id, kind, status, subject, body, scheduled_for, sent_at, error, created_at")
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false })
      .limit(50);
    return rows ?? [];
  });
