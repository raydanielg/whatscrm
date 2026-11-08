import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { getProvider, PAYMENT_PROVIDERS, type PaymentProviderId } from './providers';
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

const providerEnum = z.enum(PAYMENT_PROVIDERS);
const intervalEnum = z.enum(['day', 'week', 'month', 'year']);

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const createPaymentLink = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      provider: providerEnum,
      amount: z.number().positive(),
      currency: z.string().length(3),
      description: z.string().max(500).optional(),
      contactId: z.string().uuid().optional(),
      orderId: z.string().uuid().optional(),
      expiresAt: z.string().datetime().optional().nullable(),
      allowPartial: z.boolean().optional(),
      minAmount: z.number().positive().optional().nullable(),
      isRecurring: z.boolean().optional(),
      recurringInterval: intervalEnum.optional().nullable(),
      recurringCount: z.number().int().positive().optional().nullable(),
      customerEmail: z.string().email().optional().nullable(),
      customerName: z.string().optional().nullable(),
      customerPhone: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertGatewayEnabled } = await import('@/lib/billing/gateway-guard.server');
    await assertGatewayEnabled(context.supabase, data.provider, data.workspaceId);
    const provider = getProvider(data.provider);
    const currency = data.currency.toUpperCase();
    const { platformEnabledCurrencies } = await import('@/lib/currency/resolve.server');
    const enabledCurrencies = await platformEnabledCurrencies();
    if (!enabledCurrencies.includes(currency)) {
      throw new Error(`${currency} is not enabled in Platform Settings`);
    }
    if (provider.currencies.length > 0 && !provider.currencies.some((code) => code.toUpperCase() === currency)) {
      throw new Error(`${provider.displayName} does not support ${currency}`);
    }
    if (data.allowPartial && !provider.supportsPartial) {
      throw new Error(`${provider.displayName} does not support partial payments`);
    }
    if (data.isRecurring && !provider.supportsRecurring) {
      throw new Error(`${provider.displayName} does not support recurring payments`);
    }

    const token = randomToken();
    const result = await provider.createLink({
      amount: data.amount,
      currency,
      description: data.description,
      expiresAt: data.expiresAt,
      allowPartial: data.allowPartial,
      minAmount: data.minAmount,
      isRecurring: data.isRecurring,
      recurringInterval: data.recurringInterval,
      recurringCount: data.recurringCount,
      customerEmail: data.customerEmail,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
    });

    const { data: link, error } = await context.supabase
      .from('commerce_payment_links')
      .insert({
        workspace_id: data.workspaceId,
        contact_id: data.contactId ?? null,
        order_id: data.orderId ?? null,
        token,
        provider: data.provider,
        provider_reference: result.providerReference,
        amount: data.amount,
        currency,
        description: data.description ?? null,
        status: 'active',
        url: result.hostedUrl,
        expires_at: data.expiresAt ?? null,
        allow_partial: data.allowPartial ?? false,
        min_amount: data.minAmount ?? null,
        is_recurring: data.isRecurring ?? false,
        recurring_interval: data.recurringInterval ?? null,
        recurring_count: data.recurringCount ?? null,
        customer_email: data.customerEmail ?? null,
        customer_name: data.customerName ?? null,
        customer_phone: data.customerPhone ?? null,
        created_by: context.userId,
        metadata: result.metadata ?? {},
      } as never)
      .select('id, token, url')
      .single();
    if (error) throw error;

    await sbAny(context.supabase).from('commerce_payment_link_events').insert({
      workspace_id: data.workspaceId,
      payment_link_id: (link as { id: string }).id,
      event_type: 'created',
      actor_user_id: context.userId,
      amount: data.amount,
      currency,
    } as never);

    return link as { id: string; token: string; url: string | null };
  });

export const listPaymentLinks = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      workspaceId: z.string().uuid(),
      status: z.enum(['active', 'paid', 'partially_paid', 'expired', 'cancelled', 'refunded', 'all']).optional(),
      search: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from('commerce_payment_links')
      .select('*')
      .eq('workspace_id', data.workspaceId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (data.status && data.status !== 'all') q = q.eq('status', data.status);
    if (data.search) q = q.or(`description.ilike.%${sanitizeSearchTerm(data.search)}%,customer_email.ilike.%${sanitizeSearchTerm(data.search)}%,customer_name.ilike.%${sanitizeSearchTerm(data.search)}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    type Row = {
      id: string; workspace_id: string; token: string; provider: string; amount: number; currency: string;
      description: string | null; status: string; url: string | null; expires_at: string | null; paid_at: string | null;
      cancelled_at: string | null; allow_partial: boolean; min_amount: number | null; paid_amount: number;
      refunded_amount: number; is_recurring: boolean; recurring_interval: string | null; recurring_count: number | null;
      customer_email: string | null; customer_name: string | null; customer_phone: string | null;
      contact_id: string | null; order_id: string | null; created_at: string; provider_reference: string | null;
    };
    return (rows ?? []) as Row[];
  });

export const getPaymentLinkDetail = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ linkId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: link, error }, { data: events }] = await Promise.all([
      sbAny(context.supabase).from('commerce_payment_links').select('*').eq('id', data.linkId).maybeSingle(),
      context.supabase
        .from('commerce_payment_link_events')
        .select('*')
        .eq('payment_link_id', data.linkId)
        .order('created_at', { ascending: false }),
    ]);
    if (error) throw error;
    return { link, events: events ?? [] };
  });

export const shareLinkEvent = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      linkId: z.string().uuid(),
      workspaceId: z.string().uuid(),
      channel: z.enum(['whatsapp', 'email', 'sms', 'copy']),
      recipient: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from('commerce_payment_link_events').insert({
      workspace_id: data.workspaceId,
      payment_link_id: data.linkId,
      event_type: 'shared',
      channel: data.channel,
      actor_user_id: context.userId,
      metadata: data.recipient ? { recipient: data.recipient } : {},
    } as never);
    if (error) throw error;
    return { ok: true };
  });

export const cancelPaymentLink = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ linkId: z.string().uuid(), workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from('commerce_payment_links')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() } as never)
      .eq('id', data.linkId);
    if (error) throw error;
    await sbAny(context.supabase).from('commerce_payment_link_events').insert({
      workspace_id: data.workspaceId,
      payment_link_id: data.linkId,
      event_type: 'cancelled',
      actor_user_id: context.userId,
    } as never);
    return { ok: true };
  });

export const refundPaymentLink = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      linkId: z.string().uuid(),
      workspaceId: z.string().uuid(),
      amount: z.number().positive(),
      reason: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: link, error: le } = await context.supabase
      .from('commerce_payment_links')
      .select('id, provider, provider_reference, currency, paid_amount, refunded_amount, status')
      .eq('id', data.linkId)
      .maybeSingle();
    if (le) throw le;
    if (!link) throw new Error('Payment link not found');
    const l = link as {
      provider: PaymentProviderId; provider_reference: string | null; currency: string;
      paid_amount: number; refunded_amount: number;
    };
    const refundable = Number(l.paid_amount) - Number(l.refunded_amount);
    if (data.amount > refundable) throw new Error(`Max refundable amount is ${refundable.toFixed(2)}`);

    const provider = getProvider(l.provider);
    if (!provider.supportsRefunds || !provider.refund) {
      throw new Error(`${provider.displayName} does not support refunds`);
    }
    const result = await provider.refund({
      providerReference: l.provider_reference ?? '',
      amount: data.amount,
      currency: l.currency,
      reason: data.reason,
    });

    const newRefunded = Number(l.refunded_amount) + data.amount;
    const fullyRefunded = newRefunded >= Number(l.paid_amount);
    const { error } = await context.supabase
      .from('commerce_payment_links')
      .update({
        refunded_amount: newRefunded,
        status: fullyRefunded ? 'refunded' : 'partially_paid',
      } as never)
      .eq('id', data.linkId);
    if (error) throw error;

    await sbAny(context.supabase).from('commerce_payment_link_events').insert({
      workspace_id: data.workspaceId,
      payment_link_id: data.linkId,
      event_type: 'refunded',
      actor_user_id: context.userId,
      amount: data.amount,
      currency: l.currency,
      metadata: { reason: data.reason ?? null, refund_reference: result.refundReference, status: result.status },
    } as never);
    return { ok: true, status: result.status };
  });

export const markPaymentReceived = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      linkId: z.string().uuid(),
      workspaceId: z.string().uuid(),
      amount: z.number().positive(),
      note: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: link, error: le } = await context.supabase
      .from('commerce_payment_links')
      .select('amount, paid_amount, currency, allow_partial')
      .eq('id', data.linkId)
      .maybeSingle();
    if (le) throw le;
    if (!link) throw new Error('Payment link not found');
    const l = link as { amount: number; paid_amount: number; currency: string; allow_partial: boolean };
    const newPaid = Number(l.paid_amount) + data.amount;
    const isFull = newPaid >= Number(l.amount);
    if (!l.allow_partial && !isFull) throw new Error('Partial payments not allowed for this link');

    const nowIso = new Date().toISOString();
    const { error } = await context.supabase
      .from('commerce_payment_links')
      .update({
        paid_amount: newPaid,
        status: isFull ? 'paid' : 'partially_paid',
        paid_at: isFull ? nowIso : null,
      } as never)
      .eq('id', data.linkId);
    if (error) throw error;

    await sbAny(context.supabase).from('commerce_payment_link_events').insert({
      workspace_id: data.workspaceId,
      payment_link_id: data.linkId,
      event_type: isFull ? 'paid' : 'partial_paid',
      actor_user_id: context.userId,
      amount: data.amount,
      currency: l.currency,
      metadata: { note: data.note ?? null },
    } as never);
    return { ok: true, status: isFull ? 'paid' : 'partially_paid' };
  });

export const listProvidersFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({ workspaceId: z.string().uuid().optional() }).optional().parse(d),
  )
  .handler(async ({ data, context }) => {
    const { listProviders } = await import('./providers');
    const { enabledGatewayIds } = await import('@/lib/billing/gateway-guard.server');
    // Workspace overrides can narrow the platform list further.
    const enabled = new Set(await enabledGatewayIds(context.supabase, data?.workspaceId ?? null));
    return listProviders()
      .filter((p) => enabled.has(p.id))
      .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      currencies: p.currencies,
      supportsPartial: p.supportsPartial,
      supportsRecurring: p.supportsRecurring,
      supportsRefunds: p.supportsRefunds,
    }));
  });
