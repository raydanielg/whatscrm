import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SalesOverviewMetrics } from './types';
import { sbAny } from "@/lib/supabase/untyped";
import { resolveAggregateCurrency } from "@/lib/currency/resolve.server";

const wsSchema = z.object({ workspaceId: z.string().uuid() });

/** High-level KPIs for the Sales overview dashboard. */
export const getSalesOverview = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => wsSchema.parse(d))
  .handler(async ({ data, context }): Promise<SalesOverviewMetrics> => {
    const { supabase } = context;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [openDeals, wonDeals, invoices, quotes] = await Promise.all([
      sbAny(supabase).from('deals').select('amount, currency, status')
        .eq('workspace_id', data.workspaceId).eq('status', 'open').is('deleted_at', null),
      sbAny(supabase).from('deals').select('amount, currency, actual_close_date')
        .eq('workspace_id', data.workspaceId).eq('status', 'won')
        .gte('actual_close_date', monthStart.slice(0, 10)),
      sbAny(supabase).from('invoices').select('amount_due, status, due_date')
        .eq('workspace_id', data.workspaceId).is('deleted_at', null)
        .in('status', ['sent', 'viewed', 'partial', 'overdue']),
      sbAny(supabase).from('quotes').select('id, status')
        .eq('workspace_id', data.workspaceId).is('deleted_at', null)
        .in('status', ['sent', 'viewed']),
    ]);

    const sum = (rows: { amount?: number | null }[] | null, key: 'amount' | 'amount_due' = 'amount') =>
      (rows || []).reduce((acc, r) => acc + Number((r as Record<string, unknown>)[key] ?? 0), 0);

    const inv = invoices.data || [];
    // Was `rows[0].currency || 'USD'`: a concrete "USD" from the server defeats
    // the client's tenant-currency fallback, and row zero also mislabels a
    // mixed-currency pipeline. Resolved against the workspace instead.
    const currency = await resolveAggregateCurrency(
      (openDeals.data ?? []) as Array<{ currency?: string | null }>,
      data.workspaceId,
    );

    return {
      open_deals_value: sum(openDeals.data),
      won_this_month: sum(wonDeals.data),
      outstanding_invoices: inv.reduce((a, r) => a + Number(r.amount_due || 0), 0),
      overdue_invoices: inv.filter(r => r.status === 'overdue').reduce((a, r) => a + Number(r.amount_due || 0), 0),
      quotes_pending: (quotes.data || []).length,
      currency,
    };
  });

/** Allocate the next quote/invoice number for a workspace via the SECURITY DEFINER RPC. */
export const nextDocumentNumber = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; kind: 'quote' | 'invoice' }) =>
    z.object({ workspaceId: z.string().uuid(), kind: z.enum(['quote', 'invoice']) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: n, error } = await sbAny(context.supabase).rpc(
      'next_document_number' as never,
      { _ws: data.workspaceId, _kind: data.kind } as never,
    );
    if (error) throw error;
    return { number: n as unknown as string };
  });
