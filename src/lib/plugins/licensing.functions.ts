/**
 * Plugin Licensing & Marketplace Monetization — server functions.
 *
 * Covers activation, validation, revocation, marketplace purchases (free/paid),
 * subscription lifecycle, trials, usage analytics, revenue sharing, and the
 * vendor dashboard read model. All mutations run as the signed-in user under
 * RLS; privileged writes (revenue share calc, payouts) load supabaseAdmin
 * inside the handler.
 */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { generateLicenseKey, DEFAULT_PUBLISHER_SHARE_BPS, splitRevenue } from './license';
import { sbAny } from "@/lib/supabase/untyped";

// ---------- activation ----------
export const activateLicense = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z.object({
      licenseKey: z.string(),
      workspaceId: z.string().uuid(),
      installationId: z.string().uuid().optional(),
      deviceFingerprint: z.string().optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: license, error } = await supabase
      .from('plugin_licenses')
      .select('*')
      .eq('license_key', data.licenseKey.trim())
      .maybeSingle();
    if (error) throw error;
    if (!license) throw new Error('License key not found');
    if (license.status !== 'active') throw new Error(`License is ${license.status}`);
    if (license.expires_at && new Date(license.expires_at).getTime() < Date.now())
      throw new Error('License has expired');
    if (license.seats_used >= license.seats) throw new Error('License seat limit reached');

    const { error: aErr } = await sbAny(supabase).from('plugin_license_activations').upsert(
      {
        license_id: license.id,
        workspace_id: data.workspaceId,
        installation_id: data.installationId ?? null,
        activated_by: userId,
        device_fingerprint: data.deviceFingerprint ?? null,
        last_validated_at: new Date().toISOString(),
        deactivated_at: null,
      },
      { onConflict: 'license_id,workspace_id' },
    );
    if (aErr) throw aErr;
    await sbAny(supabase).from('plugin_licenses')
      .update({ seats_used: license.seats_used + 1, customer_workspace_id: data.workspaceId, customer_user_id: userId })
      .eq('id', license.id);
    return { ok: true, licenseId: license.id, pluginId: license.plugin_id };
  });

// ---------- validation ----------
export const validateActivation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ licenseKey: z.string(), workspaceId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: license } = await context.supabase
      .from('plugin_licenses')
      .select('id, status, license_type, expires_at, seats, seats_used')
      .eq('license_key', data.licenseKey.trim())
      .maybeSingle();
    if (!license) return { valid: false, reason: 'not_found' };
    if (license.status === 'revoked') return { valid: false, reason: 'revoked' };
    if (license.status === 'expired') return { valid: false, reason: 'expired' };
    if (license.expires_at && new Date(license.expires_at).getTime() < Date.now())
      return { valid: false, reason: 'expired' };

    await sbAny(context.supabase).from('plugin_license_activations')
      .update({ last_validated_at: new Date().toISOString() })
      .eq('license_id', license.id)
      .eq('workspace_id', data.workspaceId);
    return {
      valid: true,
      type: license.license_type,
      expiresAt: license.expires_at,
      seats: license.seats,
      seatsUsed: license.seats_used,
    };
  });

// ---------- revocation ----------
export const revokeLicense = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ licenseId: z.string().uuid(), reason: z.string().max(200).optional() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: license } = await sbAny(supabase).from('plugin_licenses').select('publisher_id').eq('id', data.licenseId).maybeSingle();
    if (!license) throw new Error('License not found');
    if (license.publisher_id !== userId) throw new Error('Only the publisher can revoke this license');

    const { error } = await sbAny(supabase).from('plugin_licenses').update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoke_reason: data.reason ?? null,
    }).eq('id', data.licenseId);
    if (error) throw error;
    await sbAny(supabase).from('plugin_license_activations')
      .update({ deactivated_at: new Date().toISOString() })
      .eq('license_id', data.licenseId);
    return { ok: true };
  });

// ---------- issue: free / paid / trial ----------
export const issueLicense = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z.object({
      pluginId: z.string().uuid(),
      customerUserId: z.string().uuid().optional(),
      customerWorkspaceId: z.string().uuid().optional(),
      licenseType: z.enum(['free', 'perpetual', 'subscription', 'trial']),
      seats: z.number().int().min(1).max(10_000).default(1),
      priceCents: z.number().int().min(0).default(0),
      currency: z.string().length(3).default('USD'),
      expiresAt: z.string().datetime().optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: plugin } = await sbAny(supabase).from('plugins').select('id, publisher_id').eq('id', data.pluginId).maybeSingle();
    if (!plugin) throw new Error('Plugin not found');
    if (plugin.publisher_id !== userId) throw new Error('Forbidden');

    const { adminIssueLicense } = await import('./server/licensing.server');
    return adminIssueLicense(data);
  });

// ---------- marketplace purchase ----------
export const purchasePlugin = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z.object({
      pluginId: z.string().uuid(),
      workspaceId: z.string().uuid(),
      gateway: z.enum(['stripe', 'paddle', 'manual']).default('manual'),
      gatewayReference: z.string().optional(),
      amountCents: z.number().int().min(0).default(0),
      currency: z.string().length(3).default('USD'),
      licenseType: z.enum(['free', 'perpetual', 'subscription']).default('perpetual'),
      seats: z.number().int().min(1).default(1),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: plugin } = await sbAny(supabase).from('plugins').select('id, publisher_id').eq('id', data.pluginId).maybeSingle();
    if (!plugin) throw new Error('Plugin not found');

    const { adminPurchasePlugin } = await import('./server/licensing.server');
    return adminPurchasePlugin(data, userId);
  });

// ---------- subscription ----------
export const upsertSubscription = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z.object({
      licenseId: z.string().uuid(),
      pluginId: z.string().uuid(),
      interval: z.enum(['week', 'month', 'year']),
      intervalCount: z.number().int().min(1).max(24).default(1),
      amountCents: z.number().int().min(0),
      currency: z.string().length(3).default('USD'),
      currentPeriodEnd: z.string().datetime(),
      gateway: z.string().optional(),
      gatewaySubscriptionId: z.string().optional(),
      cancelAtPeriodEnd: z.boolean().optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from('plugin_subscriptions').upsert({
      license_id: data.licenseId,
      plugin_id: data.pluginId,
      interval: data.interval,
      interval_count: data.intervalCount,
      amount_cents: data.amountCents,
      currency: data.currency,
      current_period_start: new Date().toISOString(),
      current_period_end: data.currentPeriodEnd,
      cancel_at_period_end: data.cancelAtPeriodEnd ?? false,
      gateway: data.gateway ?? null,
      gateway_subscription_id: data.gatewaySubscriptionId ?? null,
      status: 'active',
    }, { onConflict: 'license_id' });
    if (error) throw error;
    return { ok: true };
  });

export const cancelSubscription = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ subscriptionId: z.string().uuid(), atPeriodEnd: z.boolean().default(true) }).parse(raw))
  .handler(async ({ data, context }) => {
    const patch = data.atPeriodEnd
      ? { cancel_at_period_end: true }
      : { status: 'cancelled', cancelled_at: new Date().toISOString() };
    const { error } = await sbAny(context.supabase).from('plugin_subscriptions').update(patch).eq('id', data.subscriptionId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- trial ----------
export const startTrial = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z.object({
      pluginId: z.string().uuid(),
      workspaceId: z.string().uuid(),
      trialDays: z.number().int().min(1).max(90).default(14),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: plugin } = await sbAny(supabase).from('plugins').select('id, publisher_id').eq('id', data.pluginId).maybeSingle();
    if (!plugin) throw new Error('Plugin not found');

    const { adminStartTrial } = await import('./server/licensing.server');
    return adminStartTrial(data, userId);
  });

// ---------- usage events ----------
export const recordUsage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z.object({
      pluginId: z.string().uuid(),
      licenseId: z.string().uuid().optional(),
      workspaceId: z.string().uuid().optional(),
      eventName: z.string().min(1).max(80),
      quantity: z.number().min(0).default(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from('plugin_usage_events').insert({
      plugin_id: data.pluginId,
      license_id: data.licenseId ?? null,
      workspace_id: data.workspaceId ?? null,
      event_name: data.eventName,
      quantity: data.quantity,
      metadata: (data.metadata ?? {}) as any,
    });
    if (error) throw error;
    return { ok: true };
  });

// ---------- download log ----------
export const recordDownload = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z.object({
      pluginId: z.string().uuid(),
      versionId: z.string().uuid().optional(),
      workspaceId: z.string().uuid().optional(),
    }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from('plugin_downloads').insert({
      plugin_id: data.pluginId,
      version_id: data.versionId ?? null,
      workspace_id: data.workspaceId ?? null,
      user_id: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

// ---------- vendor dashboard ----------
export const getVendorDashboard = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [pluginsRes, salesRes, sharesRes, downloadsRes, activationsRes, payoutsRes] = await Promise.all([
      sbAny(supabase).from('plugins').select('id, slug, name, price_cents, currency, pricing_model, status').eq('publisher_id', userId),
      sbAny(supabase).from('plugin_purchases').select('id, plugin_id, amount_cents, currency, status, purchased_at')
        .eq('publisher_id', userId).gte('purchased_at', since30).order('purchased_at', { ascending: false }).limit(500),
      sbAny(supabase).from('plugin_revenue_shares').select('publisher_share_cents, currency, status, created_at')
        .eq('publisher_id', userId),
      sbAny(supabase).from('plugin_downloads').select('plugin_id, occurred_at').gte('occurred_at', since30).limit(2000),
      sbAny(supabase).from('plugin_licenses').select('id, plugin_id, status, license_type').eq('publisher_id', userId),
      sbAny(supabase).from('plugin_payouts').select('*').eq('publisher_id', userId).order('created_at', { ascending: false }).limit(20),
    ]);

    const grossRevenue = (salesRes.data ?? []).reduce((s, p) => s + (p.status === 'paid' ? p.amount_cents : 0), 0);
    const netRevenue = (sharesRes.data ?? []).reduce((s, r) => s + (r.status === 'paid' ? r.publisher_share_cents : 0), 0);
    const pendingRevenue = (sharesRes.data ?? []).reduce((s, r) => s + (r.status === 'pending' ? r.publisher_share_cents : 0), 0);
    const activeLicenses = (activationsRes.data ?? []).filter((l) => l.status === 'active').length;

    return {
      plugins: pluginsRes.data ?? [],
      recentSales: salesRes.data ?? [],
      downloads: downloadsRes.data ?? [],
      licenses: activationsRes.data ?? [],
      payouts: payoutsRes.data ?? [],
      stats: {
        grossRevenue,
        netRevenue,
        pendingRevenue,
        activeLicenses,
        totalPlugins: (pluginsRes.data ?? []).length,
        salesCount30d: (salesRes.data ?? []).length,
        downloadCount30d: (downloadsRes.data ?? []).length,
      },
    };
  });
